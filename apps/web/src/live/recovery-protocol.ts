// Shared recovery reducer; SDK/network effects remain in the platform adapter.
export type RecoveryPhase = 'connecting' | 'active' | 'recovering' | 'closing' | 'closed' | 'failed';
export interface RecoveryState {
  generation: number;
  roomEpoch: number;
  phase: RecoveryPhase;
  signal: 'unknown' | 'connected' | 'reconnecting';
  microphone: boolean;
  agentAudio: boolean;
  controlUntil: number;
  lastAt: number;
}
export type RecoveryEvent = {
  generation: number;
  roomEpoch: number;
  at: number; // Local monotonic milliseconds, never server UTC.
} & RecoveryUpdate;
export type RecoveryUpdate = (
  | { kind: 'signal'; connected: boolean }
  | { kind: 'media'; microphone: boolean; agentAudio: boolean }
  | { kind: 'control'; validUntil: number }
  | { kind: 'room-replaced' }
  | { kind: 'stop' | 'closed' | 'expired' | 'agent-lost' | 'tick' }
);

export function initialRecoveryState(generation: number): RecoveryState {
  return { generation, roomEpoch: 0, phase: 'connecting', signal: 'unknown',
    microphone: false, agentAudio: false, controlUntil: 0, lastAt: 0 };
}

export function reduceRecovery(state: RecoveryState, event: RecoveryEvent): RecoveryState {
  if (event.generation !== state.generation || event.roomEpoch !== state.roomEpoch ||
      !Number.isFinite(event.at) || event.at < state.lastAt) return state;
  if (state.phase === 'closed' || state.phase === 'failed') return state;
  if (event.kind === 'closed') return { ...state, phase: 'closed', lastAt: event.at };
  if (state.phase === 'closing') return state; // Stop wins over every late recovery event.
  if (event.kind === 'stop') return { ...state, phase: 'closing', lastAt: event.at,
    microphone: false, agentAudio: false };
  if (event.kind === 'expired' || event.kind === 'agent-lost' ||
      (state.controlUntil > 0 && event.at >= state.controlUntil)) {
    return { ...state, phase: 'failed', microphone: false, agentAudio: false, lastAt: event.at };
  }
  let next = { ...state, lastAt: event.at };
  switch (event.kind) {
    case 'control':
      if (!Number.isFinite(event.validUntil) || event.validUntil <= event.at) {
        return { ...next, phase: 'failed', microphone: false, agentAudio: false };
      }
      next.controlUntil = event.validUntil;
      break;
    case 'signal': next.signal = event.connected ? 'connected' : 'reconnecting'; break;
    case 'media': next.microphone = event.microphone; next.agentAudio = event.agentAudio; break;
    case 'room-replaced':
      next = { ...next, roomEpoch: state.roomEpoch + 1, signal: 'unknown',
        microphone: false, agentAudio: false };
      break;
    case 'tick': break;
  }
  const ready = next.controlUntil > event.at && next.signal === 'connected' &&
    next.microphone && next.agentAudio;
  next.phase = ready ? 'active' : state.phase === 'connecting' ? 'connecting' : 'recovering';
  return next;
}
