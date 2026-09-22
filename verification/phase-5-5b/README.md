# Phase 5.5B verification records

Store sanitized, dated Cloud Build verification reports here. Do not commit `.env`, credentials,
raw container inspection, transcripts, room metadata, database dumps, or provider response bodies.

Use `deploy/phase-5-5b/README.md` as the gate order. A preparation or local Compose result must not be
described as a real deployment or Phase 5.5B acceptance.

The current staging operator accepted the runbook's dynamic-VPN SSH exception on 2026-09-20:
TCP 22 may temporarily remain public while public-key-only authentication, disabled root/password
login, UFW rate limiting, automatic security updates, and SSH logging are verified. Every dated
report must list this as an unresolved hardening item until a source-restricted or private access
path replaces it. This exception does not authorize exposing ports 5432, 8000, or 8080.

The staging operator also accepted the current shared LiveKit project key pair for the bounded
Phase 5.5B staging gate on 2026-09-22. The API uses it for room lifecycle, agent dispatch, and
short-lived participant tokens; the Worker uses it to authenticate and register. Record splitting
this into distinct API and Worker key pairs as an unresolved defense-in-depth item until the pairs
are independently rotatable and the old shared pair has been revoked. `LIVEKIT_CONTROL_SECRET`
must remain API-only. Do not record key values, secret hashes, or raw environment inspection.
