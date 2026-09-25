import { describe, expect, it } from 'vitest';
import fixtures from '../../../../shared/contracts/live-recovery-traces.json';
import { initialRecoveryState, reduceRecovery, type RecoveryEvent } from './recovery-protocol';

describe('cross-platform recovery reference traces', () => {
  for (const trace of fixtures.traces) it(trace.name, () => {
    let state = initialRecoveryState(1);
    if (trace.active) state = { ...state, phase: 'active', signal: 'connected',
      microphone: true, agentAudio: true, controlUntil: 1000 };
    const phases = [];
    for (const raw of trace.events) {
      state = reduceRecovery(state, { generation: 1, roomEpoch: 0, ...raw } as RecoveryEvent);
      phases.push(state.phase);
    }
    expect(phases).toEqual(trace.phases);
    if ('roomEpoch' in trace) expect(state.roomEpoch).toBe(trace.roomEpoch);
  });
  it('ignores reversed monotonic timestamps', () => {
    const state = { ...initialRecoveryState(1), lastAt: 20 };
    expect(reduceRecovery(state, { generation: 1, roomEpoch: 0, at: 10, kind: 'stop' })).toBe(state);
  });
});
