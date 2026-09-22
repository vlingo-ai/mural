import { describe, expect, it } from 'vitest';
import { agentDisconnectIsTerminal, agentMediaIsReady } from './livekit-state';

describe('agentDisconnectIsTerminal', () => {
  it('does not terminate a full reconnect when the agent temporarily leaves', () => {
    expect(agentDisconnectIsTerminal('agent', 'agent', true)).toBe(false);
  });

  it('terminates an unexpected agent departure outside reconnect', () => {
    expect(agentDisconnectIsTerminal('agent', 'agent', false)).toBe(true);
  });

  it('ignores unrelated participants', () => {
    expect(agentDisconnectIsTerminal('agent', 'learner', false)).toBe(false);
  });
});

describe('agentMediaIsReady', () => {
  const participant = (identity: string, audioTracks: number) => ({
    identity,
    audioTrackPublications: new Map(Array.from({ length: audioTracks }, (_, index) => [`audio-${index}`, {}])),
  });

  it('requires the known agent and an audio publication after reconnect', () => {
    expect(agentMediaIsReady('agent', [participant('agent', 1)])).toBe(true);
    expect(agentMediaIsReady('agent', [participant('agent', 0)])).toBe(false);
    expect(agentMediaIsReady('agent', [participant('learner', 1)])).toBe(false);
    expect(agentMediaIsReady(undefined, [participant('agent', 1)])).toBe(false);
  });
});
