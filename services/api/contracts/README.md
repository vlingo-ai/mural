# Mural API internal provider contracts

This directory contains requirements that the Mural API enforces at its internal
provider boundary. It is not a client-facing contract.

`model-gateway.lock.json` pins the minimum compatible Model Gateway protocol,
paths, schemas and sideband events. The source Model Gateway contract remains in
the sibling Model Gateway repository and is checked with:

```sh
npm run check:gateway-contract -- /absolute/path/to/model-gateway/contracts
```

Provider credentials, provider session identifiers and provider-only events must
not be copied into `shared/contracts/`.
