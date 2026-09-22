import { describe, expect, it, vi } from 'vitest';
import { HISTORY_SYNC_RETRY_DELAYS_MS, retryHistoryWrite } from './history-sync';

describe('retryHistoryWrite', () => {
  it('recovers after a temporary network interruption', async () => {
    const write = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await retryHistoryWrite(write, wait);

    expect(write).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('fails after the bounded retry schedule is exhausted', async () => {
    const error = new TypeError('offline');
    const write = vi.fn().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(retryHistoryWrite(write, wait)).rejects.toBe(error);

    expect(write).toHaveBeenCalledTimes(HISTORY_SYNC_RETRY_DELAYS_MS.length + 1);
    expect(wait.mock.calls.flat()).toEqual([...HISTORY_SYNC_RETRY_DELAYS_MS]);
  });
});
