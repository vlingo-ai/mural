export const HISTORY_SYNC_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export async function retryHistoryWrite(
  write: () => Promise<void>,
  wait: (milliseconds: number) => Promise<void> = milliseconds =>
    new Promise(resolve => globalThis.setTimeout(resolve, milliseconds)),
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= HISTORY_SYNC_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await write();
      return;
    } catch (error) {
      lastError = error;
      const delay = HISTORY_SYNC_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await wait(delay);
    }
  }
  throw lastError;
}
