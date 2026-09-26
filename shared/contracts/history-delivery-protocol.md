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

Not yet activated: mapping actual SDK final items/revisions to stable execution/item IDs,
Worker callback/shutdown/replay wiring, browser-authoritative-writer transition, pending
history operational counts, retention/deletion policy and end-to-end HTTP tests. These
must be completed before rollout; a queue primitive test is not delivery acceptance.
