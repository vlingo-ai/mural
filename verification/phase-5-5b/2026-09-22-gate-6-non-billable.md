# Phase 5.5B Gate 6 non-billable staging verification — 2026-09-22

<!-- baseline-scope:2026-09-23 -->
> 历史证据：保留当时部署、测试和观察，不追改结果。旧 pending 项由最新基准及本目录索引统一管理；普通话已暂停，英语 Gate 7 仍未通过。本文件不是当前部署命令清单。
> 当前范围和后续顺序见[项目开发基准](../../docs/web-ios-model-gateway-plan.md)。

Status: **in progress; deployed but not accepted**. No billable English or Mandarin acceptance
session was authorized or started by the checks recorded here.

## Verified

- Public API health returned `ok=true`, `hostedVoice=true`, `guestMinutes=false`, and
  `livePayments=false`.
- The full non-billable verification script passed public TLS, health, disabled Model Gateway audio
  capability, required container state, and its sanitized-log check.
- Database, API, and Model Gateway were healthy; the Edge and Agent Worker were running. The Worker
  registered with the named staging agent in the intended LiveKit project.
- PostgreSQL, Model Gateway, and API listened only on VPS loopback ports 5432, 8000, and 8080.
  Independent external probes could not connect to those ports or to the Worker's port 8081. A Mac
  `nc` check while using VPN reported misleading successful TCP connections for all four ports; VPS
  socket inspection, UFW policy, and an independent no-proxy probe were used to resolve the result.
- UFW remained default-deny for incoming traffic and allowed only the documented SSH, HTTP, HTTPS,
  and HTTP/3 rules. The dynamic-VPN public SSH exception remains unresolved as recorded in this
  directory's README.
- Environment-name inspection exposed no secret values: API had no OpenAI key; Worker had no
  database, Accounts, or Gateway secret; Model Gateway had no LiveKit credential or Worker key.
- A temporary five-minute Mural authentication session for the existing restricted staging account
  made one read-only request to `/v1/live/capabilities`. The endpoint returned HTTP 200 with
  `hostedMinutes=true`, `transport=livekit-room`, and `experimental=true`. The script deleted the
  temporary session in `finally`; a follow-up database query found zero unrevoked sessions for that
  account expiring within six minutes. No LiveKit room or provider request was created.

## Accepted security follow-up

The API and Worker currently receive the same LiveKit project API key pair for different required
roles. This is functionally expected for the current staging design, but couples their credential
rotation and revocation. The operator accepted it for bounded Phase 5.5B staging and requested that
separate API and Worker LiveKit key pairs be tracked for later hardening. Before broader or
long-term operation, implement explicit per-service variables, require unequal pairs in preflight,
verify room lifecycle/dispatch/Worker registration, and revoke the shared pair. This improves
auditability and independent revocation but is not, by itself, a claim of fine-grained provider
authorization. `LIVEKIT_CONTROL_SECRET` remains API-only.

## Remaining gate

Gate 7 was subsequently authorized and started. Its bounded live results, reconnect fix, deployment,
and remaining acceptance items are recorded in `2026-09-22-gate-7-bounded-acceptance.md`. Phase
5.5B remains incomplete.
