import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { AccountModelTasks, type AccountModelTaskConfig } from '../src/account-model-tasks.js';
import { createApp } from '../src/app.js';
import { digest } from '../src/auth.js';
import { connectDatabase, transaction } from '../src/db.js';
import { HOSTED_HELPER_MODEL, type HostedResponsesTransport } from '../src/hosted-helpers.js';
import { appendEntry, paidAIBalance } from '../src/ledger.js';
import { migrate } from '../src/migrate.js';
import { modelTaskHelperInput, parseModelTask } from '../src/model-tasks.js';

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL && !new URL(databaseURL).pathname.endsWith('_test')) throw new Error('Dedicated test database required.');
const schema = `account_tasks_${randomUUID().replaceAll('-', '')}`, url = databaseURL ? new URL(databaseURL) : null;
url?.searchParams.set('options', `-c search_path=${schema}`);
const db = url ? connectDatabase(url.toString()) : null;
before(async () => { if (db) { await db.query(`CREATE SCHEMA ${schema}`); await migrate(db); } });
beforeEach(async () => { if (db) await db.query('TRUNCATE accounts CASCADE'); });
after(async () => { if (db) { try { await db.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await db.end(); } } });
const integration = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !db && 'Set TEST_DATABASE_URL.' }, fn);

const config: AccountModelTaskConfig = { maxRequestsPerMinute: 3, maxConcurrentPerAccount: 1,
  maxConcurrentGlobal: 4, inputFramingTokenAllowance: 4096, searchInputTokenAllowance: 1_050_000,
  timeoutMilliseconds: 1_000 };
const response = (extra: Record<string, unknown> = {}) => ({ id: `resp_${randomUUID().replaceAll('-', '')}`,
  model: HOSTED_HELPER_MODEL, service_tier: 'default', status: 'completed',
  output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'A current topic.',
    annotations: [{ type: 'url_citation', title: 'Example', url: 'https://example.com/current' }] }] }],
  usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 }, output_tokens: 40 }, ...extra });

async function member(balance = 2_000_000_000n) {
  const account = randomUUID(), token = randomBytes(32).toString('base64url');
  await db!.query('INSERT INTO accounts(id,is_guest) VALUES($1,false)', [account]);
  await db!.query('INSERT INTO wallets(account_id) VALUES($1)', [account]);
  await transaction(db!, sql => appendEntry(sql, account, `seed:${account}`, 'purchase', balance, 0n));
  await db!.query("INSERT INTO auth_sessions(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [randomUUID(), account, digest(token)]);
  return { account, token };
}
function topic(account: string, key: string) {
  const task = parseModelTask({ kind: 'topicSearch', funding: { type: 'account' }, language: 'en', query: 'today in science' });
  return modelTaskHelperInput(account, key, task);
}

integration('account-funded topic search settles trusted usage through the public route exactly once', async () => {
  const owner = await member(); let calls = 0;
  const transport: HostedResponsesTransport = { async send() { calls++; return response(); } };
  const tasks = new AccountModelTasks(db!, transport, config), app = createApp({ db: db!, auth: {}, accountModelTasks: tasks });
  try {
    const requestID = 'standalone-topic-1';
    const request = { method: 'POST' as const, url: '/v1/model-tasks', headers: {
      authorization: `Bearer ${owner.token}`, 'idempotency-key': requestID },
      payload: { kind: 'topicSearch', funding: { type: 'account' }, language: 'en', query: 'today in science' } };
    const result = await app.inject(request);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json(), { kind: 'topicSearch', text: 'A current topic.',
      sources: [{ title: 'Example', url: 'https://example.com/current' }],
      usage: { inputTokens: 100, outputTokens: 40, searchCalls: 1 } });
    assert.equal((await app.inject(request)).statusCode, 409); assert.equal(calls, 1);
    assert.deepEqual(await paidAIBalance(db!, owner.account), { balanceNanoUSD: '1989934100', reservedNanoUSD: '0',
      availableNanoUSD: '1989934100', cashProvenanceVerified: true });
    const stored = (await db!.query('SELECT state,purpose,search_requested,input_tokens,output_tokens,search_calls,cost_nano FROM account_model_tasks')).rows[0];
    assert.deepEqual(stored, { state: 'settled', purpose: 'topic', search_requested: true, input_tokens: '100',
      output_tokens: '40', search_calls: 1, cost_nano: '10065900' });
    await assert.rejects(db!.query('UPDATE account_model_tasks SET hold_nano=1'));
  } finally { await app.close(); }
});

