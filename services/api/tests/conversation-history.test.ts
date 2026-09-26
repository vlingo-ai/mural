import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { digest } from '../src/auth.js';
import { connectDatabase } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { parseConversationEvent, parseHistoryPage, conversationEventsPage, persistWorkerHistory, historyEventDigest } from '../src/conversation-history.js';

test('history cursor is bounded and session scoped', () => {
  assert.equal(historyEventDigest({ eventID: 'worker.execution.item', speaker: 'user', text: 'Synthetic é 🐈\n', source: 'live' }),
    'b369e64f7954cc2a5304ab19c16b1f50c6fe9cf03bef5050b73c737ef01df41e');
  const id = randomUUID();
  assert.deepEqual(parseHistoryPage({}, id), { after: '0', limit: 50 });
  const cursor = Buffer.from(`1:${id}:9007199254740993`).toString('base64url');
  assert.equal(parseHistoryPage({ cursor, limit: '1' }, id).after, '9007199254740993');
  for (const query of [{ cursor: 'bad' }, { cursor, limit: '101' }, { limit: '1.0' },
    { limit: ['1'] }, { unknown: true }, { cursor: Buffer.from(`1:${id}:9223372036854775808`).toString('base64url') }])
    assert.throws(() => parseHistoryPage(query, id), { code: 'invalid_history_page' });
  assert.throws(() => parseHistoryPage({ cursor }, randomUUID()), { code: 'invalid_history_page' });
});

