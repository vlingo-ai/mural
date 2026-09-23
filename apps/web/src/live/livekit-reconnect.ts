import type { ReconnectContext, ReconnectPolicy } from 'livekit-client';

// The app's recovery window ends before the API's 60-second room departure
// timeout. If recovery fails, we request an explicit close rather than leaving
// the worker running until LiveKit expires the empty room.
export const MURAL_RECOVERY_WINDOW_MS = 40_000;
// The SDK and app must agree on when an unreachable room is terminal.
export const LIVEKIT_RECONNECT_WINDOW_MS = MURAL_RECOVERY_WINDOW_MS;
export const MURAL_RECOVERY_FALLBACK_MS = 5_000;
export const MURAL_RECOVERY_RETRY_MS = 2_000;
export const MURAL_MEDIA_READY_MS = 8_000;

const retryDelays = [0, 300, 1_200, 2_700, 4_800, 7_000] as const;

export class MuralReconnectPolicy implements ReconnectPolicy {
  nextRetryDelayInMs(context: ReconnectContext): number | null {
    const remaining = LIVEKIT_RECONNECT_WINDOW_MS - context.elapsedMs;
    if (remaining <= 0) return null;
    const delay = retryDelays[Math.min(context.retryCount, retryDelays.length - 1)];
    return Math.min(delay, remaining);
  }
}