integration('unknown standalone provider outcome retains its exact hold and cannot be retried', async () => {
  const owner = await member(); let calls = 0;
  const tasks = new AccountModelTasks(db!, { async send() { calls++; throw new Error('unknown'); } }, config);
  const input = topic(owner.account, 'standalone-unknown');
  await assert.rejects(tasks.request(owner.account, input), { code: 'model_task_response_uncertain' });
  await assert.rejects(tasks.request(owner.account, input), { code: 'model_task_already_attempted' });
  const attempt = (await db!.query('SELECT state,hold_nano,reservation_id FROM account_model_tasks')).rows[0];
  assert.equal(attempt.state, 'uncertain'); assert.equal(calls, 1);
  assert.equal((await paidAIBalance(db!, owner.account)).reservedNanoUSD, attempt.hold_nano);
  assert.equal((await db!.query("SELECT state FROM reservations WHERE id=$1", [attempt.reservation_id])).rows[0].state, 'open');
});

integration('standalone funding rejects guests, unverified cash and non-topic helper purposes before provider use', async () => {
  const owner = await member(); let calls = 0;
  const tasks = new AccountModelTasks(db!, { async send() { calls++; return response(); } }, config);
  const guest = randomUUID(); await db!.query('INSERT INTO accounts(id,is_guest) VALUES($1,true)', [guest]);
  await db!.query('INSERT INTO wallets(account_id,balance_nano) VALUES($1,2000000000)', [guest]);
  await assert.rejects(tasks.request(guest, topic(guest, 'guest-topic-key')), { code: 'sign_in_required' });
  await db!.query('UPDATE wallets SET cash_provenance_verified=false WHERE account_id=$1', [owner.account]);
  await assert.rejects(tasks.request(owner.account, topic(owner.account, 'unverified-topic')), { code: 'cash_balance_reconciliation_required' });
  const wrong = { ...topic(owner.account, 'wrong-purpose'), purpose: 'meaning', search: undefined };
  await assert.rejects(tasks.request(owner.account, wrong), { code: 'account_model_task_not_allowed' });
  assert.equal(calls, 0);
});

integration('provider hold overrun preserves the reservation, records immutable evidence and blocks further standalone calls', async () => {
  const owner = await member();
  const tasks = new AccountModelTasks(db!, { async send() { return response({
    usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 }, output_tokens: 1_000_000 },
  }); } }, config);
  await assert.rejects(tasks.request(owner.account, topic(owner.account, 'breached-topic')), { code: 'model_task_provider_limit_exceeded' });
  assert.deepEqual((await db!.query('SELECT state,limit_breached,search_calls FROM account_model_tasks')).rows[0],
    { state: 'uncertain', limit_breached: true, search_calls: null });
  assert.equal((await db!.query('SELECT reason,provider_cost_nano FROM account_model_task_reconciliation')).rows[0].reason, 'hold_exceeded');
  await assert.rejects(db!.query('DELETE FROM account_model_task_reconciliation'));
  await assert.rejects(tasks.request(owner.account, topic(owner.account, 'blocked-after-breach')),
    { code: 'model_task_provider_reconciliation_required' });
});

integration('restricted runtime can settle standalone work without rewriting funding or billing evidence', async () => {
  const owner = await member(), role = `account_task_runtime_${randomUUID().replaceAll('-', '')}`;
  await db!.query(`CREATE ROLE ${role}; GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await db!.query(`GRANT SELECT ON accounts TO ${role}; GRANT UPDATE(deleted_at) ON accounts TO ${role}`);
  for (const file of ['actual-value-runtime-grants.sql', 'account-model-task-runtime-grants.sql']) {
    const grants = await readFile(new URL(`../operations/${file}`, import.meta.url), 'utf8');
    await db!.query(grants.replaceAll('mural_runtime', role));
  }
  const runtimeURL = new URL(databaseURL!);
  runtimeURL.searchParams.set('options', `-c search_path=${schema} -c role=${role}`);
  const runtime = connectDatabase(runtimeURL.toString());
  try {
    const tasks = new AccountModelTasks(runtime, { async send() { return response(); } }, config);
    await tasks.request(owner.account, topic(owner.account, 'runtime-topic-key'));
    for (const statement of ['UPDATE account_model_tasks SET hold_nano=1', 'DELETE FROM account_model_tasks',
      'DELETE FROM account_model_task_reconciliation', 'UPDATE reservations SET reserved_nano=1',
      'UPDATE wallets SET cash_provenance_verified=false'])
      await assert.rejects(runtime.query(statement), /permission denied/);
  } finally {
    await runtime.end(); await db!.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
  }
});
