import type { Database } from './db.js';
import { Diagnostics, errorReference } from './diagnostics.js';
import type { LiveProvider } from './live-provider.js';

/** Single HostedVoice leader drives this durable queue. No wallet mutations here. */
export class ResourceCleanup {
  constructor(private readonly db: Database, private readonly provider: LiveProvider,
    private readonly diagnostics: Diagnostics, private readonly now: () => number) {}

  async arm(sessionID: string): Promise<void> {
    if (this.provider.clientTransport !== 'livekit-room') return;
    // LiveKit room name is the product session UUID, known before any network call.
    await this.db.query(`INSERT INTO hosted_resource_cleanup(session_id,provider,resource_id,next_attempt_at)
      VALUES($1::uuid,'livekit-room',$1::text,$2) ON CONFLICT(session_id) DO NOTHING`, [sessionID, new Date(this.now())]);
  }

  async confirmAbsent(sessionID: string): Promise<void> {
    await this.db.query(`UPDATE hosted_resource_cleanup c SET state='confirmed',confirmed_at=$2
      FROM hosted_sessions h WHERE c.session_id=$1 AND c.state<>'confirmed' AND h.id=c.session_id
        AND (h.provider_session_id IS NOT NULL OR h.provider_rejection_status IS NOT NULL)`,
    [sessionID, new Date(this.now())]);
  }

  async run(inFlightCreates: ReadonlySet<string>): Promise<void> {
    if (this.provider.clientTransport !== 'livekit-room') return;
    // Claim a bounded batch durably. A crash leaves retryable records, not a lost
    // in-memory timer. Do not delete active rooms merely because they have intent.
    const rows = (await this.db.query(`WITH due AS (
      SELECT c.session_id FROM hosted_resource_cleanup c JOIN hosted_sessions h ON h.id=c.session_id
      WHERE c.provider='livekit-room' AND c.state<>'confirmed' AND c.next_attempt_at<=$1
        AND (h.state IN ('closed','incomplete','closing') OR h.close_requested_at IS NOT NULL)
        AND NOT (c.session_id=ANY($2::uuid[]))
      ORDER BY c.next_attempt_at,c.session_id LIMIT 10 FOR UPDATE OF c SKIP LOCKED
    ) UPDATE hosted_resource_cleanup c SET state='pending',attempts=c.attempts+1,last_attempt_at=$1,
        next_attempt_at=$1 + interval '60 seconds'
      FROM due WHERE c.session_id=due.session_id RETURNING c.session_id,c.resource_id,c.attempts`,
    [new Date(this.now()), [...inFlightCreates]])).rows;
    await Promise.all(rows.map(async row => {
      try {
        // LiveKit adapter treats only successful deletion / exact not_found as success.
        await this.provider.hangup(row.resource_id);
      } catch (error) {
        const delay = Math.min(60_000, 5_000 * 2 ** Math.min(Number(row.attempts) - 1, 4));
        await this.db.query(`UPDATE hosted_resource_cleanup SET next_attempt_at=$2
          WHERE session_id=$1 AND state='pending'`, [row.session_id, new Date(this.now() + delay)]);
        this.diagnostics.record('voice_hangup_failed', {
          operation: 'voice.resource_cleanup', sessionReference: errorReference(row.session_id),
        }, error);
        return;
      }
      // An uncertain CreateRoom without a confirmed provider ID may materialize
      // after this deletion. Keep retrying that intent until explicit reconciliation;
      // "absent now" must not turn an ambiguous create into a terminal cleanup.
      // A DB error here must surface; deletion can safely repeat after restart.
      await this.confirmAbsent(row.session_id);
    }));
  }
}
