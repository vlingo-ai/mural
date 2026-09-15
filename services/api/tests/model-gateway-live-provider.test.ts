import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { WebSocketServer, type WebSocket } from 'ws';
import { ModelGatewayLiveProvider } from '../src/model-gateway/live-provider.js';
import { ModelGatewayClient } from '../src/model-gateway/client.js';

const key = 'synthetic-model-gateway-key-for-local-tests';
const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for test condition.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

test('Gateway Live adapter maps creation, trusted usage, close, and hangup', async () => {
  const payloads: any[] = [], sockets = new Set<WebSocket>(), commands: any[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    if (request.url !== '/v1/live/sessions') { response.writeHead(404); response.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    payloads.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'gateway.live_session', id: 'live_gateway_1', status: 'ready',
      model: 'mural.live.default', transport: { type: 'webrtc', sdp: 'v=0\r\ngateway-answer' },
      sideband: { protocol: 'vlingo.live.sideband', protocol_version: '1.0',
        url: '/v1/live/sessions/live_gateway_1/sideband' },
      provider: { name: 'openai', model: 'gpt-live-1' }, expires_at: null }));
  });
  const websocket = new WebSocketServer({ server });
  websocket.on('connection', (socket, request) => {
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    assert.equal(request.url, '/v1/live/sessions/live_gateway_1/sideband');
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('message', bytes => commands.push(JSON.parse(bytes.toString())));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const provider = new ModelGatewayLiveProvider(new ModelGatewayClient(`http://127.0.0.1:${address.port}`, key));
  try {
    const created = await provider.create('v=0\r\nprivate-offer', 'es-ES', {
      instructions: 'private-instructions',
      history: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'private-history' }] }],
    });
    assert.deepEqual(created, { sessionID: 'live_gateway_1', sdp: 'v=0\r\ngateway-answer' });
    assert.equal(payloads[0].model, 'mural.live.default');
    assert.equal(payloads[0].transport.sdp, 'v=0\r\nprivate-offer');
    assert.equal(payloads[0].session.voice, 'marin');
    assert.equal(payloads[0].session.input[0].content[0].text, 'private-history');
    assert.ok(payloads[0].session.instructions.includes('private-instructions'));
    assert.deepEqual(payloads[0].session.delegation, { type: 'application' });
    assert.ok(payloads[0].session.data_channel.allowed_client_events.includes('session.close'));
    assert.ok(payloads[0].session.data_channel.allowed_server_events.includes('session.started'));

    const usage: unknown[] = []; let losses = 0;
    const sideband = await provider.attach(created.sessionID, event => usage.push(event), () => { losses++; });
    const first = [...sockets][0]!;
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-1', session_id: created.sessionID,
      sequence: 1, type: 'session.ready' }));
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-2', session_id: created.sessionID,
      sequence: 2, type: 'audio_usage.updated', seconds: 4.5, final: false }));
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-3', session_id: created.sessionID,
      sequence: 3, type: 'transcript.delta', item_id: 'private-item', role: 'assistant', delta: 'private text' }));
    await until(() => usage.length === 1);
    sideband.closeSession(); await until(() => commands.length === 1);
    assert.deepEqual(commands[0], { type: 'session.close' });
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-4', session_id: created.sessionID,
      sequence: 4, type: 'audio_usage.updated', seconds: 5, final: true }));
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-5', session_id: created.sessionID,
      sequence: 5, type: 'session.closed', reason: 'close_requested' }));
    await until(() => usage.length === 3);
    first.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-6', session_id: created.sessionID,
      sequence: 6, type: 'audio_usage.updated', seconds: 99, final: true }));
    first.close(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(usage, [
      { type: 'session.usage.updated', usage: { seconds: 4.5 } },
      { type: 'session.usage.updated', usage: { seconds: 5 } },
      { type: 'session.closed', usage: { seconds: 5 } },
    ]);
    assert.equal(losses, 0);

    await provider.hangup(created.sessionID); await until(() => commands.length === 2);
    assert.deepEqual(commands[1], { type: 'session.close' });
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise<void>(resolve => websocket.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Gateway Live adapter fails closed on invalid sideband events', async () => {
  const sockets = new Set<WebSocket>();
  const server = createServer(); const websocket = new WebSocketServer({ server });
  websocket.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const provider = new ModelGatewayLiveProvider(new ModelGatewayClient(`http://127.0.0.1:${address.port}`, key));
  try {
    let losses = 0;
    await provider.attach('live_gateway_2', () => assert.fail('Invalid usage must not be accepted.'), () => { losses++; });
    const socket = [...sockets][0]!;
    socket.send(JSON.stringify({ protocol_version: '1.0', event_id: 'event-1', session_id: 'wrong-session',
      sequence: 1, type: 'audio_usage.updated', seconds: 1, final: false }));
    await until(() => losses === 1); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(losses, 1);
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise<void>(resolve => websocket.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Gateway Live adapter classifies rejected, uncertain, and malformed creates without leaking bodies', async () => {
  for (const [status, category] of [[429, 'http_rejected'], [503, 'http_uncertain'], [200, 'invalid_success']] as const) {
    let attempts = 0, cancelled = false;
    const provider = new ModelGatewayLiveProvider(new ModelGatewayClient('https://gateway.example.test', key, { request: (async () => {
      attempts++;
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(status === 200 ? key : `private failure ${key}`));
        controller.close();
      }, cancel() { cancelled = true; } });
      return new Response(stream, { status, headers: { 'x-request-id': 'gateway_request_1' } });
    }) as typeof fetch }));
    await assert.rejects(provider.create('v=0', 'en'), error => {
      assert.equal((error as { category: string }).category, category);
      assert.equal(String(error).includes(key), false); return true;
    });
    assert.equal(attempts, 1);
    if (status !== 200) assert.equal(cancelled, true);
  }
});
