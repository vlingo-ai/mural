# Phase 5.5B reconnect incident — 2026-09-23

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
cannot yet be claimed. A local, **not deployed** follow-up changes only a pre-room terminal 4xx
(other than timeout 408) into a known rejection; errors after room creation and ambiguous failures
remain uncertain. Mock-LiveKit tests cover CreateRoom 429/408 and post-room dispatch 429 with
cleanup; API TypeScript check, build, and the full runnable API suite (122 passed, 288
database-dependent tests skipped without `TEST_DATABASE_URL`) pass.
This is not a Cloud quota test and must be reviewed and deployed before any controlled live
rejection exercise. Do not exhaust shared Build capacity or purchase a higher plan to force one.
