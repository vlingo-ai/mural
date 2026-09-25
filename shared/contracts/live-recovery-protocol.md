# Live recovery reference protocol v1 — B4 candidate

Status: B4 local Web candidate adopts the reducer for LiveKit activation, recovery, Room replacement
and Stop; NOT deployed. iOS/Android adapters are not implemented.
The shared reducer is in `apps/web/src/live/recovery-protocol.ts`.
Language-independent examples are in [live-recovery-traces.json](live-recovery-traces.json).

## Boundaries

- Product generation identifies one explicit Start. Room epoch identifies a transport instance
  within that generation. Never create a second product/provider session to repair a transport.
- Adapter events carry generation, room epoch and local monotonic delivery time. A mismatched
  generation/epoch or backwards timestamp is ignored. An adapter must serialize events; this is
  not a substitute for validating server response revisions or out-of-order network replies.
- Product phase, signaling and microphone/Agent readiness are separate facts. Signal loss enters
  recovering but preserves media evidence. It does not instruct the SDK to disconnect or replace
  a Room. An SDK/adapter must justify any replacement separately.
- `media` means local microphone publication and expected Agent audio subscription readiness.
  It does NOT prove that the Worker heard speech or that the user heard audio. Packet/track health
  and real post-recovery interaction remain separate required verification evidence (B5).
- Silence is not a failure signal. Media loss must be established by explicit adapter evidence,
  not an amplitude threshold or the absence of speech.
- Replacement resets media readiness and increments room epoch; callbacks from the previous
  Room cannot revive it. Fresh microphone publication is required.
- Stop immediately forbids activation; closing remains until authoritative close confirmation.
  A one-second UI timeout is not a settlement acknowledgement. Failed/closed are terminal within
  a generation; a new Start creates a new reducer instance.
- Control expiry and confirmed Agent loss terminate recovery. The model's `controlUntil` is a
  proposed local conservative deadline, NOT a new server field and NOT the Worker private lease.
  Web converts the existing authenticated create deadline against wall/monotonic times captured
  before the request; response transit consumes the remaining duration. It never extends this
  deadline on reconnect. This assumes a reasonably synchronized client wall clock; it is NOT
  a server-clock proof. Server/Worker enforce the actual authority independently. Status is checked
  before fallback Room replacement and SDK-only restoration; shorter returned deadlines shorten
  the local bound. These reads are snapshots, not a lock against subsequent server closure.
  A response arriving after expiry cannot revive the same model.

## Implementation sequence / still required

1. Reference model and common traces (implemented and locally tested).
2. Web adapter adoption: query existing status, distinguish signal-only reconnect from media loss,
   preserve SDK recovery first, guard every async getUserMedia/create/connect/publish completion,
   cancel timers on Stop, handle close failure visibly without falsely claiming settlement.
3. Add fake-SDK integration tests for that adapter, including status rejection, repeated reconnect,
   old Room callbacks, microphone permission denial/ended track, Stop at each await boundary,
   pending close retry, control expiry and no duplicate createLiveSession.
4. Before merge describe the UI change (connecting/closing/error semantics); verify matched server
   contracts. Stage and validate the authorized runtime release before claiming delivery.
5. Native adapters consume these traces in Phase 6 / Android phase; no native runtime change here.
   Real local SDK/media tests are B5, not satisfied by this pure reducer.

No new API endpoint, model route, billing policy or paid test is enabled by this file.
