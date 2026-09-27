# B7 release verification — September 27

## Current summary (supersedes earlier pending checkpoint wording)

Latest gate validation: operator confirms authenticated candidate gate PASS.
VPS terminal confirms same CLI under empty Docker config fails and shell &&
does not execute the simulated deployment marker: PASS; temporary directory
removed. Real service switch was not attempted. Exact expired-token test remains
NOT_RUN. Candidate 5c9ebcc PR53 CI: Checks36305592786, Contracts36305592608,
Secrets36305592599 and lightweight Android gate all PASS. Web/deployment ran;
server/Swift/Android/emulator scope-skipped. Host-side gate still staged rather
than installed in release directory; final evidence commit needs its own CI.

Registry-gate follow-up full local Python suite: 104/104 PASS, diff check PASS.
Candidate 5c9ebcc pushed for PR #53; CI pending, gate staged on VPS for read-only
validation, not yet part of a completed deployed gate acceptance. No UI change,
runtime image rebuild or new provider call required for this host-side script.

Follow-up implementation: existing deployment is operator-composed, not a unified
automatic wrapper. Added candidate check-private-registry.py remote-access gate
for immutable API/Worker references, no raw responses, bounded timeout and
fail-closed errors. Six local tests PASS including real CLI with fake denied
Docker and shell && marker proving the subsequent simulated action is not run.
This is local fault injection, not a real deployment failure or expired PAT test.
Candidate is not yet CI-tested, installed on VPS or incorporated in an automated
deployment wrapper; do not retroactively claim the prior rollout used it.

B7 API/Worker are deployed again after the successful B7→B6→B7 non-billable
rehearsal; final total verification PASS. Backup restore and all 58 table row
counts against the encrypted dump PASS. Existing staging superuser access risk
remains, not a least-privilege acceptance. No new real-media test or waiver.
Dedicated PAT expiry/owner recorded; no-credential registry rejection PASS,
actual expired-token and deploy-wrapper rejection are not tested. Overall B7
remains open pending final review of these boundaries and documentation review.

Cleanup: confirmed pg_ctl reports no server running and no postmaster.pid;
deleted only /private/tmp/b7-restore.vPnGZT1G (49 MiB restored private database
and diagnostics) and the two B7 temporary restore scripts. Not retained in Trash;
recoverable by rerunning restoration from the preserved encrypted backup whose
SHA-256 was rechecked unchanged. No backup, key, rollback image/config or live
database deleted. No forensic-erasure claim.

## Closure audit

VPS negative registry check observed: API and Worker private immutable manifests
both rejected unauthenticated inspection (nonzero Docker exit and explicit
authentication/denial marker). Empty temporary Docker config and restricted
subprocess environment used; existing root credential unchanged. Temporary
authentication directory removal marker observed. No image download or service
change. This proves no-credential registry rejection, NOT actual PAT expiration,
revocation, or a complete deploy-wrapper failure-injection test. Those evidence
types must not be conflated; B7.4 closure scope remains to be reviewed.

Operator confirms VPS-only PAT expiration date December 26, 2026 (Saturday),
and accepts responsibility for rotation before expiry. Exact time/timezone not
provided. Scope read:packages and 90-day validity remain operator-attested;
no token read or disclosed. Recommend completing replacement and authenticated
private-digest pull validation at least seven days before expiry (December 19),
then revoke the old credential only after replacement verification. No reminder
automation created. Negative credential gate evidence remains outstanding.

Plan B7.1/.2/.3/.5 updated to completed within documented non-billable scope.
B7.4 remains open for exact PAT expiry/rotation ownership and negative credential
evidence; B7.6 remains open for final archival/controlled private restore-data
cleanup. No B6 live-test waiver inherited. Added an exact .gitignore exception
for the public b7-release-manifest.json (no broader JSON inclusion); schema and
git diff whitespace checks PASS. Documentation changes not yet committed/merged.

## Return-to-B7 verification — observed PASS

After actual B7→B6→B7 API and Worker/replay switching, final verify.sh PASS:
six manifest runtime identities PASS (292 ms), six container gates PASS,
public TLS/health and disabled audio capability checks complete, Worker current
registration PASS, durable_control_pending=0, bounded log_pattern_scan PASS.
API runs 434cef28… and Worker/replay 81968539… again. Database, Gateway and
Edge remained unchanged. This closes the supervised idle-window non-billable
rollback/return rehearsal, not live-media acceptance or zero-downtime release.
No database restore onto staging, paid test or new feature activation performed.
Overall B7 documentation closure and remaining checklist review still pending.

