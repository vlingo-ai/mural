import { expect, it, vi } from 'vitest';
import type { HistoryPage } from '../api/contracts';
import { HistoryReader } from './history-reader';

const event = (eventID: string) => ({ eventID, speaker: 'user' as const, text: 'Synthetic', source: 'live' as const, createdAt: '2026-09-26T00:00:00Z' });
const page = (ids: string[], cursor: string, hasMore = false): HistoryPage => ({ events: ids.map(event), nextCursor: cursor, hasMore });

it('resumes the last committed page after offline failure and deduplicates replay', async () => {
  const read = vi.fn().mockResolvedValueOnce(page(['a'], '1', true))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['a', 'b'], '2'));
  const publish = vi.fn(), failed = vi.fn();
  const reader = new HistoryReader(read, publish, failed);
  await reader.poll(); await reader.poll();
  expect(read.mock.calls).toEqual([[undefined], ['1'], ['1']]);
  expect(failed).toHaveBeenCalledOnce();
  expect(publish.mock.lastCall?.[0].map((item: { eventID: string }) => item.eventID)).toEqual(['a', 'b']);
});

it('ignores late responses after account/session disposal and avoids overlapping reads', async () => {
  let resolve!: (value: HistoryPage) => void;
  const read = vi.fn(() => new Promise<HistoryPage>(done => { resolve = done; }));
  const publish = vi.fn(), failed = vi.fn();
  const reader = new HistoryReader(read, publish, failed);
  const first = reader.poll(); await reader.poll(); reader.stop(); resolve(page(['private'], '1')); await first;
  expect(read).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
});

it('bounds catch-up work and retains an empty page cursor', async () => {
  let sequence = 0;
  const read = vi.fn(async () => page([String(++sequence)], String(sequence), true));
  const reader = new HistoryReader(read, vi.fn(), vi.fn());
  await reader.poll(); expect(read).toHaveBeenCalledTimes(10);
  read.mockResolvedValueOnce(page([], '10'));
  await reader.poll(); await reader.poll();
  expect(read.mock.calls[10]).toEqual(['10']); expect(read.mock.calls[11]).toEqual(['10']);
});

it('does not advance on conflicting immutable content or a stuck cursor', async () => {
  const read = vi.fn().mockResolvedValueOnce(page(['a'], '1'))
    .mockResolvedValueOnce({ ...page(['a'], '2'), events: [{ ...event('a'), text: 'conflict' }] })
    .mockResolvedValueOnce(page([], '1', true)).mockResolvedValueOnce(page(['b'], '2'));
  const failed = vi.fn(), publish = vi.fn();
  const reader = new HistoryReader(read, publish, failed);
  for (let i = 0; i < 4; i++) await reader.poll();
  expect(read.mock.calls).toEqual([[undefined], ['1'], ['1'], ['1']]);
  expect(failed).toHaveBeenCalledTimes(2);
  expect(publish.mock.lastCall?.[0]).toEqual([event('a'), event('b')]);
});
