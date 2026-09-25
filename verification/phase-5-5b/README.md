# Phase 5.5B verification records

Current summary (2026-09-24): **deployed, English-only, Gate 7 not accepted**.
The [accepted development baseline](../../docs/web-ios-model-gateway-plan.md) owns next steps.
Its B1–B7 reliability/contract work is the hardening work between Phase 5.5B and Phase 5.5C,
not part of the original Gate 7 acceptance scope. It can proceed alongside the remaining Gate 7
closeout; starting B1 does not mean this gate is accepted, and closing this gate does not require
completion of all B1–B7 tasks.
Lessons from this gate are captured in the [reusable release verification design](../../docs/operations/release-verification-plan.md)
and [future-release report template](../release-verification-template.md); planned automation is not yet implemented.
Read dated reports in order: later scope decisions supersede earlier pending-test lists, not past observations.
Mandarin development/testing is paused; native/API compatibility remains.
The September 24 run has recorded recovery timing, resource samples, final internal settlement,
and API HTTP errors (0/30 excluding health checks; 0/39 including them, within a bounded window).
Network-detection latency remains missing. On September 24 the operator explicitly accepted
the recorded timing limitations for this English staging gate, without claiming full performance
acceptance. An updated OpenAI screenshot now shows USD 0.98 for the same project and fixed
August 25–September 24 date range, versus USD 0.94 previously: a displayed project-level
increase of USD 0.04. The updated staging cost/budget check is recorded, below the USD 2.00 cap;
The operator subsequently confirmed no other projects were in parallel use, so the displayed
USD 0.04 increment is attributed to this test for staging operational reconciliation. This relies
on the screenshots and operator confirmation, not request-level billing verification; cent-level
display precision and possible historical late postings remain limitations. It is not a final
invoice or authorization to spend more.
Real Cloud CreateRoom/CreateDispatch rejection is now **WAIVED, not actually tested**, for this
English staging Gate 7 only. After reviewing a substantive community reply on September 24,
the operator explicitly accepted the waiver and stopping the monitor. The `livekit` automation
was deleted. This new decision supersedes the September 25/26 waiting arrangement; it is not
an invocation of the earlier no-reply condition. Keep the local 429→database settlement evidence;
do not equate it with a real Cloud rejection or infer permission for bursts, capacity purchases,
or cap changes. See the [reply review and decision](2026-09-24-gate-7-continuation.md#cloud-waiver-decision).
The final gate report/signoff remains open. This single waiver is not an overall Gate 7 pass
and is not inherited by future releases.
The two historical non-final Worker records remain operator-reconciliation unknowns with follow-up on recurrence.
The September 24 continuation contains the closing evidence matrix and the authorized staging-only
timing exception. The operator subsequently explicitly confirmed that no audio was heard before
disconnection. This run demonstrates connection recovery with new audible replies, not recovery
of previously audible playback. The initial lack of audible audio remains unexplained and is
retained for reliability follow-up, not marked fixed. Earlier uncertain reports and missing
timestamps are preserved; the accepted staging exception remains, without another paid run.

- [Gate 7 observations and subsequent decisions](2026-09-22-gate-7-bounded-acceptance.md)
- [September 24 continuation and evidence gaps](2026-09-24-gate-7-continuation.md)
- [Reconnect investigation and repairs](2026-09-23-reconnect-incident.md)
- [English-only deployment](2026-09-23-english-only-web-rollout.md)
- [Timing measurement definitions and samples](2026-09-23-english-timing-diagnostic.md)
- [Latest energy-gate deployment record](2026-09-23-english-energy-gates-rollout.md)

Dashboard dollar observations retain their original date/filter and reporting delay; they are not
final invoices. A $90 top-up must not be counted as usage. Historical timestamps are not reconstructed
from memory. This documentation update did not re-query the VPS or provider dashboards.

Store sanitized, dated Cloud Build verification reports here. Do not commit `.env`, credentials,
raw container inspection, transcripts, room metadata, database dumps, or provider response bodies.

Use `deploy/phase-5-5b/README.md` as the gate order. A preparation or local Compose result must not be
described as a real deployment or Phase 5.5B acceptance.

The current staging operator accepted the runbook's dynamic-VPN SSH exception on 2026-09-20:
TCP 22 may temporarily remain public while public-key-only authentication, disabled root/password
login, UFW rate limiting, automatic security updates, and SSH logging are verified. Every dated
report must list this as an unresolved hardening item until a source-restricted or private access
path replaces it. This exception does not authorize exposing ports 5432, 8000, or 8080.

The staging operator also accepted the current shared LiveKit project key pair for the bounded
Phase 5.5B staging gate on 2026-09-22. The API uses it for room lifecycle, agent dispatch, and
short-lived participant tokens; the Worker uses it to authenticate and register. Record splitting
this into distinct API and Worker key pairs as an unresolved defense-in-depth item until the pairs
are independently rotatable and the old shared pair has been revoked. `LIVEKIT_CONTROL_SECRET`
must remain API-only. Do not record key values, secret hashes, or raw environment inspection.
