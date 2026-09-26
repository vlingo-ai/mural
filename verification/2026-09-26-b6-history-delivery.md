# B6 history delivery — 2026-09-26

## Baseline and status

Mural `63a65d2` (B5 PR #49 merged); Worker `5c6a2d3`.
Sibling worktrees: `mural-b6-history-delivery` under the Mural project parent,
and `model-gateway-b6-history-delivery` under DeepTutor. Existing clones/worktrees
and their uncommitted changes were not switched or modified.
This iteration is source inspection/design only: runtime tests NOT_RUN; no deployment,
provider call, new credentials or live session. B6 is not implemented.

## Inspected gaps

- Worker `worker.py` conversation_item_added retains the last ten turns in memory;
  it does not submit final history to Mural. Its control client/outbox durably delivers
  usage, not conversation text.
- Web LiveConnection.persistEvent queues browser-originated history writes and bounded
  retries. Browser loss is therefore a delivery boundary.
- API conversation-history.ts deduplicates by session/provider_event_id, but does not
  compare duplicate content. conversationDetail returns the entire ordered history;
  no incremental cursor exists here.

These are source findings, not a reproduced diagnosis of every historical missing turn.

## Implementation order and required checks

1. Define stable session/execution/item identity and final/revision semantics before
   changing writers. Resolve browser/Worker double-writing without text-based dedupe.
   Preserve legacy/typed paths and native local history.
2. API: authenticated Worker history endpoint, durable commit ACK, idempotent replay,
   conflict rejection, account ownership isolation and bounded cursor pages. Cursor
   ordering must not lose a lower sequence committed after a higher one; test concurrent
   commits explicitly, rather than assuming a database sequence equals commit order.
3. Worker: encrypted durable history outbox and bounded replay, separate from cumulative
   usage coalescing. Retain unacknowledged final items across restart. Define size/retention
   bounds, late delivery after close and token expiry/deletion behavior before release.
   No plaintext transcripts in logs or CI evidence.
4. Web: server-authoritative final history, cursor refresh/reconnect recovery and dedupe;
   retain live captions independently. Handle pagination and stale responses across
   session changes. Do not activate the new path before matching server support.
5. Non-billable tests: lost ACK after DB commit, duplicate/conflicting payloads, process
   restart, out-of-order arrivals, browser offline/refresh, more than one page, account
   isolation and interrupted shutdown. Use synthetic text only. Actual cross-repository
   tests must identify both revisions; doubles do not establish end-to-end acceptance.
6. Release matching API, Worker/replay and Web in compatible order after normal backup,
   idle checks and rollback preparation. Implementation/CI/deployment/live acceptance
   remain separate. No paid tests are authorized by this plan.

## B5 handover

Current-head Checks run 36228557251 completed SUCCESS: media 24/24 zero retries,
Web unit 74/74, existing E2E 2/2, server, deployment build and aggregate gate PASS;
contracts and secret scan PASS. PR #49 merged as `63a65d2`. No product runtime changed,
so no staging deployment was needed. Mac interface-dependent instability remains a
documented local harness limitation, not a fixed product defect.

## API foundation candidate (first implementation)

Added migration 030: per-session counter and insert trigger allocate append-only
history positions while holding the session row lock through commit. Existing rows
are backfilled by the prior created_at/id order. Old insert callers also run the
trigger; replay can leave harmless position gaps. Runtime grant script adds the
counter column UPDATE permission; migration/permission changes have NOT been deployed.

Added owner-authenticated GET /v1/conversations/:id/events with bounded limit,
session-scoped opaque cursor, nextCursor and hasMore. Cursor numbers stay strings
and are checked against bigint bounds. The cursor is not an authorization token;
every read independently authenticates and checks the owner. Empty pages preserve
the cursor. Existing full-detail response is unchanged.

Existing append now rejects conflicting reuse of an event ID with HTTP 409 instead
of falsely acknowledging it as the same event. Exact duplicates retain their old
response. Public OpenAPI describes the new read path and conflict behavior.

Verification using a disposable loopback PostgreSQL 17 database:
- First TypeScript check FAIL (optional cursor segment not narrowed); fixed with
  explicit undefined rejection. Final type check and build PASS.
- API suite: **429 PASS / 1 SKIP / 0 FAIL** (430 total); optional cross-repository
  test not configured, not counted as passed.
- History targeted suite **3/3 PASS**, including real HTTP pagination, invalid
  limits, exact replay/conflict, owner isolation, empty-page resume and two database
  writers with an uncommitted earlier event. No higher cursor commits ahead of it.
- Repository Python tests **72/72 PASS**, generated Live DTO drift and diff checks PASS.

Limits: no Worker history endpoint/outbox or Web cursor consumer yet; no CI/PR,
deployment or paid call. Migration of populated historical data and restricted-role
trigger execution still need dedicated tests before release. Final history item
identity/revision semantics and browser/Worker overlap remain next design work.
This first candidate does not prove durable end-to-end delivery or B6 completion.
