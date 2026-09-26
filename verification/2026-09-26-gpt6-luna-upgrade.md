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

Local candidate only; PR/CI, review, coordinated API/Gateway configuration deployment and
non-billable staging checks remain required. See the candidate section in
[runbook](../deploy/phase-5-5b/README.md) and
[release verification plan](../docs/operations/release-verification-plan.md).

Drain live and standalone helper requests and post-session windows before switching or rolling back.
Preserve unresolved holds; do not rewrite old versions to make requests pass. Back up and retain both
API image and Gateway configuration. Real quality/provider calls require separately bounded approval.
Model migrations must inspect SQL reservation constraints, provider identity, pricing metadata,
cash settlement and budget thresholds together; changing the model string alone is insufficient.
