import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { digest } from '../src/auth.js';
import { connectDatabase } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { parseConversationEvent } from '../src/conversation-history.js';

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
    const detail = await app.inject({ method: 'GET', url: `/v1/conversations/${session}`, headers });
    assert.equal(detail.statusCode, 200); assert.equal(detail.json().events.length, 1);
    assert.equal(detail.json().events[0].text, 'Hello'); assert.equal(detail.json().language, 'en');
    const list = await app.inject({ method: 'GET', url: '/v1/conversations', headers });
    assert.equal(list.statusCode, 200); assert.equal(list.json().conversations[0].preview, 'Hello');
    assert.equal((await app.inject({ method: 'GET', url: `/v1/conversations/${randomUUID()}`, headers })).statusCode, 404);
  } finally { await app.close(); }
});