## Rollback rehearsal preflight

Return-to-B7 operator batch reached `B7 service switch commands: completed`;
Worker/replay recreated and started. This records command completion only;
explicit manifest/runtime, registration and final verification must be rerun
before claiming the rehearsal closed successfully.

Post-rollback B6 checks: registration marker FOUND in logs restricted to the
current container StartedAt; replay durable_control_pending=0. No raw logs
printed. Marker proves startup registration only, not continuing transport or
media health. Return to B7 and final B7 verify still pending.

Worker/replay rollback executed: both now running B6 image
sha256:bffc3e15ea347b70ac526ff7f0e0b36631693227513093784e2fdeaefca6d3ec,
RestartCount=0. API remains healthy B6 from previous checkpoint. Container
startup is not registration evidence: B6 lacks B7's live readiness probe;
post-rollback registration/log and backlog checks remain pending before return
to B7. No database restore or provider session performed.

API rollback executed: B6 image
sha256:0da1081fb93c305cf8d450a751d852a3d1209757150e00f8c7c4dff0d1132d4f
running/healthy, RestartCount=0; public health PASS. Compose reported healthy
after 11.3 seconds (not an end-to-end outage measurement). Worker/replay still
B7 at this checkpoint; full rollback and return to B7 remain outstanding.

Operator terminal: active-sessions query completed with no non-closed hosted
session rows; replay reports durable_control_pending=0. User separately confirms
LiveKit concurrent agent sessions=0. Point-in-time supervised idle gate only,
not an admission lock. Plan API rollback first with existing B6 history-enabled
configuration, then verify before any Worker rollback; no DB restore/migration,
Edge/Gateway changes or paid session. Actual rollback not yet executed here.

## Isolated restore smoke

API container sanitized DATABASE_URL username readback confirms mural. Together
with pg_roles this establishes current staging API uses the privileged mural
role; no password/URL was printed. The isolated restore created mural as its
bootstrap owner, matching this privileged access model; no restricted grants
are claimed. Least-privilege migration remains a separately planned production
hardening task, not silently applied during B7 and not declared security PASS.

Live pg_roles readback: mural exists with superuser/createrole/createdb/login all
true; mural_runtime absent. This confirms retained privileged-role risk and
matches the restore bootstrap role attributes, but the role catalog alone does
not establish which role the running API's connection URL selects. No live role
or grants changed. Do not report least-privilege acceptance.

Follow-up backup-internal parity PASS: streamed/decrypted the same encrypted dump,
counted each public COPY section without printing contents, and compared all 58
table names/counts to the isolated restore: zero mismatches. This is backup-to-
restore row-count parity, not a bytewise content comparison or proof that the
backup captured every live source row. Restore role is mural superuser (confirmed);
runtime least privilege is not established. Temporary cluster stopped after check.

Mac PostgreSQL 17.11 restored the SHA-256-verified September 27 07:03:11 UTC
encrypted backup through age→gzip→psql ON_ERROR_STOP with pipefail. Private key
stayed on Mac; no plaintext SQL file, TCP listener, application or provider call.
Fresh mode-0700 temporary cluster used a private Unix socket; restore PASS,
58 public tables, 368 public constraints, zero unvalidated constraints.
listen_addresses empty verified. Exit cleanup stopped the cluster; pg_ctl status
independently reports no server running. Private restored data/diagnostics remain
in /private/tmp/b7-restore.vPnGZT1G, not in Git or CI artifacts, pending completion
and controlled cleanup. This is NOT full RESTORE-01: per-table parity against
backup-time evidence and runtime role/grant verification remain outstanding.
The temporary mural superuser is restore-only, not evidence of least privilege.

## Complete manifest preparation

Subsequent operator execution of installed B7 verify.sh with api.env and explicit
b7-release-manifest.json PASS: all six runtime identities PASS (367 ms), all six
container gates PASS, public TLS/health and disabled Gateway audio capability
checks completed, live Worker registration PASS, durable_control_pending=0,
log_pattern_scan PASS and final verify PASS observed. Log scan is bounded to its
configured interval/patterns, not a proof of no possible errors or secret leakage.
No real media/provider session was initiated. Isolated database restore and
actual rollback rehearsal remain NOT_RUN; B7 is not complete.

