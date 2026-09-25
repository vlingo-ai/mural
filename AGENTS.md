# Mural agent instructions

## Maintain the release verification plan after every iteration

On September 24, 2026, the user designated `docs/operations/release-verification-plan.md` as one of
this project's highest-priority mandatory living documents. Read it when planning development
verification. After each iteration's testing and verification, update it before reporting the
iteration complete, including when tests fail, are blocked, or reveal no new reusable rule.

- Preserve detailed, dated, sanitized evidence under `verification/`; link it from the plan's
  iteration register with the scope/revision, results, limitations, lessons and automation changes.
- Promote reusable findings into the relevant test cases, gates, procedures or automation backlog.
  If no rule changes are needed, explicitly record that review outcome rather than skipping the update.
- Keep implemented, locally tested, deployed and live-accepted states distinct. Do not mark planned
  automation as implemented or carry one release's waiver into later releases without approval.
- Update affected runbooks/templates and include the plan/evidence references in the PR and handover.
  Keep secrets, raw conversation content and private backups out of documentation.

This documentation obligation does not authorize paid tests, deployment, new feature activation or
changes to the accepted development priorities. Product scope remains in the project baseline;
deployment safety remains governed by the runbook and the instructions below.

## Ship UI and server changes together

When changing Mural's UI or native apps, check whether the experience depends on server changes: API contracts, error responses, prompts, capabilities, configuration, migrations or runtime permissions.

William requested on September 16, 2026 that required server deployment be part of delivering an authorized app/UI release. Deploy the matching tested server changes before reporting that release work is complete. A merged backend PR or published APK does not establish that production has the required behavior. If deployment is unnecessary, say why; if blocked, report the exact remaining step.

- Inspect the actual production revision and deployment wrapper. Preserve private configuration, enabled features, credentials and retained data. The backend README includes historical activation instructions; confirm current production settings before using them.
- Test the affected server behavior and app/server compatibility. Highlight every new UI/UX change before proposing or performing a merge.
- Before deployment, check active calls, retain the previous image and configuration, and take the existing encrypted backup. Apply only required migrations and runtime grants. Avoid interrupting active conversations.
- Deploy in a compatible order. Do not enable a client feature before its required server behavior is available.
- Verify the deployed source/image, public health and database readiness, affected endpoint contracts, and sanitized logs. Use non-billable checks unless a live provider call or purchase is separately authorized.
- Record the deployed revision, verification results, rollback location and any remaining limits. Distinguish local tests, live verification, merging and deployment in the handover.

Use the user's current instructions to resolve release scope and deferred work. Do not ask again for deployment approval already provided for that scope. This workflow does not authorize unrelated feature activation, pricing changes or destructive data operations.
