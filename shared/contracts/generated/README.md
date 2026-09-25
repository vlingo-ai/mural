# Generated Live DTO candidates

Run `python3 scripts/generate_live_dtos.py` from the repository root; `--check` detects drift.
The selected-schema hash makes regeneration attributable without timestamps.

Scope: LiveWebRTCTransport, LiveKitRoomTransport, LiveCapabilities, HostedHelperUsage.
These are staged shared artifacts, not yet imported by Web/iOS/Android runtime code.
No native LiveKit feature is enabled. Contracts CI checks generation without native builds.

Limitations: native enum/const fields currently remain primitive strings/booleans and are not
runtime validators. Swift Codable optional fields and Kotlin nullable defaults are wire-shape
scaffolding, not a complete missing/null contract. Union decoding, full session/helper DTOs,
native round-trip tests, public Swift construction and client adoption remain pending.
Only generated TypeScript has been typechecked; Swift/Kotlin compilation is NOT_RUN.
Do not treat these files as production client SDKs or replace current clients with them yet.
