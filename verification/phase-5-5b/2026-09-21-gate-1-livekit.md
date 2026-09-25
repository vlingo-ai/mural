# Gate 1 — LiveKit Cloud Build resources (2026-09-21)

<!-- baseline-scope:2026-09-23 -->
> 历史证据：保留当时部署、测试和观察，不追改结果。旧 pending 项由最新基准及本目录索引统一管理；普通话已暂停，英语 Gate 7 仍未通过。本文件不是当前部署命令清单。
> 当前范围和后续顺序见[项目开发基准](../../docs/web-ios-model-gateway-plan.md)。

Status: **prepared; no deployment or billable acceptance session has run**.

## Project

- Project name: `vlingo-speaking-live-staging`
- Project ID: `p_68wcqw9pv9i`
- Plan: Build
- Project data region: European Union (Frankfurt)
- Project URL evidence: `wss://vlingo-speaking-live-staging-…livekit.cloud`
- Agent observability: off; LiveKit session traces, transcripts, and audio recording are not enabled
- Inference region restriction: enabled. The Phase 5.5B worker calls its provider directly, so this
  LiveKit Inference setting is not relied on for provider residency.
- Protocol-based Region Pinning: not enabled. It is a Scale-or-higher feature that LiveKit Support
  must enable; the Build project continues to use LiveKit's automatic nearest-region routing.

## Credentials

- A dedicated service-account key named `vlingo-speaking-live-staging-vps-2026-09` was issued on
  2026-09-21. The recorded API-key suffix is `n7px`.
- The operator stored the key and secret privately. Neither value is committed here; the secret was
  not pasted into chat or a terminal transcript.
- The automatically created, undescribed personal key remains temporarily enabled. Revoke it only
  after the dedicated service-account key has passed VPS deployment verification.
- No legacy `mural-staging` credential is being reused.

## Build allowances and limits

The dashboard reported zero usage and a `$0.00` next invoice. Current Build limits observed in the
project were one Cloud Agent, five concurrent agent sessions, 100 concurrent participants, two
concurrent ingress requests, two concurrent egress requests, and 10,000 dashboard-reported API
requests per minute.

The current LiveKit quota documentation records monthly Build allowances of 1,000 agent-session
minutes, 5,000 WebRTC participant minutes, and 50 GB downstream data transfer. Build is a free
hard-cap plan: exhausted allowances reject new requests instead of creating overage charges.
Allowances are shared across a user's free projects, reset on the first day of each calendar month,
and do not roll over.

No spend/usage notification control was available in the project Billing, Usage, or quota pages.
The hard cap is therefore the available cost guardrail. Recheck usage immediately before and after
the separately authorized bounded Cloud Build acceptance test.

## Remaining Gate 1 follow-up

- Inject the dedicated key, secret, and exact `wss://` URL into the VPS private `.env` with mode
  `0600`; do not expose them in shell history or logs.
- After deployment verification succeeds with the service-account key, revoke the automatically
  created undescribed personal key and record the revocation time.
- During the real test, record the automatically selected LiveKit media region. Do not enable
  Region Pinning for this Build validation.
