import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { WebSocketServer, type WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { digest } from '../src/auth.js';
import { connectDatabase, transaction } from '../src/db.js';
import { HostedHelpers } from '../src/hosted-helpers.js';
import { HostedVoice } from '../src/hosted-voice.js';
import { OpenAILiveProvider } from '../src/live-provider.js';
import { appendMinuteEntry } from '../src/minutes.js';
import { migrate } from '../src/migrate.js';
import { ModelGatewayClient } from '../src/model-gateway/client.js';
import { ModelGatewayResponsesTransport } from '../src/model-gateway/responses-transport.js';

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL && !new URL(databaseURL).pathname.endsWith('_test')) throw new Error('Dedicated test database required.');
const key = 'synthetic-model-gateway-key-for-local-tests';

test('public Mural routes keep OpenAI Live separate from one healthy Gateway for Responses', {
  skip: !databaseURL && 'Set TEST_DATABASE_URL.',
}, async () => {
  const schema = `gateway_e2e_${randomUUID().replaceAll('-', '')}`, database = new URL(databaseURL!);
  database.searchParams.set('options', `-c search_path=${schema}`);
  const db = connectDatabase(database.toString());
  await db.query(`CREATE SCHEMA ${schema}`); await migrate(db);
  const account = randomUUID(), token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO accounts(id,is_guest) VALUES($1,true)', [account]);
  await db.query("INSERT INTO auth_sessions(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [randomUUID(), account, digest(token)]);
  await transaction(db, sql => appendMinuteEntry(sql, account, `gateway-e2e:${account}`, 'gift', 60_000, 0));

  const requests: any[] = [], sockets = new Set<WebSocket>();
  const server = createServer(async (request, response) => {
    if (request.url === '/healthz') {
      assert.equal(request.headers.authorization, undefined);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', service: 'fixture-gateway', version: '1.0.0' }));
      return;
    }
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    if (request.url === '/v1/live/sessions/openai_session_e2e/hangup') {
      response.writeHead(204); response.end(); return;
    }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push({ path: request.url, body });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/live/sessions') {
      response.end(JSON.stringify({ session: { id: 'openai_session_e2e' },
        transport: { type: 'webrtc', sdp: 'v=0\r\nfixture-answer' } }));
    } else if (request.url === '/v1/responses') {
      response.end(JSON.stringify({ object: 'gateway.response', id: 'gateway_response_e2e', status: 'completed',
        model: body.model, output_text: 'Good morning.', output_json: null,
        provider: { name: 'openai', model: 'gpt-6-luna' }, usage: { input_tokens: 30,
          cached_input_tokens: 5, cache_write_input_tokens: 4, output_tokens: 3,
          reasoning_output_tokens: 0, total_tokens: 33, web_search_calls: 0 }, sources: [], finish_reason: null }));
    } else { response.writeHead(404); response.end(); }
  });
  const websocket = new WebSocketServer({ server });
  websocket.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('message', bytes => {
      if (JSON.parse(bytes.toString()).type !== 'session.close') return;
      socket.send(JSON.stringify({ type: 'session.closed', session: { id: 'openai_session_e2e' }, usage: { seconds: 1 } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const gateway = new ModelGatewayClient(`http://127.0.0.1:${(server.address() as { port: number }).port}`, key);
  const helpers = new HostedHelpers(db, new ModelGatewayResponsesTransport(gateway), {
    accountAllowlist: new Set(), aggregateFundingCapNano: 0n, publicMinuteAccess: true,
    helperBudgetNanoPerMinute: 50_000_000n, maxRequestsPerMinute: 6, maxSearchesPerSession: 1,
    maxConcurrentPerSession: 2, maxConcurrentGlobal: 4, postSessionMilliseconds: 120_000,
    inputFramingTokenAllowance: 4096, searchInputTokenAllowance: 1_050_000, timeoutMilliseconds: 1_000,
  });
  const hosted = new HostedVoice(db, new OpenAILiveProvider(key, {
    testOrigin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  }), {
    accountAllowlist: new Set(), lifetimeFundingCapNano: 0n, publicMinuteAccess: true,
    billingUnit: 'milliseconds', helpers,
  });
  const app = createApp({ db, auth: {}, hosted, hostedHelpers: helpers });
  try {
    await gateway.checkHealth(); await hosted.start();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({ method: 'POST', url: '/v1/live/sessions',
      headers: { ...headers, 'idempotency-key': 'gateway-e2e-live' }, payload: { sdp: 'v=0\r\nfixture-offer', language: 'en' } });
    assert.equal(created.statusCode, 200); assert.equal(created.json().sdp, 'v=0\r\nfixture-answer');
    assert.equal(created.json().providerSessionID, undefined);
    const helper = await app.inject({ method: 'POST', url: '/v1/model-tasks',
      headers: { ...headers, 'idempotency-key': 'gateway-e2e-translation' },
      payload: { kind: 'translation', funding: { type: 'liveSession', sessionID: created.json().sessionID },
        text: '早晨。', sourceLanguage: 'zh-CN', targetLanguage: 'English' } });
    assert.equal(helper.statusCode, 200); assert.equal(helper.json().text, 'Good morning.');
    assert.equal(helper.json().kind, 'translation');
    assert.deepEqual(helper.json().usage, { inputTokens: 30, outputTokens: 3, searchCalls: 0 });
    assert.deepEqual(requests.map(item => item.path), ['/v1/live/sessions', '/v1/responses']);
    assert.equal(requests[0].body.session.model, 'gpt-live-1');
    assert.equal(requests[1].body.model, 'mural.translation.fast');
  } finally {
    await app.close(); await hosted.stop().catch(() => {});
    for (const socket of sockets) socket.terminate();
    await new Promise<void>(resolve => websocket.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end();
  }
});
