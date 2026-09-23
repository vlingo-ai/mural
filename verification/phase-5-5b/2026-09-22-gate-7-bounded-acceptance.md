# Phase 5.5B Gate 7 bounded Cloud Build acceptance — 2026-09-22

Status: **in progress; deployed but not accepted**.

The operator authorized English and Mandarin live acceptance with a cumulative 15-minute Mural
allowance and a USD 2 OpenAI lifetime cap. No purchase, plan upgrade, raw transcript, room metadata,
credential, or provider response body is included in this record.

## Deployed revisions and rollback

- API source/image: Mural `4bedf19783e5ccc819f362895d2f122a6307a9d9`, retained previous API
  image `vlingo-speaking-live-api:f41d4ac8b0cf5a1084077cbede58e69a807ca92f`.
- Web source: Mural `89e1294d6f6cf830b15db547f2deb846a9474b04`, merged by
  [PR #17](https://github.com/vlingo-ai/mural/pull/17).
- Deployed Edge image manifest: `sha256:3ce28d4f442063108ff0bd64993915d1c2087bb4b9d9b5ca46`;
  the prior Edge image is tagged with the `4bedf19783e5ccc819f362895d2f122a6307a9d9` rollback revision.
- Model Gateway image: `sha256:9e9b7eec2fb394a30f80c1126cc81e116bb8ac762ad1c81cbf1829bea532860c`.
- LiveKit Worker image: `sha256:cf2f97432e488d53341dbb11f40eb2c4e27465e995f2c0cbf61ebedffedf75c1`.
- Pre-Web-rollout encrypted backup: `postgres-20260922T072434Z.sql.gz.age`, SHA-256
  `253512b88c698d391f2c39d975e663cf246eb89b18310c56d4053178e49b7ed5`.
  The off-server copy decrypted successfully and passed `gzip -t`.
- Only Edge was recreated for the reconnect fix. API, Worker, Gateway, and PostgreSQL were not
  restarted; public Web HTTPS and API health passed after rollout.

The staging host remains Ubuntu 24.04 LTS in Alibaba Cloud Tokyo (`ap-northeast-1`). LiveKit uses
the isolated `vlingo-speaking-live-staging` Build project with automatic routing; observed Worker
registration/media placement was Japan A.

## Bounded usage

- Starting allowance: 900,000 ms.
- Charged after the tests recorded here: 387,000 ms.
- Remaining: 513,000 ms; reserved: 0 ms.
- No session exceeded its reservation and every completed test released its reservation.

## Passed behavior

- English and Mandarin both established Cloud rooms, connected the browser and Worker, played
  remote audio, produced captions, accepted typed/live input, and stopped explicitly with final
  usage and `reserved_ms=0`.
- The Mandarin client-delegated translation path reached Mural and the Responses-only Model
  Gateway, settled one helper request, and recorded no search call or limit breach.
- English natural interruption stopped the current reply and accepted a new utterance. A
  post-close LiveKit binary-stream warning was observed after this test; it did not prevent the
  response or settlement and remains a runtime-quality follow-up.
- English Worker hard-stop session `aed1ca70-5c66-497d-baef-53822d66efb9` closed as
  `worker_lease_expired`, charged/observed 42,000 ms, released the 600,000 ms reservation, and set
  `provider_usage_final=false` for operator reconciliation. The Worker was restored and registered.
- The first real client-network test settled safely but exhausted the LiveKit SDK default retry
  list and displayed `Failed`; session `2da2c09b-f435-4ee8-84ad-f9eb1c4e1c75` charged/observed
  66,000 ms with final provider usage and no leaked reservation.
- PR #17 replaced that finite retry list with a bounded 90-second recovery policy: immediate/fast
  retries followed by seven-second retries, then fail closed. Unit, build, Playwright, deployment,
  server, Swift, contract, and secret-scan CI passed.
- After deployment, a five-second Wi-Fi interruption recovered the same session in both languages.
  Audio and captions continued after recovery and explicit Stop returned the Web UI to Idle:
  - English `02e6d5ad-4afe-46ba-9bd6-52037c65eaf4`: `user_requested`, observed/charged
    100,000 ms, final provider usage, `reserved_ms=0`.
  - Mandarin `897c37c3-9646-40dd-a512-4a778b408053`: `user_requested`, observed/charged
    60,000 ms, final provider usage, `reserved_ms=0`.

## Open acceptance items and limits

- Mandarin audio, translation, interruption, captions, and reconnect worked, but the operator
  reported materially inaccurate Mandarin ASR in an earlier live sample. On 2026-09-23 the
  operator accepted this as a **staging-only quality limitation** and waived another billable
  Mandarin ASR retest in Phase 5.5B. Accuracy was **not** accepted as passing, and the cause was
  **not** proven to be exclusively upstream: microphone processing, media transport, and caption
  assembly remain application-controlled. Reassess with a defined rubric before broader release.
- The Cloud quota/limit rejection path still needs a controlled fail-closed exercise with a safe
  user error and `reserved_ms=0`. Do not purchase capacity or deliberately exhaust shared Build
  allowance to manufacture this test.
- Worker hard-stop/reconciliation was exercised in English. The common transport and settlement
  path is language-independent, but the runbook literally requests both languages; record either
  a bounded Mandarin exercise or an explicit reviewed rationale before closing the gate.
- Median/worst first-audio, interruption, and reconnect latency; LiveKit participant minutes and
  ingress/egress; error count/rate; VPS CPU/RSS; and final billed duration summary remain to be
  captured. The two reconnect tests establish functional recovery, not a latency percentile.
- SSH TCP 22 remains temporarily public under the accepted dynamic-VPN exception. The shared
  API/Worker LiveKit project credential remains an accepted staging-only hardening item.

Until the remaining mandatory items are resolved, the accurate release status is
**deployed but not accepted**, not **Phase 5.5B complete**.

## 2026-09-23 continuation

The later reconnect repair and quota-rejection API repair were deployed separately after this
initial record. See [the dated reconnect and quota incident record](2026-09-23-reconnect-incident.md)
for exact revisions, the fresh off-server encrypted backup, passing deployment verification, the
one successful bounded English reconnect retest, and the reviewed language-independent Mandarin
Worker hard-stop rationale. A later non-billable local test joins LiveKit's 429 adapter to real
PostgreSQL minute/helper settlement and passes, but no actual LiveKit Cloud quota refusal has been
forced or observed.
On 2026-09-23 the operator explicitly retained the original **real Cloud quota/limit refusal**
acceptance criterion; the local 429 test is complementary evidence, not a substitute. Do not
exhaust shared Build capacity, change plans, or claim Gate 7 accepted to manufacture a result.
The project's read-only Cloud quota page says Build limits are fixed. It showed 100 concurrent
participants (past-7-day peak 2) and 10,000 API requests per minute (peak 5); no adjustable
project-side RoomService test limit was exposed. A forced limit by saturating either shared
resource would be outside this bounded acceptance. A provider-supported isolated rejection
mechanism or an actual naturally occurring Cloud refusal is still required for the literal gate.
LiveKit's published quota guidance says free Build projects share allowances and limits across
the user's free projects, so creating another free project would not isolate a saturation test.
It also describes a 1,000-requests-per-minute Server API limit; this differs from the 10,000
requests-per-minute number displayed by this project's dashboard. Treat the project dashboard
as the observed project setting and do not manufacture a refusal against either number. The
safe next path is to obtain provider confirmation of an isolated, low-impact rejection method,
or wait for a naturally occurring Cloud refusal while keeping the reservation/error audit ready.

The 24-hour LiveKit project aggregate and Mural's 721,000 ms total charge use different accounting
units: two historical, pre-repair Web-only room re-joins account for at least 59 cloud participant
minutes after their corresponding Mural sessions had closed. They are not evidence of continued
OpenAI speech. All 16 Mural sessions were closed, and the two identified Worker-lease cases had
settled reservations, but their `provider_usage_final=false` cost markers still require operator
reconciliation or a clearly documented deferral; see the operator decision below.
The idle container resource snapshot is not a peak-load measurement. Cloud rejection,
latency/resource/error metrics, and a watch for renewed Web-only room duration remain acceptance
work; Mandarin ASR accuracy is an explicitly accepted staging limitation, not a passed quality
check. Before any additional bounded live test, recheck the remaining trial allowance,
Cloud project usage, and active sessions; do not repeat a fault case only to manufacture quota.
The latest read-only wallet and ledger aggregate, including its accounting limits, is in the
[incident continuation](2026-09-23-reconnect-incident.md). The wallet has 179,000 ms remaining
and no hold. Historical first-audio/interruption medians and worst values cannot be recovered
from the current dashboard; a future instrumented, bounded live run would be needed for those
measurements, subject to the remaining time and external OpenAI spend check.

## 2026-09-23 operator follow-up decisions

The operator authorized a generic, non-sensitive question to the LiveKit community about a
low-impact real Cloud `CreateRoom`/`CreateDispatch` quota refusal. It was posted at
[community topic 2106](https://community.livekit.io/t/safe-way-to-test-real-roomservice-quota-rejection-on-build-without-exhausting-shared-limits/2106)
without project identifiers, credentials, or logs. There was no reply at the time of this record.
The operator's conditional direction is to consider waiving the **real Cloud-only** exercise if
there is no safe supported method or the cost/disruption is disproportionate. That decision is
not yet applied: review the response or agree a reasonable no-answer interval first, then record
the exception explicitly. The local 429-to-PostgreSQL settlement test remains valid but distinct.

For the two historical `provider_usage_final=false` Worker-lease records, the operator prefers
deferring invoice reconstruction and watching for recurrence rather than spending more time on
old fault cases. Both are pre-repair records with settled minute reservations and no open wallet
hold; one was the documented deliberate Worker hard-stop. Their exact final provider usage and
whether the earlier reconnect bug caused either marker have **not** been established. Preserve
the flags and records; do not rewrite them to `true` or call them reconciled. Investigate promptly
if a new *ordinary* post-repair session has `provider_usage_final=false`, an unresolved reservation,
or a material provider-bill-versus-ledger discrepancy. No new paid call is authorized solely to
manufacture a recurrence check.

Recommended latency evidence path, **not yet implemented or measured**:

1. Add an opt-in staging Web diagnostic using `performance.now()` on the same browser clock.
   Record Start click, first non-silent received Agent audio actually playable in the page,
   first recovery signal, Connecting state, verified media-ready Active state, and first audible
   post-recovery reply. `TrackSubscribed` alone is not first audible audio. Keep physical Wi-Fi
   outage-to-detection delay separate from SDK recovery-to-ready delay because browser offline
   and SDK failure detection can lag.
2. For natural barge-in, record local microphone speech onset while Agent audio is active and
   the point where remote audible energy stops. A bounded, calibrated local-only energy detector
   should be checked for echo/noise false positives. Worker-side `RealtimeModelMetrics.ttft` and
   Agent state events can help decompose provider/turn latency, but are not browser playback
   latency; never subtract timestamps from different hosts without clock calibration.
3. Retain only opaque session ID, event kind, relative milliseconds, result/failure and sample
   count in an ephemeral test summary. Do not persist or upload audio, transcripts, room metadata,
   or credentials. Unit-test event ordering, silence, reconnect failure, microphone/Agent loss,
   and diagnostic cleanup before any staged Web/Worker release.
4. After a separately budget-checked deployment, collect several bounded English samples,
   report median and worst **observed** values plus sample counts/failures, and capture concurrent
   VPS CPU/RSS and project Cloud usage for the same window. The remaining 179,000 ms and the
   unverified actual OpenAI invoice make an unplanned live sampling batch inappropriate.

## 2026-09-23 English-only scope and community follow-up

The operator has paused Mandarin development and testing for this Phase 5.5B staging acceptance.
English is the only selectable Web language; Mandarin is shown as "coming later", like Cantonese,
whose display name is now "粤语". Prior Mandarin evidence remains historical, not an English
acceptance result or a claim that Mandarin ASR quality passed. The existing API/native `zh-CN`
compatibility and saved conversation history are not removed; this is a Web staging selection and
acceptance-scope change, not an API-wide block. Mandarin needs a separately defined quality rubric
and acceptance before being offered again.

The operator authorized three daily checks of the [LiveKit community topic](https://community.livekit.io/t/safe-way-to-test-real-roomservice-quota-rejection-on-build-without-exhausting-shared-limits/2106),
with notification only for a substantive reply, then automatic cessation. A lack of reply after
three days is **not** itself a Cloud quota refusal test or an automatic waiver; review the
provider guidance or absence of a safe method before recording any explicit waiver. The real
Cloud rejection criterion, English latency/resource metrics, and final budget audit remain open.

## 2026-09-23 English timing continuation

The opt-in browser timing diagnostic and its follow-up energy-gate events were merged and deployed
to staging in Edge-only rollouts; see the
[first timing rollout](2026-09-23-english-timing-rollout.md) and
[energy-gate rollout](2026-09-23-english-energy-gates-rollout.md). One English live observation
had audible first speech and captions, and the operator successfully interrupted the second
Agent sentence; the Agent understood and slowed its reply. The single first-audio candidate was
15,646 ms, but the interruption array was empty, so no latency median, worst value, or causal
diagnosis is established. A non-billable local Mac speaker/microphone calibration detected two
speech-onset candidates over an audible synthetic tone at the current threshold. No threshold
change was justified. The follow-up timing events can help distinguish future missing local
onsets from remote-audio gaps, but cannot reconstruct the earlier live run.

The operator-side button race after the first live run created a second, quickly stopped Mural
session. The two sessions charged 48,000 ms and the 15,000 ms minimum respectively; both closed
with final provider usage and released reservations. The last checked wallet was 116,000 ms
remaining, reserved 0, with no active sessions. Recheck these values and actual OpenAI spend
before any further paid test. No paid call was made during the follow-up instrumentation rollout.
The safe real LiveKit Cloud quota-refusal criterion remains open, so Gate 7 is still not accepted.

## 2026-09-23 bounded English timing follow-up

One more operator-authorized English live sample was taken after the energy-gate diagnostic
deployment. Audio, captions, and natural interruption worked according to the operator. The
browser reported `firstAudioMs=14366` and one interruption candidate at 280 ms; Stop was
requested at 31,205 ms. The corresponding Mural session closed `user_requested` with final
provider usage, 23,000 ms observed/charged, a settled reservation, 93,000 ms wallet balance,
and zero reserved. The LiveKit project had zero concurrent Agent sessions afterward. Details and
measurement limits are in the [timing diagnostic record](2026-09-23-english-timing-diagnostic.md).
The OpenAI Usage dashboard still displayed the pre-run USD 0.92 immediately after refresh, so
its new charge is **not yet reconciled**; do not count it as zero or start another paid sample
on that basis. One new first-audio and one interruption candidate do not establish a median,
worst-case bound, or reconnection latency. Real Cloud quota refusal and concurrent resource
metrics also remain open. The status is **deployed but not Gate 7 accepted**.
