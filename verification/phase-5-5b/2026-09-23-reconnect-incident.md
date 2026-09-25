# Phase 5.5B reconnect incident — 2026-09-23

<!-- baseline-scope:2026-09-23 -->
> 历史证据：保留当时部署、测试和观察，不追改结果。旧 pending 项由最新基准及本目录索引统一管理；普通话已暂停，英语 Gate 7 仍未通过。本文件不是当前部署命令清单。
> 当前范围和后续顺序见[项目开发基准](../../docs/web-ios-model-gateway-plan.md)。

Status: **repair deployed to staging; one bounded English reconnect retest passed; Gate 7 not
accepted**. This is a single observed pass, not general proof of network recovery reliability.

## Observed failure and evidence

- The latest English session `567cfcc1-037c-448f-97bf-3bc477b2de20` became Connecting only
  after about ten seconds, then Failed rather than returning to Active after Wi-Fi was restored.
- API logs show `voice_active` at `02:21:16Z`, continuing Worker control events through
  `02:22:06Z`, then `voice_closed` following the Worker final event. No Web close endpoint call or
  `voice_close_requested` was seen in that interval. The browser did **not** initiate this close
  through Mural's API, contrary to the initial hypothesis.
- Worker logged `room session transport is closed` and `parent process shutdown` at `02:22:06Z`.
  The installed Agent SDK uses that text when its parent sends a shutdown request; its separate
  room-disconnected callback uses `room disconnected`. The available logs do not include the
  LiveKit Cloud room-end reason, so an idle/departure timeout is a strong candidate, not a
  confirmed root cause.
- Database final state was `closed`, `observed_ms=charged_ms=36000`, final provider usage true,
  `reserved_ms=0`, and no close-request timestamp. The trial balance was 225,000 ms.
- The API currently creates rooms with a ten-second `departureTimeout`. The installed LiveKit
  protocol describes this as the time the room stays open after everyone leaves. The Worker
  setting `close_on_disconnect=False` preserves its AgentSession after the browser participant
  disconnects, but does not keep a Cloud room/job alive after the server ends it.

## Why earlier fixes were insufficient

1. PR #17 extended the SDK retry policy to 90 seconds, but did not extend the room's ten-second
   departure grace or manage a browser-level recovery deadline.
2. PR #19 displayed Connecting on the browser's `offline` event. The failing Chrome run did not
   display Connecting immediately; that browser event is not a reliable Wi-Fi-loss detector.
3. PR #20 kept the Agent alive and suppressed Agent-departure failures while reconnecting. The
   installed LiveKit SDK emits `ParticipantDisconnected` **before** `Reconnecting` during a full
   restart, leaving an event-order race.
4. PR #21 verified subscribed Agent audio and retried history writes. Agent audio alone does not
   prove the local microphone was republished.
5. PR #22 rebuilt the Room on browser `online`, but missed SDK-only reconnects and treated the
   first failed rejoin as terminal. It also called the SDK's default `Room.disconnect()`, which
   stops local tracks, before attempting to publish the same microphone track in the new Room.
   This can explain the earlier Active-but-no-response symptom. PR #23 strengthened the
   Agent-audio check, but did not verify microphone publication or preserve the mic during Room
   replacement.

## Candidate repair and invariants

- API room departure grace: 60 seconds. Web/SDK recovery deadline: 40 seconds. The extra margin
  permits network detection, retry, and explicit API close before Cloud's room timeout; an
  unreachable browser still fails closed and does not run for the full 15-minute session cap.
  Tradeoff: if the browser cannot reach the API to request close, the Worker/room may run for up
  to 60 seconds after the last participant leaves, versus ten seconds previously. This increases
  worst-case provider usage for a failed connection and must be checked against the remaining
  Gate 7 allowance before another live test.
- Start Connecting on browser offline, SDK signal reconnect, SDK media reconnect, Agent audio
  unsubscribe, or unexpected Room disconnect. A browser that emits no offline event can still
  take until SDK failure detection; instantaneous Wi-Fi-loss display cannot be guaranteed.
