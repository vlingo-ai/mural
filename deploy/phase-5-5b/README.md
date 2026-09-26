# Phase 5.5B Cloud Build staging runbook

Scope updated 2026-09-24: follow the [accepted development baseline](../../docs/web-ios-model-gateway-plan.md).
Staging is deployed; real Cloud quota rejection is waived for this English staging gate only,
not actually tested. The final Gate 7 report/signoff remains pending. The numbered steps below are a reusable procedure,
not outstanding tasks to repeat indiscriminately. See [dated evidence](../../verification/phase-5-5b/README.md).

For future releases, use the [reusable release verification design](../../docs/operations/release-verification-plan.md)
and [report template](../../verification/release-verification-template.md) alongside this runbook.
The design distinguishes existing scripts from planned automation; it does not enable automatic deployments,
paid tests, or carry this staging gate's exceptions into another release.

B1 staging deployment (2026-09-25, [Mural API PR #38](https://github.com/vlingo-ai/mural/pull/38)
and [Worker PR #16](https://github.com/vlingo-ai/model-gateway/pull/16), merged with green CI):
migration 028 was applied, API was deployed before Worker, and non-billable verification passed.
See the [dated cleanup/lease evidence and limits](../../verification/2026-09-24-b1-resource-cleanup.md).
Future deployments must still apply migration 028 before enabling the new Worker, verify API access to
`hosted_resource_cleanup`, and deploy/verify the matching API lease response.
A restricted runtime role needs SELECT/INSERT/UPDATE; the 2026-09-24 staging precheck instead
found API using superuser `mural` (no extra grant needed, separate least-privilege hardening pending).
Preserve encrypted backups and old images/configuration. Roll back Worker before API and retain
the additive cleanup table. Do not automatically sweep historical rooms without verified targets.

This bundle prepares the **vLingo Speaking Live** Phase 5.5B hybrid topology on one dedicated
Ubuntu 24.04 LTS staging VPS. LiveKit Cloud owns rooms and media. The VPS runs PostgreSQL, Mural
API, the Responses-only Model Gateway, the GPT-Live Agent Worker, and Caddy. It is a Build
validation environment, not Phase 5.5C product release infrastructure.

No deployment has occurred merely because this bundle exists or `docker compose config` passes.
Mark a gate complete only after recording its evidence in `verification/phase-5-5b/`.

## GPT-6 Luna hosted-helper upgrade (deployed; non-billable checks complete)

On 2026-09-26 API revision `7979f865250a0bb95edf846e80eb77f114ae56c4` and the four
Gateway route changes were deployed. Container health/image/routes and public health/pricing
checks passed, as did a local DB connection check and bounded startup error-marker scan;
this does not establish real provider access or quality. See
[deployment evidence](../../verification/2026-09-26-gpt6-luna-upgrade.md) for outstanding checks.
The active API/Gateway directory is `/home/vlingo-admin/releases/mural-gpt6-luna-7979f86/deploy/phase-5-5b`.
API uses `.env` + `compose.yaml` + `luna-images.yaml`; Gateway uses `gateway.env` +
`gateway-compose.yaml` + `luna-images.yaml`. Always specify the matching files and target
only the intended service with `--no-deps --no-build`; copied env files alone retain old values.
Edge remains in the B4 directory; Worker/replay and database are unchanged.
Subsequent separately authorized single translation-route smoke passed with actual
OpenAI / `gpt-6-luna`, completed response and matching synthetic reply. It bypassed the
Mural user ledger; other routes, broad quality and end-to-end settlement remain unverified.
The one-request authorization is consumed; do not rerun the one-shot test.

Upgrade only hosted Responses helpers; GPT-Live-1, Worker, native BYOK, public entitlements and
historical ledger snapshots stay unchanged. The four Gateway settings `OPENAI_MODEL_TRANSLATION_FAST`,
`OPENAI_MODEL_ASSESSMENT_DEFAULT`, `OPENAI_MODEL_REASONING_DEFAULT`, and `OPENAI_MODEL_SEARCH_DEFAULT`
must all resolve to `gpt-6-luna` together with the matching API candidate. Never switch just the route:
the old API relabels provider responses, while the new API rejects a mismatched provider/model.
Use a supervised quiet window, encrypted backup and retained API/Gateway configuration/images.
Drain voice sessions AND pending helper/account-model tasks; allow the existing post-session helper
window to expire before changing either component. Keep unresolved holds for operator reconciliation,
never clear them to pass deployment. No SQL migration or historical rate rewrite is required.
Rollback must restore both API and route configuration after the same drain checks; new-version
budgets cannot be reused with old code. Non-billable health/metadata checks do not establish model
access or quality; actual provider calls need separate bounded authorization.

## B6 candidate rollout (not deployed)

B6 changes visible history: selected detail catches up automatically, reports pending
sync without failing the live call, and clears immediately on sign-out. API migration
030 provides ordered cursors; 031 records per-session client/Worker history authority.
Use the [B6 evidence](../../verification/2026-09-26-b6-history-delivery.md) and
[protocol](../../shared/contracts/history-delivery-protocol.md); do not enable this candidate
from local tests alone. Native local history is unchanged.

After CI/candidate review, drain sessions, verify combined control/history backlog,
retain images/private configuration and take/verify the existing encrypted backup.
Apply 030/031 and reviewed runtime grants; deploy compatible API with
`LIVEKIT_WORKER_HISTORY_ENABLED=false`, then matching Worker **and replay**, then Web.
Only after non-billable compatibility checks enable the flag for new sessions.
The default remains false; existing sessions keep their stored authority. A true flag
requires Worker metadata 1.1 support. Do not enable it against an old Worker.

For rollback disable new Worker-authoritative admissions first, drain calls and both
queues, then restore compatible images. A flag change does not rewrite old sessions.
Retain additive migrations, outbox volume and its key. Never delete pending encrypted
history to make a zero-backlog gate pass; credential/deletion/conflict failures need
operator reconciliation. Any real conversation acceptance needs separate bounded
provider authorization. Health checks alone do not establish history delivery.

## B4 compatibility gate and staging deployment

API and Edge revision `8fdfa620e299f2852fc248210e28b4847052b12f` were deployed in that order.
Public checks, revision/restart verification and authenticated unknown-request lookup smoke passed.
Owner isolation and closed-request lookup are covered by isolated tests, not this staging smoke.
At B4 sign-off, the API/Edge directory was `/home/vlingo-admin/releases/mural-b4-8fdfa62/deploy/phase-5-5b`.
Edge remains there; API has since moved to the Luna directory above. Mutations for the retained B4 components must include both `-f compose.yaml -f b4-images.yaml`
with this directory's explicit project directory and `.env`: the copied private environment still contains
the prior API image. Do not run a full-stack `up` from an older release directory.
Worker/replay, Gateway and database were not replaced in this deployment. Previous images and private
configuration are retained; exact image IDs and rollback references are in the evidence below.

The B4 Web candidate requires authenticated `GET /v1/live/requests/:id` to reconcile an
ambiguous admission using its original UUID idempotency key. Deploy the matching API first,
then Web/Edge; no new migration or Worker change is required. Do not publish the new Web
against an API lacking this route. A null lookup is an unknown snapshot, never proof of cancellation.
Verify unauthenticated rejection, owner-only lookup, unknown UUID -> null, and closed-session lookup
using isolated fixtures before release. Staging checks must not create paid sessions.
Record both API and Edge source/image revisions, retain their previous images/configuration,
check active sessions and take the existing encrypted backup before deployment.
If rolling back API, roll back the dependent Web first. Deployment does not establish
real-media acceptance; see [B4 evidence](../../verification/2026-09-26-b4-recovery-protocol.md).

User-visible changes: signal-only interruption avoids forced Room replacement; Stop stops local
audio immediately but remains closing until the server confirms closed. Retry closing also queries
an unknown admission by its original request ID. A null/error lookup keeps closure unconfirmed;
it does not create another session. Native app adaptation remains deferred to its platform phase.

## B2 durable-control deployment

2026-09-25: API `a81c3ba` and the paired Worker/replay were deployed from
`/home/vlingo-admin/releases/mural-b2-a81c3ba/deploy/phase-5-5b`; migration 029 and
non-billable verification passed. One startup registration record, zero restarts and an
empty durable queue were subsequently verified; documentation sign-off remains pending in the
[dated evidence](../../verification/2026-09-25-b2-control-receipts.md).
The previous deployment directory remains retained; do not run a full-stack `up` from it,
which could revert B2 services. Database/Gateway/Edge were not recreated.

For subsequent deployments, apply migration 029 before a new Worker image is started. Configure a distinct
`WORKER_OUTBOX_KEY` (base64 encoding of 32 random bytes) and an absolute, pre-created
`WORKER_OUTBOX_HOST_DIR` owned by UID 10001 with mode 0700. The Worker and
`agent-worker-replay` share the directory; the replay service has no OpenAI or LiveKit keys.
Retain the key and encrypted outbox across image rollbacks until every report is reconciled.

Before deployment, check active sessions, preserve previous images/configuration, and take the
encrypted backup. Apply migration 029, deploy the API before the Worker, then start the replay
service. Run `preflight.sh` and `verify.sh`; the latter requires the replay container to run and
its durable queue to be empty, printing only a count. **Do not use the retained B1 `.env`
with the B2 Compose file: it lacks the required outbox settings.** See the
[dated B2 evidence](../../verification/2026-09-25-b2-control-receipts.md). No real provider test or
deployment follows merely from local checks passing.

## Frozen boundaries

- Mural API owns product capability, authentication, session admission, quotas, trusted control,
  forced close, and settlement.
- Agent Worker owns `gpt-live-1` and is the only process that receives `WORKER_OPENAI_API_KEY`.
- Model Gateway owns Responses only in the first 5.5B deployment. Both audio backends are fixed to
  `disabled`; its image must not install or import MLX audio packages.
- Public room metadata must contain no transcript or secrets. Private Agent dispatch metadata currently
  carries bounded history and a per-session HMAC control token through LiveKit to Worker; it is sensitive
  and must not be logged/exported. The root control secret and OpenAI keys are not sent in that metadata.
- Web receives only the public Mural API origin and a public OAuth client ID.
- Existing `mural` database/protocol identifiers remain for compatibility. New external resources
  use `vlingo-speaking-live`.

The Compose bundle uses Linux host networking so PostgreSQL, Mural API, and Model Gateway can bind
to exact loopback addresses while Caddy alone accepts public traffic. The VPS firewall is still a
required independent control. Do not use this bundle on the shared macOS Model Gateway host and do
not bind or restart that host's port 8000 service.

## Gate 0 — source and image prerequisites

1. Confirm Mural is the reviewed Phase 5.5B revision:

   ```sh
   git status --short --branch
   git rev-parse HEAD
   git merge-base --is-ancestor upstream/main HEAD
   ```

   Expected: a clean, reviewed release commit (not a prescribed historical branch) and exit status 0 for the
   ancestry check.

2. Confirm Model Gateway has merged the trusted Responses contract (`ResponseSource`, `sources`,
   `usage.web_search_calls`, and `usage.cache_write_input_tokens`) and the portable backend work.
   The prepared implementation is tracked in
   [Model Gateway PR #13](https://github.com/vlingo-ai/model-gateway/pull/13); it is not a deployment
   input until that PR is reviewed, green, merged, and published from the merge commit.
   Its release checks must prove the Responses-only Linux image:

   - excludes `mlx-audio`, MLX and model weights;
   - starts with `GATEWAY_ASR_BACKEND=disabled` and
     `GATEWAY_ALIGNMENT_BACKEND=disabled`;
   - reports both operations unavailable and returns stable `503/backend_disabled` responses;
   - keeps `/healthz`, `/v1/capabilities`, and `/v1/responses` working;
   - passes the Mural contract lock and Gateway's full non-Metal test suite.

3. Build and publish the Model Gateway and Agent Worker from reviewed, clean commits. Resolve each
   registry tag to its immutable `@sha256:` digest. Do not deploy floating tags.

4. Record the two source SHAs, image digests, dependency scan results, and rollback digests. Stop
   here if the Gateway contract/backend work is not merged; the old Phase 5.5A image is not a valid
   Linux Responses-only artifact.

## Gate 1 — user creates LiveKit Cloud Build resources

These are short console operations that require the user's LiveKit account:

1. Create a non-production project named exactly `vlingo-speaking-live-staging` on the Build plan.
   Verify the project switcher shows that exact name.
2. Copy its `wss://...livekit.cloud` URL. Verify it starts with `wss://` and belongs to this project.
3. Create a dedicated staging API key/secret. Store it in the secret manager or the VPS private
   `.env`; do not paste it into an issue, terminal transcript, or Git file.
4. Confirm no `mural-staging` credential is reused. If an unused legacy project cannot be renamed,
   disable its keys after the new project is verified.
5. In the dashboard, note the Build participant-minute and bandwidth allowance. Configure available
   spend/usage notifications and record screenshots without credentials.
6. Leave Region Pinning disabled. Record the automatically selected region during the actual test.

Evidence: project name, redacted URL hostname, key creation time/last four characters, plan limits,
alert configuration, and confirmation that Region Pinning is off.

## Gate 2 — user provisions the VPS and DNS

1. Create a dedicated Ubuntu 24.04 LTS VPS in Singapore or Japan with at least 2 vCPU, 4 GiB RAM,
   40 GiB encrypted storage, provider snapshots, and automatic security updates. Record provider,
   region, instance ID, public IPv4, and base-image version.
2. Add an SSH key; disable password/root SSH after verifying the operator account in a second shell.
3. Configure the provider firewall and Ubuntu firewall to allow inbound TCP 22 only from operator
   IPs, TCP 80/443 from the Internet, and UDP 443 for HTTP/3. Deny inbound 5432, 8000, and 8080.
   When the staging operator has a frequently changing VPN egress address, Phase 5.5B may retain
   TCP 22 from `0.0.0.0/0` as a documented temporary exception only if root login, password login,
   and keyboard-interactive login are disabled; public-key login is the sole SSH authentication
   method; UFW rate-limits port 22; unattended security updates and SSH logging remain enabled; and
   no other administrative or internal service port is public. Record this exception in the
   verification report. Replace it with Alibaba Cloud Session Manager, Workbench, a private overlay
   network, or restricted operator CIDRs before long-term or production use.
4. Create DNS `A` records for:

   - `speaking-live-staging.vlingo.ai`
   - `api-speaking-live-staging.vlingo.ai`

   Point both to the VPS IPv4 with a short staging TTL. Do not create a public Gateway record.
5. Verify from a different network:

   ```sh
   dig +short speaking-live-staging.vlingo.ai A
   dig +short api-speaking-live-staging.vlingo.ai A
   ```

   Both outputs must equal the recorded VPS IPv4.

## Gate 3 — install the host runtime

Follow Docker's current official Ubuntu repository instructions rather than a convenience installer.
Install Docker Engine, Buildx, and Compose v2, then verify:

```sh
docker version
docker compose version
sudo ss -lntup
sudo ufw status verbose
```

Pin unattended security updates, enable Docker at boot, and restrict membership in the `docker`
group because it is root-equivalent. Clone Mural into a release directory owned by the deploy user;
check out the reviewed commit, never a moving branch.

## Gate 4 — prepare secrets without exposing them

From this directory on the VPS:

```sh
cp .env.example .env
chmod 600 .env
```

Fill `.env` through the secret manager or an editor that does not persist cloud history. Generate
independent random values for database, Gateway, account, LiveKit control, Worker provider, and
Gateway provider credentials. `WORKER_OPENAI_API_KEY` and `GATEWAY_OPENAI_API_KEY` must be different
keys so either workload can be revoked independently. Use only staging OAuth clients. For the first
identity-only boot, keep `HOSTED_VOICE_EXPERIMENTAL=false`, `HOSTED_HELPERS_EXPERIMENTAL=false`, an
empty `HOSTED_VOICE_ACCOUNT_ALLOWLIST`, and zero hosted budgets. Do not invent an account UUID.

Run:

```sh
./preflight.sh
```

It checks permissions, placeholders, key shape, immutable images, DNS, and Compose parsing without
printing secret values. A PASS is preparation evidence, not deployment evidence.

## Gate 5 — first deployment

1. Confirm no existing deployment owns the fixed loopback ports:

   ```sh
   sudo ss -lntup | grep -E ':(5432|8000|8080)\b' || true
   ```

2. Pull immutable dependency images and build Mural artifacts from the checked-out revision:

   ```sh
   docker compose --env-file .env pull database model-gateway agent-worker
   docker compose --env-file .env build --pull api migrate edge
   ```

3. Start PostgreSQL only. If this is not the first deployment, inspect active sessions and take an
   encrypted backup before changing any container:

   ```sh
   docker compose --env-file .env up -d database
   ./active-sessions.sh
   ./backup.sh
   ```

   Any output from `active-sessions.sh` means the rollout waits; do not interrupt a call. Verify the
   encrypted backup is non-empty and decryptable on the separate recovery host. Keep the previous
   Compose file, Mural image, Gateway image, Worker image, `.env`, and database backup as rollback.

4. Start the internal services, run only repository migrations, then start the API and public edge
   in identity-only mode. Do not start the Agent Worker yet:

   ```sh
   docker compose --env-file .env up -d model-gateway
   docker compose --env-file .env up --no-deps migrate
   docker compose --env-file .env up -d api
   docker compose --env-file .env up -d edge
   ```

   The `migrate` service must exit successfully before starting the API. Using the declared service
   (rather than a removed one-off container) satisfies the API's `service_completed_successfully`
   dependency without running migrations a second time.

5. Run `./verify.sh`. Record `git rev-parse HEAD`, `docker compose images`, the sanitized verify
   output, migration result, public certificate subjects/expiry, and a 15-minute sanitized log tail.

6. Sign in once through the staging Web origin with one approved Google test user. Query only the
   new non-guest account ID (not its email or token) from PostgreSQL. Put that existing UUID in
   `HOSTED_VOICE_ACCOUNT_ALLOWLIST`, set both experimental gates to `true`, and apply the separately
   reviewed lifetime and per-minute budgets. Rerun `./preflight.sh`, start `agent-worker`, and
   recreate `api`. Confirm the worker registers before Gate 6. This gate change enables restricted
   capability only; it does not authorize a billable provider session.

Rollback before any real Build session: stop `edge`, `agent-worker`, and `api`; restore the previous
image digests and Compose file; restore the encrypted PostgreSQL backup only if a migration is not
backward compatible; then rerun the old verification. Never roll back a database underneath active
or unresolved sessions.

## Gate 6 — non-billable infrastructure acceptance

Before a provider call, prove all of the following:

- Public Web and API use valid TLS; plain HTTP redirects to HTTPS.
- Ports 5432, 8000, and 8080 are unreachable from an external host.
- SSH uses public-key authentication only, rejects new root sessions, and is source-restricted; if
  the documented dynamic-VPN staging exception is active, prove UFW rate limiting and record public
  TCP 22 as an unresolved hardening item.
- Mural `/healthz` is healthy and the database is ready.
- Model Gateway health and Responses capability are ready; ASR and Alignment report disabled.
- Mural product capability advertises `livekit-room` only to the restricted staging account after
  authentication; `yue-Hant-HK` remains rejected. The Web selector offers English only, with
  Mandarin/Cantonese coming later; API/native `zh-CN` compatibility is not removed by this Web gate.
- Agent Worker is registered under `vlingo-speaking-live-gpt-live` in the correct LiveKit project.
- Container inspection shows API has no OpenAI key, Worker has no Gateway/database/account secrets,
  and Gateway has no LiveKit credential or Worker key. Do not save raw inspection output.
- Logs and LiveKit room metadata contain no transcript, authorization header, OpenAI key, LiveKit
  secret, database URL, or long-lived user credential.

Do not extend the last claim to private dispatch metadata; see its separate sensitive-data boundary above.
Current `verify.sh` output alone does not establish container health/Worker registration assertions;
record explicit checks until baseline B7 makes those checks fail closed.

### Accepted LiveKit credential hardening follow-up

The Phase 5.5B deployment intentionally supplies the same LiveKit project API key and secret to
both `api` and `agent-worker`. The API needs them to create and delete rooms, dispatch the named
agent, and mint short-lived participant tokens. The Worker needs them to authenticate and register
with the same LiveKit project. `LIVEKIT_CONTROL_SECRET` remains API-only, and the API has no OpenAI
key.

This shared project credential is accepted for the bounded staging gate, but it couples rotation
and revocation across the two services. Before long-term or broader operation, create distinct
LiveKit key pairs in the same project and replace the shared variables with explicit API and Worker
variables. Update Compose and preflight checks so the pairs must differ, recreate only the affected
containers after confirming no active sessions, verify room creation/dispatch/Worker registration,
then revoke the old shared pair. Separate pairs improve audit and independent revocation; do not
claim that they provide fine-grained LiveKit authorization unless the provider configuration also
enforces such scopes.

## Gate 7 — bounded Cloud Build acceptance

This gate incurs LiveKit participant minutes and OpenAI usage. Run it only after the user confirms
the Build allowance and provider budgets.

For the current English-only (`en`) staging acceptance scope, use the restricted test account and record:

1. create → both participants connected → remote audio → captions → typed input;
2. natural interruption and a client delegation through Mural → Gateway Responses;
3. explicit stop with final cumulative usage and `reserved_ms=0`;
4. short network interruption and reconnection;
5. Worker hard-stop, 30-second lease expiry, forced room close, safe settlement, and reconciliation
   marker;
6. Cloud quota/limit rejection that fails closed with a safe user error and no leaked reservation.

Item 6 has an explicit [September 24 staging-only waiver](../../verification/phase-5-5b/2026-09-24-gate-7-continuation.md#cloud-waiver-decision)
after community reply review. Retain local rejection/settlement evidence and report WAIVED, not PASS.
The community monitor was deleted; no burst test, capacity purchase or quota change is authorized.
This does not waive other items or carry forward into future releases.

Capture median and worst observed first-audio latency, interruption latency, reconnect time,
participant minutes, ingress/egress bytes, error count/rate, VPS CPU/RSS, and Mural billed duration.
Correlate LiveKit and Mural with the opaque Mural session ID only. Never export room metadata or
transcripts as test evidence.

The revised English-only Phase 5.5B scope passes only when English passes, the numbers above are recorded, no client has a
provider secret, and every failure case settles or is explicitly marked for operator reconciliation.
Until then, report **prepared** or **deployed but not accepted**, never **Phase 5.5B complete**.

Operator scope change on 2026-09-23: pause Mandarin development and testing for this acceptance;
the Web selector marks Mandarin and Cantonese as "coming later" and offers English alone. This
supersedes the earlier staging-only Mandarin ASR retest waiver and the original two-language
Gate 7 requirement for this English-only staging release, but does **not** establish Mandarin
quality or Phase 5.5B bilingual acceptance. Existing Mandarin history remains readable. The
server retains `zh-CN` compatibility for existing/native clients; the selector change is not an
API-wide language ban. Reopen Mandarin with a defined quality rubric and its own acceptance
before making it selectable again. This scope change does not waive Cloud rejection or
measurement requirements above.

## Required evidence record

Create a dated file under `verification/phase-5-5b/` containing:

- Mural/Gateway/Worker source commits and immutable image digests;
- VPS image/region and LiveKit project/plan/automatic region;
- DNS and TLS verification times;
- encrypted backup path/hash, previous image digests, and rollback rehearsal outcome;
- local CI, image scans, non-billable live checks, and bounded acceptance results as separate rows;
- Cloud metrics and measured latencies/traffic, with no content or credentials;
- known limits and the exact remaining gate if acceptance is incomplete.
