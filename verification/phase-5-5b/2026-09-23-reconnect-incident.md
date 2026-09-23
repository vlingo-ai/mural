# Phase 5.5B reconnect incident — 2026-09-23

Status: **staging deployed, Gate 7 not accepted**. This record distinguishes the currently deployed
revision from the candidate fix. Do not spend more of the bounded live allowance merely to repeat
the same five-second Wi-Fi test before the candidate passes review and non-billable checks.

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
These are **not** evidence
of live Cloud recovery. Review/CI, compatible API-before-Web deployment, non-billable health and
sanitized-log checks, and a bounded live retest within the operator's existing authorization
remain. Retrieve the
Cloud room-end reason if the operator signs in to the LiveKit console; do not claim that the
ten-second timeout is proven until that record is available.

Other Gate 7 blockers from the prior record remain: controlled quota/limit refusal, Mandarin ASR
quality, Mandarin Worker-hard-stop or a reviewed language-independent rationale, and the required
latency/resource/participant-minute summary. The release must remain **deployed but not accepted**.
