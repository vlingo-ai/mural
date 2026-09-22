import { describe, expect, it } from 'vitest';
import { LIVEKIT_RECONNECT_WINDOW_MS, MuralReconnectPolicy } from './livekit-reconnect';

describe('MuralReconnectPolicy', () => {
  it('keeps retrying through a normal Wi-Fi reassociation', () => {
    const policy = new MuralReconnectPolicy();
    expect(policy.nextRetryDelayInMs({ retryCount: 0, elapsedMs: 0 })).toBe(0);
    expect(policy.nextRetryDelayInMs({ retryCount: 10, elapsedMs: 45_000 })).toBe(7_000);
    expect(policy.nextRetryDelayInMs({ retryCount: 20, elapsedMs: 82_000 })).toBe(7_000);
  });

  it('caps retries at a bounded ninety-second recovery window', () => {
    const policy = new MuralReconnectPolicy();
    expect(policy.nextRetryDelayInMs({ retryCount: 20, elapsedMs: LIVEKIT_RECONNECT_WINDOW_MS - 500 })).toBe(500);
    expect(policy.nextRetryDelayInMs({ retryCount: 20, elapsedMs: LIVEKIT_RECONNECT_WINDOW_MS })).toBeNull();
  });
});
