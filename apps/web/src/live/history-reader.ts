import type { ConversationDetail, HistoryPage } from '../api/contracts';

/** One reader per selected conversation and credential generation. No persisted
 * cursor without its events: a browser reload must replay from the beginning. */
export class HistoryReader {
  private cursor: string | undefined;
  private events = new Map<string, ConversationDetail['events'][number]>();
  private stopped = false;
  private busy = false;

  constructor(
    private readonly read: (cursor?: string) => Promise<HistoryPage>,
    private readonly publish: (events: ConversationDetail['events']) => void,
    private readonly failed: () => void,
  ) {}

  stop() { this.stopped = true; this.events.clear(); }

  async poll(): Promise<void> {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try {
      // Bound each catch-up pass; the next timer resumes from the last good page.
      for (let pageNumber = 0; pageNumber < 10 && !this.stopped; pageNumber++) {
        const page = await this.read(this.cursor);
        if (this.stopped) return;
        if (!Array.isArray(page.events) || typeof page.nextCursor !== 'string' ||
            typeof page.hasMore !== 'boolean' || (page.hasMore && page.nextCursor === this.cursor))
          throw new Error('Invalid history page');
        const next = new Map(this.events);
        for (const event of page.events) {
          const old = next.get(event.eventID);
          if (old && (old.speaker !== event.speaker || old.text !== event.text || old.source !== event.source))
            throw new Error('Conflicting immutable history event');
          next.set(event.eventID, event);
        }
        this.events = next;
        this.cursor = page.nextCursor;
        this.publish([...next.values()]);
        if (!page.hasMore) return;
      }
    } catch {
      if (!this.stopped) this.failed();
    } finally { this.busy = false; }
  }
}
