# B7 release verification — September 27

## Eighth iteration: stage-scoped CI reconfirmation

User reiterated separate Web/iOS/Android execution. Current ci-stage.json is
phase 5.5/platform web. Evaluating B7 workflow/deploy paths returns web/server/
deployment=true, swift/android/android_release=false. Added explicit regression
for all three stages; script suite 95/95 PASS. Worker repository workflows contain
server/image checks only, not mobile jobs. Lightweight scope and required summary
jobs remain; native tasks are NOT_APPLICABLE, not PASS. No all-platform override.

## Seventh iteration: Worker publishing parity and image-test wiring

Worker workflow candidate requires exact-SHA main push Checks success, builds
linux/amd64 with revision label, and uploads registry-digest component artifact.
Docker credentials use a temporary config with exit cleanup in both publishers.
Worker Checks now runs a non-root/read-only/network-none image probe harness.
Harness uses real HTTP and subprocess probe, synthetic SDK run, no Cloud/model.
Local harness PASS; Ruff lint and 28-file format checks PASS. Docker unavailable
on this Mac: actual container execution NOT_RUN pending CI. No images published,
no deployment, no real provider call. Dedicated pull identity, package visibility,
full release manifest, restore/rollback exercise and final B7 closure remain open.

## Sixth iteration: API CI publishing candidate

Added main-only manual API publishing workflow, explicit linux/amd64 build,
revision/source labels and digest component artifact. Before build/push, require
latest exact-SHA main push runs for checks.yml/contracts.yml/secrets.yml to be
completed/successful; missing, pending, cancelled, failed or unreadable fails.
Local script suite 94/94 PASS and diff whitespace PASS. Workflow execution,
package private visibility, dedicated pull identity and deployment NOT_RUN.
Worker publishing parity and Docker readiness integration remain pending.
No image pushed or paid provider call made. Component artifact is not a complete
six-service release manifest and does not prove deployed identity.

## Fifth iteration: HTTP lifecycle and release probe

Local real loopback HTTP test exercises 503/200/503 and listener cleanup on normal,
exceptional and cancelled SDK run (SDK itself mocked, no Cloud). Container probe
uses no proxies, 5-second socket timeout, 1024-byte body limit and exact schema;
verify wraps Docker exec with 10-second timeout, captures output and requires the
fixed PASS marker. Timeout, malformed/oversized data and false readiness fail.
No response body or exception detail is emitted. New Worker suite 69/69 PASS,
Ruff PASS; Mural existing script suite 93/93 PASS and verify shell syntax PASS.
Initial Ruff BLE001 failure was fixed with explicit network/parsing exceptions.
Docker exec wiring is implemented but not integration-tested; CI and VPS remain
NOT_RUN. No deployment, real provider call or new waiver. Release plan updated.

## Fourth iteration: Worker registration readiness candidate

Worker base `422a481`, sibling worktree `model-gateway-b7-readiness`;
candidate changes remain uncommitted. Container-local loopback port 8082 `/ready`
reports only schema version and registered-transport boolean. Agents 1.8.2 hook
is entered after registration ACK; disconnect, cancellation, exception and
draining revoke readiness. Unreviewed SDK versions fail startup explicitly.
Network failure detection remains subject to SDK heartbeat; this is not proof
of media/provider availability or instant physical connectivity.

New tests 10/10 and full Worker suite 59/59 PASS; Ruff PASS. Reused B6 frozen
virtualenv, not clean-install evidence. Initial lint/cache permission failure
was resolved using approved execution with no cache; no test failure hidden.
HTTP listener lifecycle integration and Mural verify wiring remain pending,
as do CI publishing, deployment and restore exercise. No paid calls/deployment.
Reusable rule promoted to release-verification-plan: old registration logs/IDs
never substitute for current transport evidence; SDK hook upgrades require review.

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

## Scope reconfirmation

User asked whether the accepted B7/A2 unified-build decision is part of this B7.
Confirmed existing baseline explicitly includes it. Added B7.1–B7.6 checklist to
separate local gates, current Worker readiness, CI publishing, dedicated read-only
pull identity, actual rollout and isolated recovery. No scope deferral: manifest
validation does not complete unified publishing. Dedicated credentials may require
operator/admin provisioning, not broader personal-token access. Documentation-only
clarification; diff whitespace PASS, no runtime tests added this step.
