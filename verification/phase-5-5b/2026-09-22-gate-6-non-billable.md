# Phase 5.5B Gate 6 non-billable staging verification — 2026-09-22

Status: **in progress; deployed but not accepted**. No billable English or Mandarin acceptance
session was authorized or started by the checks recorded here.

## Verified

- Public API health returned `ok=true`, `hostedVoice=true`, `guestMinutes=false`, and
  `livePayments=false`.
- The full non-billable verification script passed public TLS, health, disabled Model Gateway audio
  capability, required container state, and its sanitized-log check.
- Database, API, and Model Gateway were healthy; the Edge and Agent Worker were running. The Worker
  registered with the named staging agent in the intended LiveKit project.
- PostgreSQL, Model Gateway, and API listened only on VPS loopback ports 5432, 8000, and 8080.
  Independent external probes could not connect to those ports or to the Worker's port 8081. A Mac
  `nc` check while using VPN reported misleading successful TCP connections for all four ports; VPS
  socket inspection, UFW policy, and an independent no-proxy probe were used to resolve the result.
- UFW remained default-deny for incoming traffic and allowed only the documented SSH, HTTP, HTTPS,
  and HTTP/3 rules. The dynamic-VPN public SSH exception remains unresolved as recorded in this
  directory's README.
- Environment-name inspection exposed no secret values: API had no OpenAI key; Worker had no
  database, Accounts, or Gateway secret; Model Gateway had no LiveKit credential or Worker key.

## Accepted security follow-up

The API and Worker currently receive the same LiveKit project API key pair for different required
roles. This is functionally expected for the current staging design, but couples their credential
rotation and revocation. The operator accepted it for bounded Phase 5.5B staging and requested that
separate API and Worker LiveKit key pairs be tracked for later hardening. Before broader or
long-term operation, implement explicit per-service variables, require unequal pairs in preflight,
verify room lifecycle/dispatch/Worker registration, and revoke the shared pair. This improves
auditability and independent revocation but is not, by itself, a claim of fine-grained provider
authorization. `LIVEKIT_CONTROL_SECRET` remains API-only.

## Remaining gate

Authenticated restricted-account capability checks and the separately authorized, billable
English and Mandarin Gate 7 acceptance remain incomplete. Phase 5.5B is not complete.
