# B6 final history protocol (candidate, not deployed)

Worker POST `/internal/livekit/sessions/{id}/events` uses the existing session-scoped
control bearer token. Body is exactly `type: session.history.final`, `eventID`,
`speaker` (`user` or `assistant`) and `text` (nonempty, at most 4000 UTF-8 bytes).
The event ID starts with `worker.` and is at most 128 ASCII identifier characters.
The browser append route reserves this prefix and rejects its use.

An attached session is required. Closed sessions accept delayed final history;
history does not renew a lease, change usage or reopen a session. The current control
token is deterministic/session-scoped, with no independent expiry. Deletion and
secret rotation can therefore make replay permanently fail; retain encrypted pending
evidence for operator handling, never misreport it as delivered.

After committed insertion or exact duplicate verification, API returns `accepted: true`,
`committed: true`, the exact `eventID`, and lowercase hex SHA-256 `digest` of UTF-8 JSON
tuple `[eventID,speaker,text,"live"]`. JSON has no spacing and preserves Unicode.
No normalization/trimming occurs in this digest. Conflicting reuse returns 409.
Worker removes only its matching local record generation after exact ACK validation.
Never log text, tokens, raw payloads or digest values from real conversations.

Synthetic cross-language vector: `worker.execution.item`, `user`, `Synthetic é 🐈\n`
(one actual trailing newline), `live` hashes to
`b369e64f7954cc2a5304ab19c16b1f50c6fe9cf03bef5050b73c737ef01df41e`.

Queue rows are individually encrypted, immutable and never usage-coalesced. Reinserted
rows get a new local generation; stale ACKs cannot delete them. Batch traversal advances
even on failures and wraps, avoiding permanent head-of-line starvation.
Traversal uses a persistent increasing queue sequence, not random receipt versions.
Only the earliest unacknowledged item per session is eligible; a failed item blocks
later items in that session without blocking other sessions. Successful ACK makes
the next item eligible immediately. API cursor remains database commit order.

Local candidate integration (not deployed): migration 031 defaults existing sessions
to client authority. LIVEKIT_WORKER_HISTORY_ENABLED defaults false. Enabled admission
persists worker authority in the reservation transaction and dispatches strict metadata
1.1/historyAuthority=worker. Worker accepts 1.0 without capture and 1.1 with capture.
Worker writes to client-owned sessions are rejected; authenticated legacy browser
writes to worker-owned sessions return accepted/ignored without inserting anything.
This prevents old cached pages from double-writing. No public Live DTO change.

conversation_item_added uses SDK final text (including interrupted final output),
with a hash of job ID/item ID and a chunk index as stable event identity. Text above
4000 UTF-8 bytes is split at code-point boundaries. Interim transcription is not
canonical history. A conflicting final revision is rejected, never silently overwritten;
unexpected capture/storage failure stops the session. Final text not produced by the
SDK or not durably captured before a hard kill cannot be recovered by this protocol.
Worker final events use source=live, including SDK user chat; typed-input provenance
is not separately inferred by text matching.

No automatic deletion of failed history: revoked credentials/deleted sessions/conflicts
remain encrypted and count as backlog, requiring operator reconciliation. Keep the
outbox volume/key across rollback; do not clear it to pass release checks. Automatic
retention, deletion propagation and alert scheduling are not implemented.

Web reads selected history in bounded cursor passes, retries after connectivity returns,
deduplicates immutable IDs and drops disposed-reader responses. Reload starts at zero;
sign-out clears visible history immediately. CI and staging verification remain pending.
