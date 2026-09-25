# 2026-09-25 CI stage selection

Scope: user-authorized CI efficiency change in the documentation alignment candidate (PR #40).
No application/UI/API behavior changes; no VPS deployment, secrets changes or paid tests required.

## Evidence and decision

- Android run [36112291471](https://github.com/vlingo-ai/mural/actions/runs/36112291471)
  failed and its failed shard rerun also failed. Rerun expected 25 tests, received 3, and
  adb port 5554 refused connection. Android build, release files and three other shards passed.
  Exact emulator termination cause remains unresolved. Retain FAIL; do not call it fixed.
- Docs touched `apps/android/README.md` and `release/android/*.md`, matching the old broad
  workflow filters. No Android runtime code changed in this candidate.
- User now explicitly selects Web in Phase 5.5, iOS in Phase 6, Android at its later stage.
  `.github/ci-stage.json` records the current Web selection; configuration changes receive review.

## Implemented selection

Shared reusable scope job checks its classifier before emitting outputs. Git PR base/head and
push before/head determine paths; invalid configuration or Git failure fails selection.
Manual runs and initial pushes select the complete chosen platform. Renames include old/new paths.
Policy changes force the active platform and common server/deployment checks.

Inactive native jobs skip even when native paths change. Common security/static contract checks
remain enabled. API/shared changes run the active client compatibility tests. Pure Markdown skips
client builds; Android release docs only run the release validator when Android is active.
Both workflows always start so scope errors surface and stable aggregate gates can fail closed.
Full manual all-platform verification requires both Checks and Android workflow dispatches.

## Validation and state

- Classifier unit tests: 12/12 PASS (stage matrix, docs, API/shared, manual overrides, invalid input).
- Python scripts suite: 66/66 PASS; content export and cross-platform static contract checks PASS.
- All six workflow YAML files parse successfully; `git diff --check` PASS.
- Read-only GitHub inspection: main branch protection absent (404); repository rulesets list empty.
  No branch protection settings changed. Aggregate gates are implemented for review and future protection.
- Candidate Actions: pending below; YAML parsing alone does not establish Actions execution success.
- Implementation is a candidate until pushed/CI reviewed; application deployment is NOT_APPLICABLE.
- Native simulator/runtime testing this iteration: NOT_APPLICABLE under the new stage decision.
- Review outcome: reusable rule added to the [release verification plan](../docs/operations/release-verification-plan.md)
  and [project baseline](../docs/web-ios-model-gateway-plan.md), with stage-transition/full release
  instructions in [build and test](../docs/build-and-test.md).
