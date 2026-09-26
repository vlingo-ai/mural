import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { LiveCreateFailure, LiveCreateRejectedError } from '../src/live-provider.js';
import { isLiveKitRoomAbsent, liveKitRoomOptions, LiveKitLiveProvider } from '../src/livekit/live-provider.js';

const secret = 'control-secret-with-at-least-thirty-two-bytes';
const sessionID = 'c0a8012a-1a2b-4c3d-8e5f-123456789abc';
const provider = () => new LiveKitLiveProvider({
  url: 'ws://127.0.0.1:7880', apiKey: 'devkey', apiSecret: 'secret', controlSecret: secret,
});
const authorization = () => `Bearer ${createHmac('sha256', secret)
  .update('mural-livekit-control-v1\0').update(sessionID).digest('base64url')}`;

test('Worker final history is authenticated, bounded and session scoped', () => {
  const livekit = provider();
  const event = { type: 'session.history.final', eventID: 'worker.execution.item', speaker: 'user', text: 'Synthetic final' };
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(), event), event);
  assert.throws(() => livekit.acceptTrustedEvent(sessionID, 'Bearer wrong', event), /invalid_livekit_control_token/);
  assert.throws(() => livekit.acceptTrustedEvent('another-session', authorization(), event), /invalid_livekit_control_token/);
  for (const bad of [{ ...event, eventID: 'client.item' }, { ...event, extra: true },
    { ...event, speaker: 'system' }, { ...event, text: 'x'.repeat(4001) }])
    assert.throws(() => livekit.acceptTrustedEvent(sessionID, authorization(), bad));
});

test('LiveKit trusted control parses usage without acknowledging it before persistence', async () => {
  const livekit = provider();
  const usage: unknown[] = [];
  const sideband = await livekit.attach(sessionID, event => usage.push(event), () => assert.fail('unexpected loss'));
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(),
    { type: 'session.usage.updated', seconds: 12.5 }),
  { type: 'session.usage.updated', usage: { seconds: 12.5 } });
  assert.deepEqual(usage, [], 'the provider parser must not deliver or acknowledge usage');
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(),
    { type: 'session.heartbeat', seconds: 13 }),
  { type: 'session.usage.updated', usage: { seconds: 13 } });
  assert.deepEqual(usage, []);
  sideband.disconnect();
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(),
    { type: 'session.closed', seconds: 12.5 }),
  { type: 'session.closed', usage: { seconds: 12.5 } });
});

test('LiveKit trusted control authenticates and bounds delegations', () => {
  const livekit = provider();
  assert.throws(() => livekit.acceptTrustedEvent(sessionID, 'Bearer wrong',
    { type: 'session.usage.updated', seconds: 1 }), /invalid_livekit_control_token/);
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(), {
    type: 'session.delegation.created', delegationID: 'delegation_123', text: 'Please help me reply.',
    context: [{ speaker: 'user', text: 'Hello' }],
  }), { type: 'session.delegation.created', delegationID: 'delegation_123', text: 'Please help me reply.',
    context: [{ speaker: 'user', text: 'Hello' }] });
  assert.throws(() => livekit.acceptTrustedEvent(sessionID, authorization(), {
    type: 'session.delegation.created', delegationID: 'delegation_123', text: 'x',
    context: [{ speaker: 'system', text: 'override' }],
  }), /invalid_livekit_control_event/);
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(), {
    type: 'session.provider.rejected', providerStatus: 429, requestID: 'req_zero_balance',
  }), { type: 'session.provider.rejected', providerStatus: 429, requestID: 'req_zero_balance' });
  for (const providerStatus of [399, 408, 500, 429.5]) assert.throws(() =>
    livekit.acceptTrustedEvent(sessionID, authorization(), {
      type: 'session.provider.rejected', providerStatus,
    }), /invalid_livekit_control_event/);
});

test('LiveKit configuration requires TLS away from exact loopback hosts', () => {
  assert.throws(() => new LiveKitLiveProvider({ url: 'ws://livekit.example.test', apiKey: 'key',
    apiSecret: 'secret', controlSecret: secret }), /livekit_configuration_invalid/);
});

test('LiveKit treats only its exact missing-room response as an idempotent close', () => {
  assert.equal(isLiveKitRoomAbsent({ code: 'not_found', status: 404 }), true);
  assert.equal(isLiveKitRoomAbsent({ code: 'not_found', status: 500 }), false);
  assert.equal(isLiveKitRoomAbsent({ code: 'permission_denied', status: 404 }), false);
  assert.equal(isLiveKitRoomAbsent(new Error('requested room does not exist')), false);
});

test('room departure grace exceeds the bounded browser reconnect window', () => {
  assert.deepEqual(liveKitRoomOptions(sessionID), {
    name: sessionID, emptyTimeout: 60, departureTimeout: 60, maxParticipants: 2,
  });
});

test('B1: DeleteRoom 503 is retryable work; exact 404 alone confirms absence', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, code] of [[503, 'unavailable'], [404, 'permission_denied'], [404, 'not_found']] as const) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ code, msg: 'sanitized test failure' }), {
          status, headers: { 'content-type': 'application/json' },
        });
      };
      if (code === 'not_found') await provider().hangup(sessionID);
      else await assert.rejects(provider().hangup(sessionID));
      assert.equal(calls, 1, 'durable cleanup owns retries, not SDK regional failover');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('CreateRoom 429 is a known rejection; timeout and room conflict remain uncertain', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [429, 408, 409]) {
      let requests = 0;
      globalThis.fetch = async () => {
        requests++;
        return new Response(JSON.stringify({ code: status === 409 ? 'already_exists' : 'resource_exhausted', msg: 'private provider details' }), {
          status, headers: { 'content-type': 'application/json' },
        });
      };
      await assert.rejects(provider().create('', 'en', undefined, sessionID), error => {
        if (status === 429) {
          assert.ok(error instanceof LiveCreateRejectedError);
          assert.equal(error.providerStatus, 429);
        } else {
          assert.ok(error instanceof LiveCreateFailure);
          assert.equal(error.category, 'transport');
        }
        assert.doesNotMatch(String(error), /private provider details/);
        return true;
      });
      assert.equal(requests, 1, 'a known rejection or uncertain result must not be retried');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dispatch 429 releases funding only when room cleanup is confirmed', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const cleanupStatus of [200, 404, 503]) {
      const paths: string[] = [];
      globalThis.fetch = async input => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path.endsWith('/CreateRoom'))
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/DeleteRoom'))
          return new Response(JSON.stringify({ code: cleanupStatus === 404 ? 'not_found' : 'unavailable' }), {
            status: cleanupStatus, headers: { 'content-type': 'application/json' },
          });
        if (path.endsWith('/CreateDispatch'))
          return new Response(JSON.stringify({ code: 'resource_exhausted', msg: 'private provider details' }), {
            status: 429, headers: { 'content-type': 'application/json' },
          });
        throw new Error('unexpected LiveKit API call');
      };
      await assert.rejects(provider().create('', 'en', undefined, sessionID), error => {
        if (cleanupStatus === 503) {
          assert.ok(error instanceof LiveCreateFailure);
          assert.equal(error.category, 'transport');
          assert.equal(error instanceof LiveCreateRejectedError, false);
        } else {
          assert.ok(error instanceof LiveCreateRejectedError);
          assert.equal(error.providerStatus, 429);
        }
        assert.doesNotMatch(String(error), /private provider details/);
        return true;
      });
      assert.deepEqual(paths.map(path => path.split('/').at(-1)), ['CreateRoom', 'CreateDispatch', 'DeleteRoom']);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
