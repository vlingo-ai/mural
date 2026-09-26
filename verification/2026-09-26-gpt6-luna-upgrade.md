# GPT-6 Luna hosted helper upgrade — local candidate

Date: 2026-09-26. Base: `c956a05` (B4 documentation sign-off).
Scope: hosted Responses helpers and account model tasks, not GPT-Live-1, Worker,
native BYOK defaults, user entitlements or historical ledger recalculation.

## Sources and implementation

- [Model](https://developers.openai.com/api/docs/models/gpt-6-luna) and
  [migration guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra):
  retain Responses and low reasoning, bounded output and current tool/prompt contracts.
- Standard short-context nanoUSD/token: input 100, cached 10, cache write 125, output 500;
  above 272,000 input tokens input/cache double and output is 750. Search fee unchanged.
- Distinct helper rate version retains the accounting-policy suffix required by migration 024.
  No migration is edited; legacy `pricing.ts` and stored snapshots remain unchanged.
  `/v1/pricing.text` exposes the new helper-specific rate version and cache/long-context metadata.
- Gateway response provider/model must match OpenAI/GPT-6 Luna; no silent relabeling of old
  or different provider usage. Mismatch retains the existing uncertain-outcome safety behavior.
- Gateway configuration already supports four logical-to-provider mappings. No Gateway/Worker
  source change is needed; deployment must update all four mappings with the matching API.
  The Gateway main checkout has unrelated uncommitted documentation, which was left untouched.

## Verification and failures

- Locked `npm ci --ignore-scripts`, initial TypeScript check PASS.
- Initial focused suite: 11 PASS, 30 database cases SKIPPED, not treated as full validation.
- First isolated PostgreSQL full run: 418 PASS, 9 FAIL, 1 SKIP. Four failures exposed migration
  024's reservation rate-suffix requirement; other failures were stale cost/overrun/earned-budget
  fixture expectations at the lower rate. Preserved the constraint and changed the version prefix;
  adjusted synthetic quantities/framing to continue crossing the same budget boundaries.
- Focused DB regression after fixes: 58/58 PASS, zero skipped.
- Added old-rate budget rejection test: zero provider calls, unchanged old row, no new attempt.
  Added pricing metadata assertions, provider/model mismatch cases; voice rate remains unchanged.
- Final full API run: **428 PASS / 0 FAIL / 1 SKIP**, 429 total; TypeScript and production build PASS.
  B2 optional cross-repository Worker test not configured this run, explicitly SKIPPED.
- Temporary database listens only on loopback and contains synthetic fixtures. No staging write,
  real model call or paid test. Account access, model quality and actual returned model identifier
  remain unverified against the provider. No claim of live acceptance.

## Release and reusable rules

Deployment preparation on 2026-09-26: operator-executed read-only DB query returned zero
for unclosed voice sessions, active helper requests, active account tasks, unexpired open
helper windows, uncertain helper requests and uncertain account tasks. This is a point-in-time
DB observation, not a Cloud resource check or an admission lock; recheck before switching.
Encrypted backup `postgres-20260926T053600Z.sql.gz.age` was generated from the B4 deployment.
VPS transfer copy and operator-reported Mac copy have matching SHA-256
`0fb677aff6de7d0e33f59658f5a2e9a84d73b5982c9a265fb2f97415c640e609`.
Mac age decryption plus gzip integrity check PASS; database restore drill NOT_RUN.
No deployment or provider call occurred during these checks.

Operator terminal confirmed API and Gateway running with restart count 0. API uses B4's
Compose directory plus `b4-images.yaml`; Gateway still uses the original staging directory.
Rollback copies were retained under `/root/mural-before-gpt6-luna-gLS2Od` (0700 directory,
0600 files): API environment, Compose and image override, plus Gateway environment and Compose.
Local image retention tags `vlingo-api-rollback:mural-before-gpt6-luna-gLS2Od` and
`vlingo-gateway-rollback:mural-before-gpt6-luna-gLS2Od` were created successfully for image IDs
`sha256:dd19b57a7b46dfeac8bc050ca30810d132ff743a1c0de9cab3ae0fedecf8c175` and
`sha256:9e9b7eec2fb394a30f80c1126cc81e116bb8ac762ad1c81cbf1829bea532860c` respectively.
These are retained rollback inputs, not evidence of a completed rollback rehearsal.
The evidence commit triggered generic-api-key on the non-secret API rollback image tag.
Reproduced with redacted local full-history scanning; a file-and-exact-match exception
was added rather than disabling the scanner. Updated CI must pass before merge.

PR #46 candidate `91a80ae`: applicable CI checks PASS, including server, Web, deployment,
contracts, secret scan and aggregate gates. [Checks run](https://github.com/vlingo-ai/mural/actions/runs/36220826549).
Android/emulator and Swift core were scope-skipped, not validated by this run.
No new reusable rule was needed after CI review; existing model-migration rules remain applicable.

Not merged or deployed; review, coordinated API/Gateway configuration deployment and
non-billable staging checks remain required. See the candidate section in
[runbook](../deploy/phase-5-5b/README.md) and
[release verification plan](../docs/operations/release-verification-plan.md).

Drain live and standalone helper requests and post-session windows before switching or rolling back.
Preserve unresolved holds; do not rewrite old versions to make requests pass. Back up and retain both
API image and Gateway configuration. Real quality/provider calls require separately bounded approval.
Model migrations must inspect SQL reservation constraints, provider identity, pricing metadata,
cash settlement and budget thresholds together; changing the model string alone is insufficient.