test('conversation event parser keeps only bounded transcript evidence', () => {
  assert.deepEqual(parseConversationEvent({ eventID: 'live.event-1', speaker: 'user', text: '  hello  ', source: 'live' }),
    { eventID: 'live.event-1', speaker: 'user', text: '  hello  ', source: 'live' });
  for (const value of [
    {}, { eventID: 'x', speaker: 'system', text: 'hello', source: 'live' },
    { eventID: 'x', speaker: 'user', text: '', source: 'live' },
    { eventID: 'x', speaker: 'user', text: 'hello', source: 'provider' },
    { eventID: 'x', speaker: 'user', text: 'hello', source: 'live', model: 'gpt-live-1' },
    { eventID: 'bad id', speaker: 'user', text: 'hello', source: 'typed' },
  ]) assert.throws(() => parseConversationEvent(value), { code: 'invalid_conversation_event' });
});

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL && !new URL(databaseURL).pathname.endsWith('_test')) throw new Error('Dedicated test database required.');
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !databaseURL && 'Set TEST_DATABASE_URL.' }, fn);
let db: ReturnType<typeof connectDatabase> | undefined, schema = '';
before(async () => {
  if (!databaseURL) return;
  schema = `conversation_history_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(databaseURL); url.searchParams.set('options', `-c search_path=${schema}`);
  const admin = connectDatabase(databaseURL); await admin.query(`CREATE SCHEMA ${schema}`); await admin.end();
  db = connectDatabase(url.toString()); await migrate(db);
});
after(async () => {
  if (!db) return;
  await db.end(); const admin = connectDatabase(databaseURL!); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
});

integration('conversation history is owner-scoped, idempotent and returned in server order', async () => {
  const account = randomUUID(), other = randomUUID(), token = randomBytes(32).toString('base64url');
  const session = randomUUID(), reservation = randomUUID();
  await db!.query('INSERT INTO accounts(id) VALUES($1),($2)', [account, other]);
  await db!.query('INSERT INTO wallets(account_id) VALUES($1),($2)', [account, other]);
  await db!.query("INSERT INTO auth_sessions(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [randomUUID(), account, digest(token)]);
  await db!.query("INSERT INTO reservations(id,account_id,idempotency_key,reserved_nano,rate_version,state) VALUES($1,$2,'history-hold',1,'test','open')",
    [reservation, account]);
  await db!.query(`INSERT INTO hosted_sessions(id,account_id,idempotency_key,reservation_id,rate_version,state,deadline,
    funding_exposure_nano,language) VALUES($1,$2,'history-session',$3,'test','closed',now(),1,'en')`,
  [session, account, reservation]);
  const app = createApp({ db: db!, auth: {} }), headers = { authorization: `Bearer ${token}` };
  try {
    const payload = { eventID: 'provider-event-1', speaker: 'user', text: 'Hello', source: 'live' };
    const first = await app.inject({ method: 'POST', url: `/v1/conversations/${session}/events`, headers, payload });
    const duplicate = await app.inject({ method: 'POST', url: `/v1/conversations/${session}/events`, headers, payload });
    assert.equal(first.statusCode, 200); assert.equal(first.json().duplicate, false);
    assert.deepEqual(duplicate.json(), { accepted: true, duplicate: true });
    const conflict = await app.inject({ method: 'POST', url: `/v1/conversations/${session}/events`, headers,
      payload: { ...payload, text: 'Conflicting synthetic text' } });
    assert.equal(conflict.statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${session}/events`, headers,
      payload: { ...payload, eventID: 'worker.forged' } })).statusCode, 400);
    const detail = await app.inject({ method: 'GET', url: `/v1/conversations/${session}`, headers });
    assert.equal(detail.statusCode, 200); assert.equal(detail.json().events.length, 1);
    assert.equal(detail.json().events[0].text, 'Hello'); assert.equal(detail.json().language, 'en');
    const list = await app.inject({ method: 'GET', url: '/v1/conversations', headers });
    assert.equal(list.statusCode, 200); assert.equal(list.json().conversations[0].preview, 'Hello');
    assert.equal((await app.inject({ method: 'GET', url: `/v1/conversations/${randomUUID()}`, headers })).statusCode, 404);
    for (let i = 2; i <= 4; i++) assert.equal((await app.inject({ method: 'POST',
      url: `/v1/conversations/${session}/events`, headers, payload: { ...payload, eventID: `event-${i}` } })).statusCode, 200);
    const page = await app.inject({ method: 'GET', url: `/v1/conversations/${session}/events?limit=2`, headers });
    assert.equal(page.statusCode, 200); assert.equal(page.json().hasMore, true);
    assert.equal(page.json().events.length, 2);
    const second = await app.inject({ method: 'GET',
      url: `/v1/conversations/${session}/events?limit=2&cursor=${page.json().nextCursor}`, headers });
    assert.equal(second.json().hasMore, false);
    assert.deepEqual(second.json().events.map((e: {eventID: string}) => e.eventID), ['event-3', 'event-4']);
    const empty = await conversationEventsPage(db!, account, session, { cursor: second.json().nextCursor });
    assert.deepEqual(empty.events, []); assert.equal(empty.nextCursor, second.json().nextCursor);
    await assert.rejects(conversationEventsPage(db!, other, session, {}), { code: 'conversation_not_found' });
    assert.equal((await app.inject({ method: 'GET', url: `/v1/conversations/${session}/events?limit=0`, headers })).statusCode, 400);

    // One writer holds the allocation lock until commit; a second cannot publish
    // a higher cursor before it. Read during the transaction sees no new events.
    const a = await db!.connect(), b = await db!.connect();
    try {
      await a.query('BEGIN'); await b.query('BEGIN');
      const insert = `INSERT INTO conversation_events(id,session_id,provider_event_id,speaker,text,source)
        VALUES($1,$2,$3,'user','Synthetic concurrency fixture','live') RETURNING position`;
      const firstPosition = (await a.query(insert, [randomUUID(), session, 'concurrent-a'])).rows[0].position;
      const pending = b.query(insert, [randomUUID(), session, 'concurrent-b']);
      assert.deepEqual((await conversationEventsPage(db!, account, session, { cursor: empty.nextCursor })).events, []);
      await a.query('COMMIT');
      const secondPosition = (await pending).rows[0].position;
      assert.equal(BigInt(secondPosition), BigInt(firstPosition) + 1n);
      await b.query('COMMIT');
      const recovered = await conversationEventsPage(db!, account, session, { cursor: empty.nextCursor });
      assert.deepEqual(recovered.events.map(e => e.eventID), ['concurrent-a', 'concurrent-b']);
    } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    const final = { eventID: 'worker.execution.final', speaker: 'assistant' as const, text: 'Synthetic final', source: 'live' as const };
    await assert.rejects(persistWorkerHistory(db!, session, final), { code: 'livekit_session_not_attached' });
    await db!.query('UPDATE hosted_sessions SET provider_session_id=$2 WHERE id=$1', [session, 'local-fixture-room']);
    await assert.rejects(persistWorkerHistory(db!, session, final), { code: 'invalid_conversation_event' });
    await db!.query("UPDATE hosted_sessions SET history_authority='worker' WHERE id=$1", [session]);
    for (const source of ['live', 'typed']) {
      const ignored = await app.inject({ method: 'POST', url: `/v1/conversations/${session}/events`, headers,
        payload: { ...payload, eventID: `old-browser-${source}`, source } });
      assert.deepEqual(ignored.json(), { accepted: true, duplicate: false, ignored: true });
    }
    assert.equal((await db!.query("SELECT count(*) FROM conversation_events WHERE session_id=$1 AND provider_event_id LIKE 'old-browser-%'", [session])).rows[0].count, '0');
    const ack = await persistWorkerHistory(db!, session, final);
    assert.deepEqual(ack, { accepted: true, committed: true, eventID: final.eventID, digest: historyEventDigest(final) });
    assert.deepEqual(await persistWorkerHistory(db!, session, final), ack);
    await assert.rejects(persistWorkerHistory(db!, session, { ...final, text: 'Conflicting final' }), { code: 'conversation_event_conflict' });
    assert.equal((await db!.query('SELECT count(*) FROM conversation_events WHERE session_id=$1 AND provider_event_id=$2',
      [session, final.eventID])).rows[0].count, '1');
  } finally { await app.close(); }
});
