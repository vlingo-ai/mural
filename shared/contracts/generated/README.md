# Generated Live DTO candidates

Run `python3 scripts/generate_live_dtos.py` from the repository root; `--check` detects drift.
The selected-schema hash makes regeneration attributable without timestamps.

All three outputs cover LiveWebRTCTransport, LiveKitRoomTransport, LiveCapabilities,
HostedHelperUsage, LiveTransport, LiveSession, LiveSessionStatus,
CurrentLiveSession, LiveHistoryMessage, LiveSessionCreateRequest, HostedHelperResult,
HostedHelperStreamEvent and ErrorResponse. Discriminated unions and missing vs nullable fields
have compile-time negative fixtures in services/api/tests/live-dto-types.ts.
These are staged shared artifacts, not yet imported by Web/iOS/Android runtime code.
No native LiveKit feature is enabled. Contracts CI checks generation without native builds.

Native union codecs dispatch on unique string discriminators; enum/const values are checked
on decode and encode. Required nullable fields must exist; optional fields use WireField
(.missing / .present in Swift, Missing / Present in Kotlin), preserving missing vs explicit null.
Swift structs expose public construction. Native codecs intentionally tolerate unknown object
keys for forward compatibility; they are not full JSON Schema validators. UUID/date formats,
lengths/ranges and UTF-8 constraints remain API boundary checks. TS types are compile-time only.

Run from the repository root:

```sh
python3 scripts/generate_live_dtos.py --check
node scripts/check_swift_live_dtos.mjs
node scripts/check_kotlin_live_dtos.mjs
```

Swift requires swiftc. Kotlin uses existing Gradle cache jars (compiler/plugin 2.1.20,
serialization 1.8.0) and Java; missing tools fail, never silently skip. No downloads, Gradle,
emulator, app signing or paid provider are involved. Both use the same 24 JSON fixtures;
API tests also validate those fixtures against OpenAPI. Native execution is currently local,
not part of phase-Web hosted CI; Python drift and API schema/type checks are in CI.

B3 generation scope is the reviewed Live wire graph above, not a general OpenAPI SDK generator.
Legacy helper request's recursive user-supplied schema and unrelated account/model-task DTOs
are not generated. They must not silently fall back to untyped generated clients. Production
client adoption requires separate adapter/compatibility tests in the relevant platform phase.
