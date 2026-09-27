# B7 release verification — September 27

Base main f15b3a0; sibling worktree mural-b7-release-verification. No paid calls,
deployment or production configuration changes. B6 real test skip is not inherited.

## First iteration: fail-closed container gate

Existing verify.sh printed container state but did not assert it. It now evaluates
exactly one inspected container per service, checks Compose service identity,
running/not-paused/not-restarting/not-OOM state, zero restarts and required healthy
status for API/Gateway/database. Optional declared health must also be healthy.
Invalid/missing inspection input fails. Raw inspect/environment content is not
printed by the evaluator. Eight unit/CLI tests PASS; shell syntax and diff whitespace
checks PASS. Existing Contracts unittest discovery includes the new tests.

This is only a local candidate. No CI or VPS verification claimed. Worker running
is explicitly NOT registration proof. Historical registration log markers are not
sufficient for current liveness; registration freshness remains a separate B7 task.
Remaining: collector/manifest and duration metadata, fresh Worker-registration gate,
full command failure fixtures, controlled API CI image publishing/private pull identity,
isolated encrypted-backup restore drill, candidate CI and deployment of verification tools.
Do not declare B7 complete or the existing verify.sh a comprehensive release gate yet.

## Second iteration: identity schema and readiness investigation

Added standalone stdin manifest schema validator: exact service/field allowlist,
full commit IDs, positive CI run IDs, explicit registry_digest vs local_image_id,
immutable image syntax and target platform. Unknown fields/floating tags/missing
services fail. This validates format only, NOT registry existence, provenance,
CI success or equality with running containers. It is not yet wired into verify.sh.
Five new tests and full scripts suite **85/85 PASS**; diff whitespace PASS.

Inspected installed LiveKit AgentServer implementation: root health checks inference
process and connection_failed, while /worker exposes descriptive information, not
current connection registration. Neither is sufficient as a fresh-registration gate.
No readiness shortcut added. Need pinned-SDK adapter with reconnect/disconnect tests
or independently verified control-plane evidence. This remains an implementation gap.
No changes deployed; no real sessions. B7 remains incomplete.

## Third iteration: runtime identity collection

verify.sh now requires an explicit manifest before probes. New read-only Docker
collector requires exactly one container for each project/service, evaluates strict
container health, resolves the expected image without pulling, checks actual image
ID/platform and registry RepoDigests (or exact local image ID). Bounded subprocesses
capture raw Docker output in memory; report contains only fixed reason/status fields
and monotonic elapsed milliseconds. Command/JSON failures produce UNKNOWN and exit
nonzero, never raw stderr. Eight added identity fixtures pass; scripts full suite
**93/93 PASS**, shell syntax and diff whitespace PASS. Not yet tested against VPS
or CI. Manifest source/CI references remain operator-reviewed metadata, not verified
attestations. SDK readiness adapter remains pending; no production mutation.
