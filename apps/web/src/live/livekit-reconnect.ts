import type { ReconnectContext, ReconnectPolicy } from 'livekit-client';

// Keep the quick retries from LiveKit's default policy, but do not abandon a room
// while a laptop is still reassociating with Wi-Fi. The cap is deliberately below
// the hosted session maximum so an unreachable client still fails closed.
export const LIVEKIT_RECONNECT_WINDOW_MS = 90_000;

const retryDelays = [0, 300, 1_200, 2_700, 4_800, 7_000] as const;

export class MuralReconnectPolicy implements ReconnectPolicy {
  nextRetryDelayInMs(context: ReconnectContext): number | null {
    const remaining = LIVEKIT_RECONNECT_WINDOW_MS - context.elapsedMs;
    if (remaining <= 0) return null;
    const delay = retryDelays[Math.min(context.retryCount, retryDelays.length - 1)];
    return Math.min(delay, remaining);
  }
}
