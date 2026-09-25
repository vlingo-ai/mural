// Compile-time checks only; npm run check includes this file. No provider calls.
import type { CurrentLiveSessionDTO, LiveSessionDTO, LiveSessionStatusDTO,
  LiveTransportDTO, HostedHelperStreamEventDTO } from '../../../shared/contracts/generated/live.js';

export function assertTransportNarrowing(transport: LiveTransportDTO): string {
  if (transport.type === 'webrtc') return transport.sdp;
  return transport.token;
}

const empty: CurrentLiveSessionDTO = { session: null };
const room: LiveTransportDTO = { type: 'livekit-room', url: 'wss://example.invalid', token: 'synthetic' };
const live: LiveSessionDTO = { sessionID: 'fixture', transport: room, deadline: 'fixture', rateVersion: 'fixture', experimental: true };
const status: LiveSessionStatusDTO = { sessionID: 'fixture', state: 'closed', deadline: null, observedMilliseconds: 0, providerCostNanoUSD: null };
const event: HostedHelperStreamEventDTO = { type: 'mural.meaning.error', code: 'fixture', reference: 'fixture' };
// @ts-expect-error LiveKit token is required.
const missingToken: LiveTransportDTO = { type: 'livekit-room', url: 'wss://example.invalid' };
// @ts-expect-error Current wrapper permits explicit null but not missing session.
const missingCurrent: CurrentLiveSessionDTO = {};
// @ts-expect-error Required nullable provider cost cannot be omitted.
const missingCost: LiveSessionStatusDTO = { sessionID: 'fixture', state: 'closed', deadline: null, observedMilliseconds: 0 };
// @ts-expect-error Completed event needs its result.
const missingResult: HostedHelperStreamEventDTO = { type: 'mural.meaning.completed' };
// @ts-expect-error No implicit unknown transport fallback.
const unknownTransport: LiveTransportDTO = { type: 'other' };
void [empty, live, status, event, missingToken, missingCurrent, missingCost, missingResult, unknownTransport];
