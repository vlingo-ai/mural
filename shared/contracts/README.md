# Mural shared contracts

This directory owns the API consumed by Mural Web, iOS and Android. It is deliberately a
product contract rather than a model-provider contract.

- Clients send product intent, such as `translation` or `assessment`.
- Mural API owns prompts, model aliases, provider routing, quotas, and persistence.
- Provider credentials, provider session IDs, raw provider events, and billing internals
  never appear in this contract.
- `mural-api.openapi.json` is the source used to generate Web, iOS and Android DTOs in a later phase.
- Additive optional fields are compatible within version 1. Breaking changes require a
  new version or a coordinated client migration.

Status on 2026-09-25: B3 is in progress. Live creation now describes the existing top-level
optional `sdp`, server-selected WebRTC/LiveKit transport, billing fields, capabilities and nullable
current-session response. JSON-schema fixtures cover both transports and reject stale shapes.
Actual Live route/isolated-database response validation is now covered. Helper JSON/SSE declarations
and synthetic event fixtures are added; actual helper route serialization/Accept negotiation is
validated with a fake helper and isolated authentication DB. This is not full helper/provider
integration. The reviewed Live DTO graph is generated for all three languages with shared
round-trip fixtures; runtime client adoption is deferred. Do not assume full API parity.
The deprecated `instructions` field documents existing compatibility only; new clients must not
treat it as new prompt authority. API language compatibility does not enable deferred UI languages.
The [accepted plan](../../docs/web-ios-model-gateway-plan.md) requires runtime/contract tests first,
then compatible DTO generation and shared JSON recovery fixtures for TS/Swift/Kotlin.
New protocol/ownership/execution fields in the design are not yet published endpoints.

The API pins only the Model Gateway protocol requirements in
`services/api/contracts/model-gateway.lock.json`; it does not copy the Gateway
contract. Check an actual Gateway checkout from `services/api/` with:

```bash
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts
```

The default `responses` profile checks shared protocol, Responses and usage requirements without
requiring obsolete Gateway Live endpoints or sideband files. Explicitly check legacy compatibility with:

```bash
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts legacy-live
```

Unknown profiles fail closed. These checks inspect contract declarations, not a running Gateway.
LiveKit Worker control events remain a separate internal authenticated protocol, not public DTOs.

First DTO candidates and explicit limitations are under [generated/](generated/README.md).
Generation/checking covers the selected Live request/response graph, including native unions
and field presence. See its README for excluded legacy inputs and runtime adoption boundaries.
