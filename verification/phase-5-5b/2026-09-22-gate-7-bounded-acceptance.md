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
  reported materially inaccurate Mandarin ASR in an earlier live sample. Treat this as an open
  quality finding; do not describe Mandarin quality acceptance as passed without a defined rubric
  and follow-up sample.
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

Until these items are resolved, the accurate release status is **deployed but not accepted**, not
**Phase 5.5B complete**.

## 2026-09-23 continuation

The later reconnect repair and quota-rejection API repair were deployed separately after this
initial record. See [the dated reconnect and quota incident record](2026-09-23-reconnect-incident.md)
for exact revisions, the fresh off-server encrypted backup, passing deployment verification, the
one successful bounded English reconnect retest, and the reviewed language-independent Mandarin
Worker hard-stop rationale. No actual LiveKit Cloud quota refusal has been forced or observed.

The 24-hour LiveKit project aggregate and Mural's 721,000 ms total charge use different accounting
units: two historical, pre-repair Web-only room re-joins account for at least 59 cloud participant
minutes after their corresponding Mural sessions had closed. They are not evidence of continued
OpenAI speech. All 16 Mural sessions were closed, and the two identified Worker-lease cases had
settled reservations, but their `provider_usage_final=false` cost markers still require operator
reconciliation.
The idle container resource snapshot is not a peak-load measurement. Cloud rejection, Mandarin ASR
quality, latency/resource/error metrics, and the historical room-duration discrepancy remain
acceptance work; no additional paid test is justified yet.
