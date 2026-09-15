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

The API implementation will adopt these contract shapes behind feature
flags during Phase 4. Until then, this artifact freezes the target Web/iOS/Android boundary.

The API pins only the Model Gateway protocol requirements in
`services/api/contracts/model-gateway.lock.json`; it does not copy the Gateway
contract. Check an actual Gateway checkout from `services/api/` with:

```bash
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts
```
