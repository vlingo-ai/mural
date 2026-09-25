# Generated Live DTO candidates

Run `python3 scripts/generate_live_dtos.py` from the repository root; `--check` detects drift.
The selected-schema hash makes regeneration attributable without timestamps.

Native scope: LiveWebRTCTransport, LiveKitRoomTransport, LiveCapabilities, HostedHelperUsage.
Both native outputs now include a LiveTransportDTO union codec with explicit type dispatch;
unknown/missing type fails and encoding a mismatched variant fails. The generator rejects
changes to the reviewed discriminator mapping until adapters are updated.
TypeScript `live.d.ts` additionally covers LiveTransport, LiveSession, LiveSessionStatus,
CurrentLiveSession, LiveHistoryMessage, LiveSessionCreateRequest, HostedHelperResult,
HostedHelperStreamEvent and ErrorResponse. Discriminated unions and missing vs nullable fields
have compile-time negative fixtures in services/api/tests/live-dto-types.ts.
These are staged shared artifacts, not yet imported by Web/iOS/Android runtime code.
No native LiveKit feature is enabled. Contracts CI checks generation without native builds.

Limitations: native enum/const fields currently remain primitive strings/booleans and are not
runtime validators. Swift Codable optional fields and Kotlin nullable defaults are wire-shape
scaffolding, not a complete missing/null contract. Full session/helper DTOs, public Swift
construction and client adoption remain pending. Swift transport-only compilation/round-trip
and rejection tests passed; Kotlin compilation and round-trip tests are NOT_RUN.
Run the lightweight Swift check by compiling LiveDTOs.swift with
../tests/TransportRoundTrip.swift into a temporary executable, then executing it.
TypeScript wire types do not enforce UUID/date formats, byte limits or oneOf exclusivity at runtime.
Do not treat these files as production client SDKs or replace current clients with them yet.
