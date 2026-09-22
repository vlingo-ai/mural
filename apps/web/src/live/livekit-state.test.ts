import { describe, expect, it } from 'vitest';
import { agentDisconnectIsTerminal } from './livekit-state';

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
