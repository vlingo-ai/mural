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

Status on 2026-09-23: the checked-in OpenAPI has known drift from the deployed API.
It still requires the legacy WebRTC transport shape and does not cover the current LiveKit create
request/response correctly. Do not generate production clients assuming parity.
The [accepted plan](../../docs/web-ios-model-gateway-plan.md) requires runtime/contract tests first,
then compatible DTO generation and shared JSON recovery fixtures for TS/Swift/Kotlin.
New protocol/ownership/execution fields in the design are not yet published endpoints.

The API pins only the Model Gateway protocol requirements in
`services/api/contracts/model-gateway.lock.json`; it does not copy the Gateway
contract. Check an actual Gateway checkout from `services/api/` with:

```bash
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts
```
