# Generated Live DTO candidates

Run `python3 scripts/generate_live_dtos.py` from the repository root; `--check` detects drift.
The selected-schema hash makes regeneration attributable without timestamps.

Native scope: LiveWebRTCTransport, LiveKitRoomTransport, LiveCapabilities, HostedHelperUsage.
TypeScript `live.d.ts` additionally covers LiveTransport, LiveSession, LiveSessionStatus,
CurrentLiveSession, LiveHistoryMessage, LiveSessionCreateRequest, HostedHelperResult,
HostedHelperStreamEvent and ErrorResponse. Discriminated unions and missing vs nullable fields
have compile-time negative fixtures in services/api/tests/live-dto-types.ts.
These are staged shared artifacts, not yet imported by Web/iOS/Android runtime code.
No native LiveKit feature is enabled. Contracts CI checks generation without native builds.

Limitations: native enum/const fields currently remain primitive strings/booleans and are not
runtime validators. Swift Codable optional fields and Kotlin nullable defaults are wire-shape
scaffolding, not a complete missing/null contract. Union decoding, full session/helper DTOs,
native round-trip tests, public Swift construction and client adoption remain pending.
Only generated TypeScript has been typechecked; Swift/Kotlin compilation is NOT_RUN.
TypeScript wire types do not enforce UUID/date formats, byte limits or oneOf exclusivity at runtime.
Do not treat these files as production client SDKs or replace current clients with them yet.
