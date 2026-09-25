# Mural API internal provider contracts

This directory contains requirements that the Mural API enforces at its internal
provider boundary. It is not a client-facing contract.

`model-gateway.lock.json` pins the minimum compatible Model Gateway protocol,
paths, schemas and sideband events. It still requires legacy Gateway Live schemas although staging
uses Worker/LiveKit for realtime media. This is known compatibility debt, not the intended service
boundary; split required Responses contracts from legacy Live in a tested code change under the
[accepted plan](../../../docs/web-ios-model-gateway-plan.md).
The source Model Gateway contract remains in
the sibling Model Gateway repository and is checked with:

```sh
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts
```

Provider credentials, provider session identifiers and provider-only events must
not be copied into `shared/contracts/`.