- Let the SDK resume first, then replace the Room after a five-second fallback. An early browser
  online event can start replacement sooner. Retry transient join failures every two seconds
  within the same 40-second deadline; never create a second Mural hosted session for recovery.
- A recovered Room is Active only after it is connected, the expected Agent audio is subscribed,
  and the original local microphone track has a live, unmuted publication. Otherwise remain
  Connecting and retry. A confirmed `ROOM_DELETED` or `PARTICIPANT_REMOVED` is terminal.
- Temporary Room disconnects (including failed joins) preserve the microphone; explicit Stop,
  final failure, or app disposal stops it. A new Room must never reuse an ended mic track.
- Defer a lone Agent-participant departure for one second so the SDK's subsequent Reconnecting
  event can identify a full restart; a genuine departure still fails. Initial room join failures,
  explicit disconnects, and recovery expiry request API close and release resources.

## Verification and remaining work

Candidate local checks: Web unit tests (28), Web TypeScript check/build, API TypeScript check,
and API tests (121 passed, 288 PostgreSQL-dependent tests skipped without `TEST_DATABASE_URL`)
passed. The new simulated cases cover SDK-only recovery, confirmed
offline/online, join retry, missing Agent audio, missing microphone publication, event ordering,
Agent loss, room deletion, initial join failure, stale asynchronous results, and deadline expiry.
These are **not** evidence of live Cloud recovery. [PR #24](https://github.com/vlingo-ai/mural/pull/24)
merged as `ad1659cc6f442d7a4db06534b4a75f1c92be9371`; all six CI checks passed. On
2026-09-23, the operator deployed that exact source to the Tokyo staging VPS in API-before-Web
order, after confirming no active sessions. The API image
`vlingo-speaking-live-api:ad1659cc6f442d7a4db06534b4a75f1c92be9371` has runtime image ID
`sha256:af5b485f03b677b23f2457e3a366c77372857aff897ad219d13b9e06b6adf4cb`;
the Edge runtime image ID is
`sha256:369b0c14e3c2bbc1326f4f06245b03bc1194902ebbcfd100676c4c9954268f6f`.
Worker and Gateway remained on their existing immutable digests; PostgreSQL was not restarted,
and no migration changed or was rerun.

Before deployment, `postgres-20260923T033914Z.sql.gz.age` was copied to the separate Mac recovery
host, SHA-256 `cb22865514eadbbc60e29d5eb9a0eeedf8731b12be797f73bb4e56e5b26e3791`;
the copy decrypted and passed `gzip -t`. The previous API image tag
`vlingo-speaking-live-api:4bedf19783e5ccc819f362895d2f122a6307a9d9` remains available,
the previous Edge image is tagged `vlingo-speaking-live-staging-edge:rollback-d71cc8f`
(`sha256:df960e8c871d2fc1e9c05d9bd84029d38772d5cbe7c3acfb11a9f3f6d746c213`),
and the previous private configuration is retained as `.env.rollback-d71cc8f` with mode 600.
No database rollback is indicated for this no-migration release; do not restore a backup over
active or unresolved sessions.

Post-deployment `./verify.sh ./.env` passed public TLS, Web/API/Gateway health, disabled Gateway
audio capabilities, container status, and sanitized-log checks. The API reported healthy with
`hostedVoice=true`, `guestMinutes=false`, and `livePayments=false`. These non-billable checks
establish deployment compatibility, **not** live reconnect acceptance.

Under the existing bounded Gate 7 authorization, the operator ran one English five-second Mac
Wi-Fi interruption against the repaired Web and API. The UI entered Connecting about ten seconds
after disconnection, returned to Active after Wi-Fi was restored, and a fresh spoken English
utterance received a new audible reply. Explicit Stop returned the UI to Idle. Session
`a09b6e2a-afe3-4d22-9c7d-96f6a15a0500` closed with `user_requested`, final provider usage,
`observed_ms=charged_ms=46000`, and `reserved_ms=0`; the trial balance fell from 225,000 to
179,000 ms. The active-session check showed none. This validates the tested short-interruption
path including microphone republication; it does not validate longer outages or every browser.
The roughly ten-second Connecting delay remains a UX limitation because neither browser offline
nor SDK disconnect detection is immediate for this network failure.

After the operator reported that Server history appeared to contain only the post-reconnect line,
the signed-in Web UI was inspected. The newest history **list row** shows only its latest-line
preview; opening that row loads Conversation detail with four persisted events in order: pre-loss
user greeting and Agent reply, followed by post-recovery user greeting and Agent reply. No missing
pre-loss event was observed in this session. The detail renders below the entire history list,
outside the current viewport, so the interface makes the preview easy to mistake for the full
record. This is a separate history-discoverability UX issue, not evidence of lost persistence.

Retrieve the
Cloud room-end reason if the operator signs in to the LiveKit console; do not claim that the
ten-second timeout is proven until that record is available.

Other Gate 7 blockers from the prior record remain: controlled quota/limit refusal, Mandarin ASR
quality, Mandarin Worker-hard-stop or a reviewed language-independent rationale, and the required
latency/resource/participant-minute summary. The release must remain **deployed but not accepted**.

After the successful reconnect retest, code review found that the deployed LiveKit adapter wraps
even a terminal `CreateRoom` HTTP 429 as an uncertain transport failure. That conservatively keeps
the funding hold for reconciliation, so the requested quota-refusal assertion (`reserved_ms=0`)
could not yet be claimed. At that point, a local, **not yet deployed** follow-up treated a pre-room terminal 4xx
(other than timeout 408) as a known rejection. A dispatch 429 after room creation is known only
when room deletion is confirmed; failed cleanup and ambiguous errors remain uncertain. Mock-LiveKit
tests cover CreateRoom 429/408 and dispatch 429 with successful, absent, or failed room cleanup;
API TypeScript check, build, and the full runnable API suite (123 passed, 288 database-dependent
tests skipped without `TEST_DATABASE_URL`) pass.
This was not a Cloud quota test. Do not exhaust shared Build capacity or purchase a higher plan to
force one.

## Quota rejection repair deployed — 2026-09-23

[PR #25](https://github.com/vlingo-ai/mural/pull/25) merged as
`5f71474339ffcc2689319e7ecd8ebff2afcd2561`; contracts, secret scan, Web, Swift,
PostgreSQL-backed server, and deployment CI passed. The API adapter now treats a terminal
pre-room LiveKit 4xx other than 408 as a known refusal. A dispatch 429 after room creation is
known only if room deletion succeeds or returns exact `not_found`/404. Failed cleanup, timeouts,
and other ambiguous outcomes retain the reservation for reconciliation. Tests cover these cases
without exhausting Cloud quota. The established HostedVoice settlement path releases a known
rejection with zero usage; this deployment has **not** exercised a real Cloud quota refusal.

Before switching the API, the operator confirmed no active sessions and made encrypted backup
`postgres-20260923T061547Z.sql.gz.age`. Its separate Mac recovery copy has SHA-256
`6ea3133e686c3d7b66d099b5dffbb4e075cd5bd53604433de5bb94ab4b6d1802`, matched the VPS copy,
and passed `age` decryption plus `gzip -t`. The prior API image
`vlingo-speaking-live-api:ad1659cc6f442d7a4db06534b4a75f1c92be9371` remains tagged with
runtime image ID `sha256:af5b485f03b677b23f2457e3a366c77372857aff897ad219d13b9e06b6adf4cb`;
private rollback config `.env.rollback-ad1659c` is mode 600. The operator built the exact merged
source, then recreated **only** the API container with
`vlingo-speaking-live-api:5f71474339ffcc2689319e7ecd8ebff2afcd2561`, runtime image ID
`sha256:e06df747c27218f63db741aa85b3208010a5ee6eb77512707925919adbcfdff1`. No database
migration ran and the Worker, Gateway, Web/Edge, and PostgreSQL containers were not restarted.
`verify.sh` passed public TLS, health, disabled Gateway audio capabilities, service status, and
sanitized-log checks; `pg_isready` reported accepting connections; no active Mural session remained.
The public API `/healthz` returned HTTP 200 with hosted voice enabled, guest minutes disabled,
and live payments disabled. This is deployment verification, not Gate 7 acceptance.

## Non-billable quota-refusal chain test

A local test server returned a terminal HTTP 429 with a private body to the actual LiveKit SDK
`CreateRoom` call. The LiveKit adapter, `HostedVoice.create()`, and a dedicated PostgreSQL test
database then ran as one chain: the caller received only `provider_create_rejected` (HTTP 502)
with provider status 429; one provider request occurred; the session closed with no provider room
ID, cost, or funding exposure; the minute reservation settled with `used_ms=0` and wallet
`reserved_ms=0`; the helper liability and post-close budget became zero. Repeating the same
idempotency key did not call LiveKit again. Neither the error nor persisted session retained the
private 429 body. The complete database-backed API suite passed 412/412 tests. This is a
deterministic local integration test, **not** evidence that the LiveKit Cloud project actually
reached a quota or returned 429; the literal Cloud-refusal Gate 7 item remains open.

## Historical Cloud room-duration discrepancy

The LiveKit Build project Usage view for the preceding 24 hours displayed 17 room sessions,
102 WebRTC participant-minutes, 6.57 MB upstream, and 5.6 MB downstream. These are
**project-wide** figures, not Mural-billed duration or a per-test latency measurement.
Two 2026-09-22 pre-PR-#24 rooms explain at least 59 participant-minutes of that total:

- Mural session `2da2c09b-f435-4ee8-84ad-f9eb1c4e1c75` closed at 15:00:24 CST after
  66,000 ms of observed/charged provider usage. A subsequent LiveKit room session of the
  **same name** opened at 15:00:55 CST and had only a Web subscriber until 15:39:30 CST.
  LiveKit displayed 38 participant-minutes for this later room.
- Mural session `3cce6e55-4bf4-44f2-8589-9258fdca1ed4` closed at 17:14:10 CST after
  90,000 ms observed/charged. A subsequent same-name LiveKit room opened at 17:14:41 CST
  with only a Web subscriber until 17:35:58 CST. LiveKit displayed 21 participant-minutes.

Both later rooms were closed when inspected. The 31-second gap after each Mural close and the
single Web subscriber are consistent with an older browser SDK retry rejoining a same-name room
after Mural had finalized it; this is an **inference**, not a proven LiveKit server cause. The
then-deployed Web revision predated PR #24's bounded recovery and explicit fail cleanup. The
PR-#24 English retest room, by contrast, had both Agent and Web participants, opened at 12:04:21
and closed at 12:05:29 CST on 2026-09-23, with both participants leaving by 12:05:13 CST;
Mural closed at 12:05:13 CST with 46,000 ms charged. This one clean run does not establish
that all later room rejoin attempts are impossible. Track Cloud participant-minutes separately
from Mural's 15-minute authorized provider-usage budget; do not infer OpenAI usage from a Web-only
room. The old Web revision handled an unexpected `RoomEvent.Disconnected` by displaying Failed
without closing the Room. PR #24 instead enters a bounded 40-second recovery; a terminal room
deletion or expired recovery calls the API close and disconnects the current Room. Focused mock
tests now assert that Agent loss, deleted room, and exhausted recovery all disconnect their Room.
This bounds the application-managed retry path after loss detection; it is not a guarantee of
instant network-failure detection or proof against every Cloud-side room rejoin. Recheck the
remaining trial allowance, Cloud project usage, and active sessions before any further live run.

At 2026-09-23 15:10 CST, the project-wide LiveKit Usage dashboard's **past 7 days** window
displayed 18 room sessions, 103 WebRTC participant-minutes, 6.82 MB upstream, and 5.84 MB
downstream. The Sessions dashboard's **past 24 hours** window displayed 17 rooms; filtering to
Active returned no results. These are different time windows and cannot be compared as a billing
reconciliation. The latest post-repair room's Cloud events showed a Web participant connection
timeout at 12:04:56.66 CST and a new active Web participant at 12:04:57.61 CST, a 0.95-second
Cloud-side participant gap. The start of the Wi-Fi outage, browser state transition, first audible
response, and interruption were not timestamped by that page, so this is **not** a measured UX
reconnect latency. Agent insights for that room reported no observability data; historical
first-audio and interruption median/worst values cannot be reconstructed reliably from the
available Cloud dashboard.

At the later database audit, 16 Mural sessions created since 2026-09-22 00:00 UTC were all
`closed`, none unresolved; their `charged_ms` total was 721,000, consistent with the separately
observed 179,000 ms remaining from the 900,000 ms authorization. Two records carried
`provider_usage_final=false`, both English `worker_lease_expired` cases. Session
`b5f7f26b-2cf8-4570-9ffc-9ecf34ed5dd6` had zero trusted observed milliseconds and the disclosed
15,000 ms minimum charge; `aed1ca70-5c66-497d-baef-53822d66efb9` had 42,000 ms observed and
charged. Both minute reservations were `settled` with matching `used_ms`; neither represents an
open user hold. The provider's final cost for these two cases remains unconfirmed and retains an
operator reconciliation marker. Do not conflate a closed Mural ledger entry with a verified final
OpenAI invoice.

A subsequent read-only aggregate of those 16 Mural sessions found the following close outcomes;
all were `closed` and the total remained 721,000 ms: English `deadline` 1 / 42,000 ms,
`user_requested` 4 / 186,000 ms, `worker_lease_expired` 2 / 57,000 ms, and no close reason
recorded 6 / 327,000 ms; Mandarin `user_requested` 3 / 109,000 ms. The deliberate fault tests
and null close reasons prevent this distribution from being reported as a natural production
error rate. No new billable session was started to collect it.

An **idle-only** `docker stats --no-stream` snapshot showed API 0.06% CPU / 33.41 MiB, Edge
0.01% / 13.14 MiB, Worker 0.60% / 458.7 MiB, Gateway 0.04% / 66.66 MiB, and PostgreSQL 0.06% /
36.98 MiB. These values are not peak CPU/RSS during a live call and cannot satisfy that Gate 7
measurement by themselves.

The final read-only funding check joined the most recent English session to its trial wallet:
`balance_ms=179000`, `reserved_ms=0`. Of the authorized 900,000 ms, 721,000 ms (12 min 1 s)
has been charged and 179,000 ms (2 min 59 s) remains. A separate aggregate of those sessions
reported `provider_cost_nano=600833336`; the settled helper-request aggregate reported
`cost_nano=63000` and zero unresolved helpers. Their combined **Mural ledger estimate** is
USD 0.600896336, not the OpenAI invoice or proof that the USD 2 lifetime cap has been verified
externally. The two `provider_usage_final=false` Worker-lease cases noted above still need
reconciliation. No additional billable session was started for these read-only checks.

## Mandarin Worker hard-stop review basis

The 2026-09-22 English hard-stop is the live fault-injection evidence: Mural closed the session
as `worker_lease_expired`, kept `provider_usage_final=false` for operator reconciliation, and
released its minute reservation. A separate Mandarin Worker process kill would spend the shared
allowance and interrupt the same staging Worker, so the proposed substitute is an explicit
language-independence review, **not** a claim that a Mandarin hard-stop was run.

`workers/livekit-gpt-live/mural_livekit/metadata.py` admits both `en` and `zh-CN`. The Worker
heartbeat and shutdown paths in `worker.py` send only the opaque session ID, cumulative usage,
and control token; neither branches on language. Mural's `HostedVoice.tick()` chooses lease
expiry and room hangup from persisted provider ID, lease timestamp, and observed milliseconds;
`recordUsage()` settles from the trusted cumulative usage and funding ledger, with no language
branch. Language affects initial instructions and history, not these failure/settlement paths.
Both languages previously completed ordinary Cloud sessions through the same Worker/control
channel. This review supports using the English live hard-stop as representative of the Mandarin
lease/settlement mechanism, while leaving Mandarin ASR quality and Cloud quota refusal open.
