import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { isLiveKitRoomAbsent, LiveKitLiveProvider } from '../src/livekit/live-provider.js';

const secret = 'control-secret-with-at-least-thirty-two-bytes';
const sessionID = 'c0a8012a-1a2b-4c3d-8e5f-123456789abc';
const provider = () => new LiveKitLiveProvider({
  url: 'ws://127.0.0.1:7880', apiKey: 'devkey', apiSecret: 'secret', controlSecret: secret,
});
const authorization = () => `Bearer ${createHmac('sha256', secret)
  .update('mural-livekit-control-v1\0').update(sessionID).digest('base64url')}`;

test('LiveKit trusted control accepts cumulative usage only after attach', async () => {
  const livekit = provider();
  const usage: unknown[] = [];
  const sideband = await livekit.attach(sessionID, event => usage.push(event), () => assert.fail('unexpected loss'));
  assert.deepEqual(livekit.acceptTrustedEvent(sessionID, authorization(),
    { type: 'session.usage.updated', seconds: 12.5 }),
  { type: 'session.usage.updated', usage: { seconds: 12.5 } });
  assert.deepEqual(usage, [{ type: 'session.usage.updated', usage: { seconds: 12.5 } }]);
  sideband.disconnect();
  assert.throws(() => livekit.acceptTrustedEvent(sessionID, authorization(),
    { type: 'session.closed', seconds: 12.5 }), /livekit_session_not_attached/);
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