Added b7-release-manifest.json covering six services. Historical Edge local image
maps to B6 814d198 through recorded deployment evidence (not an OCI source label).
GitHub readback confirms same-source main Checks 36232574822 SUCCESS for Edge
source 814d198 and 35505161429 SUCCESS for Gateway source 5dd848f; neither is
claimed to be an Edge CI image build. API/Worker use the B7 published digests.
Local manifest schema and git diff whitespace checks PASS. Public scripts and
manifest staged separately at /home/vlingo-admin/b7-verify.LFitS1Qv; private
configuration untouched. VPS total verification still awaits operator execution.

## Post-switch registration and backlog

Post-deployment idle resource snapshot (operator terminal): host RAM 3.5 GiB total,
1.4 GiB used, 2.1 GiB available, 138 MiB free, no swap. Root/Docker filesystem
is the same device, 36% used, 24 GiB available (not two independent disks).
Container CPU / memory / PIDs: API 0.24% / 34.4 MiB / 7; Worker 0.62% /
475.3 MiB / 22; replay 0.12% / 27.9 MiB / 7; Gateway 0.04% / 72.96 MiB / 6;
database 0.13% / 38.12 MiB / 8; Edge 0.01% / 16.06 MiB / 8.
No immediate idle memory/disk pressure observed. This single sample is not a
load test, leak assessment or production capacity result. Docker's displayed
3.542 GiB denominator does not establish per-service memory isolation.
Existing resource-evidence rules retained; no paid test or runtime change.

Retained B6 Compose parsing PASS for API (compose + b6-images + history-enabled)
and Worker (compose + b6-images), using their separate environment files.
Both explicit PASS markers observed after config --quiet with stdin isolated.
No configuration values printed, service changes or actual rollback performed.

Retained B6 api.env, worker.env and edge.env stat check PASS: each exists under
mural-b6-814d198/deploy/phase-5-5b and is root:root mode 0600. No contents read
or printed. This verifies retention/permissions only, not semantic validity or
a successful rollback. Existing verification rules unchanged.

Rollback tag inspection PASS: vlingo-b7-rollback:api-b6 resolves to
`sha256:0da1081fb93c305cf8d450a751d852a3d1209757150e00f8c7c4dff0d1132d4f`;
vlingo-b7-rollback:worker-b6 resolves to
`sha256:bffc3e15ea347b70ac526ff7f0e0b36631693227513093784e2fdeaefca6d3ec`.
Both linux/amd64, matching retained B6 identities. Read-only material retention
check only: no rollback, container restart or provider call was performed.

Database label-independent retry PASS: linux/amd64, runtime image ID and
`postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`
RepoDigest match. Previous template failure resolved without any runtime change.
Retained Edge ID also matches the B6 staged-rollout evidence in
2026-09-26-b6-history-delivery.md (release mural-b6-814d198); this is historical
build/deployment evidence, not an OCI revision label or CI-built image claim.

Retained image metadata: Edge and Gateway linux/amd64 confirmed; Gateway revision
5dd848f7af25b72c0ac535e30bae952acbd1f491 and ghcr.io/vlingo-ai/model-gateway
RepoDigest match the runtime ID. Edge revision label absent; retain its local
image identity and cross-check B6 build evidence rather than inventing a label.
The combined Go template failed on the database image because Config.Labels was
absent. This is an inspection command failure, not evidence of database failure;
database platform/digest remain unverified pending a label-independent retry.
Reusable rule: optional OCI labels must not prevent base image identity checks.

