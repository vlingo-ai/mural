# Security

The fork has a hosted Web staging path (LiveKit/Worker, Mural API and Gateway) as well as existing
native/BYOK compatibility. Hosted provider keys remain server-side; native personal keys stay in
platform secure storage and out of exports. Never embed a shared service key in a distributed app.
Hosted Web history is stored server-side, unlike the existing native local archives.
See the [current baseline](docs/web-ios-model-gateway-plan.md) for known control/cleanup risks,
credential boundaries and temporary staging hardening exceptions.

## Report a vulnerability

Use **Security → Report a vulnerability** in the GitHub repository when private vulnerability reporting is enabled. Include the affected version, reproduction steps and likely impact. Use synthetic conversations and redacted diagnostics; do not send a live credential or another person’s data.

Do not disclose an unpatched vulnerability or credential in a public issue. If this fork's private
reporting action is unavailable, obtain an operator-approved private contact. Upstream's contact
is not automatically this service's support channel; do not send it private staging data.

## Scope

Useful reports include credential exposure, unauthorized data access, unsafe backup import, content leaking between learners or languages, and ways to bypass future server-enforced usage limits. Incorrect model answers and pronunciation problems belong in ordinary bug reports unless they reveal a security issue.

The [September 12 review](release/security-audit-2026-09-12.md) records upstream settings at that
time, not verification of this fork's current GitHub configuration. Confirm private reporting,
secret scanning, push protection and dependency alerts on the intended repository. CI checks are
not proof that every repository-level setting is enabled. No response-time commitment is established.
