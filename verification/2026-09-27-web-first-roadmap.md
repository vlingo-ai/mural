# Web-first priority decision — 2026-09-27

User accepted deferring full multi-provider expansion and prioritizing current
English Web readiness, adding Web MVP feature development and UI/UX adjustment
before small-group testing. Web must finish testing and actually launch customer
trials before iOS development resumes. Android remains after iOS.

Updated baseline W0–W7, C task grouping, native start prerequisites, all three
client entry READMEs, documentation index and mandatory release verification plan.
Corrected stale B-stage-next wording; historical evidence is retained unchanged.
No new Phase number. MVP feature list and UI design are not yet approved; next
planning step defines must-have/deferred scope and acceptance criteria.

Customer trial launch does not implicitly waive C2/C5, authorize unrestricted
public access, payments, extra languages, infrastructure purchases or provider
tests. Any restricted customer-trial exception to production rolling-release
requirements needs a separate explicit decision. Existing single-instance
supervised staging workflow is not zero-downtime production capability.

Verification: documentation diff/relative-link checks only; no runtime, UI,
schema, credentials, CI stage or deployment changed. No new paid calls. Related
server deployment is unnecessary for this planning-only change. The reusable
rule is to verify the final MVP candidate after relevant UI/runtime changes and
keep internal testing, customer launch and native development as separate gates.