Full runtime image snapshot: six containers running, each RestartCount=0.
API and Worker/replay IDs match the B7 candidate IDs above. Retained images:
- Edge: `sha256:6c4608a721ae1283e50c3c6e5731d3ec9b7f346543ef6a61f15b8016ab955d14`
- Gateway: `sha256:9e9b7eec2fb394a30f80c1126cc81e116bb8ac762ad1c81cbf1829bea532860c`
- Database: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`

These are Docker runtime image IDs, not automatically registry manifest digests.
Platform and source/CI provenance for retained components still require matching;
the complete release manifest is not yet verified.

Subsequent VPS terminal HTTPS checks (curl with certificate validation enabled,
5-second connect / 15-second total timeout): API /healthz HTTP 200, Web / HTTP
200, unauthenticated conversation events GET HTTP 401. Response bodies discarded;
this verifies status-level health/access protection, not authenticated history
content or browser/media behavior. No provider invocation. Full manifest,
restore and rollback checks remain outstanding.

Subsequent terminal snapshot: all six project containers running; API, Gateway
and database report healthy. Worker/replay use image prefix 819685390c2c, API
434cef288e9e; retained Edge 6c4608a721ae and Gateway 9e9b7eec2fb3.
`ss` confirms the readiness listener at 127.0.0.1:8082 only, owned by Python.
This is a host-loopback binding check, not a complete external firewall audit;
short image IDs and docker ps do not replace full manifest identity verification.

Operator terminal readback after the B7 Worker/replay switch:
`python -m mural_livekit.readiness_check` returned `worker_registration: PASS`;
replay `python -m mural_livekit.outbox_status --require-empty` returned
`durable_control_pending=0`. This establishes current registration readiness and
an empty durable queue at this checkpoint, not live audio/provider acceptance.
Full release manifest verification, isolated backup restore and rollback evidence
remain outstanding. No paid session was initiated. Existing separation of
runtime, registration and media evidence remains sufficient; no new rule added.

## API switched

Subsequent Worker/replay switch observed: both running, restarts=0, image ID
`sha256:819685390c2cb72a2f546ced8e8165043c110625c96d479e6e17c30a61d86e1e`.
Old Worker image retained by switch command as vlingo-b7-rollback:worker-b6.
Current registration probe and post-switch backlog/full release checks pending;
running alone is not evidence of Cloud readiness or live media acceptance.

Operator terminal confirms API image ID
`sha256:434cef288e9e7ddaa9d5406174e2bc57b5926470c4e551db14482001ff66941a`,
running/healthy and history_flag=ON after explicit API-only --no-deps --no-build
--pull never deployment. Command preserved old API under vlingo-b7-rollback:api-b6
before switching. Worker/replay switch and full release verification remain pending.
No real conversation was started by the deployment commands.

## Deployment compatibility preparation

Compared B6 API `814d19850e560470d6c09983c27ee0cab79b88e9` to B7 Mural
`748304194eb642b8a2ed79f28e196afc91b55be8`: no changes in services/api/src,
services/api/migrations or deploy/phase-5-5b/compose.yaml. No new migration is
required for this release. Preserve existing history-enabled override and private
component environments. SSH read-only probe confirmed B6 release directory;
noninteractive sudo unavailable, operator execution required.
Compose uses host networking: readiness 127.0.0.1:8082 is host loopback, not a
separate container network boundary. Check port availability before switch; do
not publish externally. No deployment yet.

## Production release strategy decision

User approved future per-instance draining, rolling release and durable queue
handoff as a pre-production gate. Added C5 and reusable acceptance criteria in
the release verification plan. Planned, not implemented/tested; depends on
controller ownership/failover and consumer concurrency safety. Current B7 keeps
single-instance idle-window gates. User confirmed Cloud concurrent agent sessions
0 at this checkpoint; repeat near switch. Documentation-only change, no deployment,
provider test or expanded infrastructure authority. Diff whitespace check PASS.

## Pre-switch backup and backlog

Final repeated pre-switch check: database_open_sessions=0,
durable_control_pending=0; API running old image 0da1081..., Worker/replay running
old bffc3e15...; explicit completion marker PASS observed. User separately
confirmed LiveKit concurrent sessions=0. Previous batch produced no completion
output and was NOT accepted; retry isolated child stdin with /dev/null, consistent
with the existing heredoc safety rule. B7 copied configuration and final image
override validation passed, history flag preserved ON, readiness port 8082 free.
No service switch at this checkpoint.

Database non-closed session query returned no rows/no visible error. Encrypted
backup `postgres-20260927T070311Z.sql.gz.age` created in the B6 release backup
directory; source/transfer-copy SHA-256 both
`a1c67ca7e59a317bbdfef59416976c40a243c5b0a200f938d1e5046a758d021e`.
User confirmed Mac checksum/decrypt/gzip PASS; not an observed restore drill.
VPS replay outbox_status --require-empty returned durable_control_pending=0.
The checker counts pending_usage and pending_history when present. This is a
point-in-time backlog check, not Cloud session evidence. Current Cloud count
awaits confirmation; refresh idle/backlog gates before actual switch.

## API private publication

VPS image inspect subsequently confirmed linux/amd64 and revision
`748304194eb642b8a2ed79f28e196afc91b55be8` for the exact API digest. Downloaded
candidate identity PASS; running API is not changed by this inspection.

Subsequent VPS terminal evidence: API pull succeeded (Downloaded newer image)
with matching digest `sha256:434cef288e9e7ddaa9d5406174e2bc57b5926470c4e551db14482001ff66941a`.
This confirms access to the new private API package; platform/revision inspection
and deployment remain pending. No container replacement by this command.

Main `748304194eb642b8a2ed79f28e196afc91b55be8` Checks 36301391409 PASS,
alongside same-SHA Contracts/Secret scan. Manual publish 36301573623 PASS;
exact-source gate emitted PASS. Published
`ghcr.io/vlingo-ai/mural-api@sha256:434cef288e9e7ddaa9d5406174e2bc57b5926470c4e551db14482001ff66941a`.
Package API readback confirms visibility private. Release artifact 10925219407
exists and is not expired. VPS API pull/identity/deployment NOT_RUN at this point.
No live provider calls; runtime remains B6. Publication is not deployment.

## Mural merge checkpoint

PR52 merged from reviewed/green head `1e157f3530718e7896ba416966a81018f299f86b`
as main `748304194eb642b8a2ed79f28e196afc91b55be8`. No UI/UX change in this release.
Subsequent local operator evidence remains preserved for later documentation
closure, not included in that merge. Exact main-push CI must pass before manual
API publishing; merge is not publication or deployment. VPS remains B6.

## Worker main publication

Subsequent VPS image inspect confirmed `PLATFORM=linux/amd64` and
`REVISION=d4f4514010f2af50c96cfe40cb0e70f68b99be92` for the exact published digest.
Downloaded image identity check PASS; no container switch or live registration
test performed by this inspection.

VPS operator pull subsequently PASS: Downloaded newer image, registry digest
`sha256:819685390c2cb72a2f546ced8e8165043c110625c96d479e6e17c30a61d86e1e`
matches published candidate. Image download only, not deployment; platform/revision
labels and runtime switch remain separate checks. Mural `1e157f3` Checks
36300928475 now all selected jobs PASS, plus Contracts/Secret scan/Android gate;
Swift/Android/emulator remain skipped. Current uncommitted evidence is not that CI revision.

PR20 merged as `d4f4514010f2af50c96cfe40cb0e70f68b99be92`; main Checks
36300943142 PASS. Manual publish 36301012664 PASS and emitted
`ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:819685390c2cb72a2f546ced8e8165043c110625c96d479e6e17c30a61d86e1e`.
Registry package visibility rechecked private. This is published, not VPS-deployed.
Mural latest documentation head `1e157f3` still awaiting server CI at this point;
Web/build/contracts/secrets passed, native heavy checks skipped. B7 remains open.

## Deployment credential decision — user approved

Operator confirmed read:packages scope and 90-day validity (not independently
audited; exact expiry date not collected). Do not retain the earlier suggested
30-day period. Latest Mural code `670fa45`: Checks run 36299732086 all selected
jobs PASS; Contracts/Secret scan/Android summary PASS, native heavy jobs skipped.
Worker `1364c51` all applicable CI PASS. No UI changes. Publication/deployment
remain separate gates; documentation-head and main-push CI require fresh checks.

Operator follow-up observed in VPS terminal: Docker login succeeded; credential
directory root:root 700 and config file root:root 600. Pull of existing B6 Worker
`ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:bffc3e15ea347b70ac526ff7f0e0b36631693227513093784e2fdeaefca6d3ec`
succeeded with matching digest / Image is up to date. No container was replaced.
This proves access to that private image only, not read-only scope or expiry;
token scope/expiry, new API package access and B7 image pulls remain unverified.
Docker reports unencrypted config storage; restricted file permissions do not
provide encryption. No credential contents were inspected or recorded.

User accepted HKPATA shared account with a separate VPS-only PAT classic,
read:packages only, finite expiry and independent revocation/rotation. Do not
reuse the Mac gh credential. This is credential isolation, NOT account-level or
single-package isolation; other packages readable by this account may be exposed.
Independent account remains a production review item. Token creation, VPS
configuration, pull and invalid credential checks NOT_RUN. Documentation-only
update; no credential collected/stored, deployment or paid call. B7.4 stays open.

## Ninth iteration: CI evidence and fail-closed log collection

[Worker CI 36299585325](https://github.com/vlingo-ai/model-gateway/actions/runs/36299585325)
on `1364c51` passed all three jobs: Gateway 272 tests, Worker 69 tests, both image
checks including network-none readiness harness PASS. This remains synthetic SDK,
not actual Cloud registration. Mural #52 actually skips Swift/Android/emulator;
Android summary passes. Initial Mural CI result does not cover the next change.

Review found old shell log pipeline hid Docker log collection failures. Replaced
with timeout/nonzero fail-closed collector, scanning both captured streams and
printing fixed status only. Three new regression tests; local script suite 98/98,
shell syntax and whitespace PASS. Pattern scan is not exhaustive secret audit.
Updated candidate CI pending. No deployment, image publication or paid call.

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
