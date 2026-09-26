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

## Second iteration: migration, trusted receipt and queue primitives

Real migrations 025→030 with populated synthetic rows PASS: same-timestamp rows
retain ID tie-break ordering, sessions have independent counters, next insertion
continues at the correct position. Restricted NOLOGIN role fails without counter
permission; the actual grant script enables insertion but not session-state UPDATE.

API now parses authenticated session.history.final control events and returns an
event/content-bound durable ACK. Unattached sessions fail; closed attached sessions
can receive delayed history without changing billing. Browser writes cannot use
the reserved worker. prefix. Exact replay/conflict and DB row-count tests PASS.
Control-token cross-session/invalid-token/body bounds parser checks PASS; full real
Worker→HTTP API/DB composition remains pending (not replaced by separate tests).

Worker candidate adds encrypted immutable history rows, exact ACK validation,
generation-safe deletion and bounded fair batch replay. The first 100 failed rows
do not starve the 101st; traversal wraps. Row capacity is 10,000; payload bounds are
validated. This is a library primitive, not yet wired into AgentSession callbacks
or the running replay service. Usage replay behavior is unchanged.

Results: API **431 PASS / 1 SKIP / 0 FAIL**; history/migration/provider targeted
**13/13 PASS**; type/build PASS. Worker suite **43/43 PASS**, Ruff lint/format PASS.
Two initial lint failures (import ordering and sorted-vs-max) were corrected before
final validation. Shared Unicode/newline digest vector then passed both API history
3/3 and Worker history 3/3 targeted tests. No real data, provider or deployment used.

Protocol and activation limitations: [history delivery candidate](../shared/contracts/history-delivery-protocol.md).
Remaining: SDK identity/revision mapping, durable callback/shutdown integration,
history replay startup/status/retention, deletion and secret-rotation handling,
cross-process/cross-repo failure tests, Web cursor consumer and controlled rollout.
No new waivers. B6 remains incomplete and local-only.

## Third iteration: replay service and release backlog

Worker replay main now initializes the history-capable encrypted store and runs
history and usage loops independently under TaskGroup supervision. A synthetic hung
history loop cannot block usage; a storage failure cancels the sibling. The existing
release backlog command counts both pending tables, accepts old usage-only volumes,
and does not suppress SQL errors as a zero count.

Review found random UUID ordering in the history batch primitive. Replaced it with
persistent AUTOINCREMENT traversal; reopen/order and delete-all/reinsert cursor
tests PASS. Receipt generations remain random and continue protecting stale ACKs.
This does not establish source conversation ordering when an earlier delivery fails
and fair replay permits a later item through; that integration requirement is open.

Worker complete suite **46/46 PASS**, Ruff lint/format PASS. An intermediate test
edit misplaced assertions and failed lint; corrected before the final suite. API
runtime unchanged and not rerun this iteration. No provider calls or deployment.
Live callback, authoritative-writer rollout, Web cursor consumer, source ordering
and cross-repository HTTP failure tests remain incomplete. B6 is not signed off.

## Fourth iteration: callback, authority and browser catch-up

Local candidate wires SDK conversation_item_added finals into synchronous encrypted
capture, with stable job/item/chunk identity and Unicode byte-bounded chunks. Actual
Worker entrypoint tests cover interrupted ChatMessage output, old/new metadata and
denied lease. Replay now permits only the earliest pending item per session: failure
blocks later items in that session, not other sessions. Success resumes immediately.

Migration 031 snapshots authority in the admission transaction. Default is client;
the opt-in API flag dispatches metadata 1.1 to the compatible Worker. Old browser
live/typed writes for worker-owned sessions are ignored without insertion; Worker
writes to client-owned sessions fail. Full detail/preview use cursor ordering.

Web detail catches up in bounded cursor passes, retains the last good cursor on
failure, deduplicates IDs, disposes stale readers and starts at zero after reload.
Sign-out clears private UI before network completion. Visible changes: automatic
history catch-up and a history-only pending-sync message.

Results: API **433/433 PASS, zero skips**, types PASS, including B2/B6 cross-repository
tests. Actual Python processes + authenticated Mural HTTP + isolated PostgreSQL test
pre-commit failure, committed ACK deliberately not consumed, API/controller restart,
exact replay, ordering and unchanged minute balance. Worker **49/49 PASS**, Ruff
lint/format PASS. Web **78/78**, type/build PASS; Chrome E2E **3/3 PASS** tests 503
recovery, duplicate content and sign-out. This is fake-API browser evidence, not Cloud
media. Initial missing Web dependencies and parser/import lint failures were fixed;
locked offline installation used. Existing SDK bundle-size warning is informational.

CI, Linux container history-volume check, full local LiveKit media regression,
review/images and staging remain pending. No paid calls. SDK finals never emitted
or lost before capture cannot be recovered; conflicting final revisions fail rather
than overwrite. Failed rows remain encrypted for operator handling. Default flag is
off; B6 is not signed off.

## Candidate CI and deployment boundary

Draft PRs: [Mural #50](https://github.com/vlingo-ai/mural/pull/50), candidate
`ffafa7c`; [Worker #19](https://github.com/vlingo-ai/model-gateway/pull/19), `8dde42b`.
[Mural run 36230997321](https://github.com/vlingo-ai/mural/actions/runs/36230997321)
PASS: Web 78/78, browser E2E 3/3, isolated real LiveKit media 24/24 (three repeats,
zero retries), API 431 PASS/2 SKIP/0 FAIL, API/Web image builds and Compose validation.
The two cross-repository cases are intentionally not configured in public CI; they
were run locally with 433/433 zero skips, not falsely counted as CI PASS. Contracts,
gitleaks and stage gates passed; native clients were not applicable for this phase.
[Worker run 36231000531](https://github.com/vlingo-ai/model-gateway/actions/runs/36231000531)
PASS, including 49/49 tests and both isolated non-root container history/usage volume
seed/reopen checks. Existing media regression uses synthetic local media, not Cloud.

No merge, published release image or staging deployment yet. SSH read-only preflight
reached the VPS, but sudo requires the operator password. No service was changed.
Next: review/freeze paired candidates, operator-assisted idle/version/backlog/backup
gates, publish/build immutable candidates, compatible rollout and non-billable checks.
Real provider acceptance is not authorized by these CI results. This documentation
follow-up changes no runtime code; its CI is distinct from the verified candidates.

## Media redaction regression and preflight

Latest documentation candidate aa83bbd failed Web CI run 36231288034: real media
15 PASS / 9 FAIL. All three repeats failed the same route-evidence assertions;
nonempty `redacted-ip.invalid` in stats bypassed the native-pair fallback. Prior
24/24 success does not override this failure. Worker checks remain successful.

Test-only fix validates IPv4 evidence, correlates both ports and both protocols,
and rejects conflicting addresses. No configured loopback substitution is used;
unknown addresses still fail the existing route assertion. Added 13 regression
cases: redaction/empty/mDNS/invalid addresses, missing evidence, mismatched pairs,
conflicts and genuine non-loopback values. Local Web 91/91 and types PASS.
Full isolated Linux media rerun is pending; no production code or gate weakened.

Operator preflight: DB non-closed sessions 0; deployed usage outbox pending 0;
user confirmed current Cloud concurrent Agent sessions 0. Encrypted backup
postgres-20260926T090347Z.sql.gz.age copied offsite to Mac: SHA256 matches,
age decrypt + gzip integrity PASS. This is not a restore drill. Actual component
release wrappers/images were inspected; existing GPT-6 settings remain untouched.
Idle checks must be refreshed before rollout. No B6 merge/deployment/activation.
