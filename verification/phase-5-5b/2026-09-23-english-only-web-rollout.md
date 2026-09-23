# Phase 5.5B English-only staging Web rollout — 2026-09-23

Status: **deployed; revised English-only Gate 7 not yet accepted**.

## Scope and source

- [PR #31](https://github.com/vlingo-ai/mural/pull/31) passed all required CI checks and merged
  as `f3a602e898eed0560fbc36eea809588d469cc5ad`.
- The Web selector now offers English only. Mandarin and Cantonese are disabled with “coming
  later”; Cantonese is labeled “粤语” instead of “香港粵語”. Historical Mandarin conversations
  remain readable. Existing API/native `zh-CN` admission was not changed.
- The VPS checkout moved from `5f71474339ffcc2689319e7ecd8ebff2afcd2561` to the merged
  source above. Across those commits, production API code, Compose, Caddyfile, and Web Dockerfile
  did not change. The API, Worker, Gateway, and PostgreSQL containers were not recreated.

## Safety and rollback

- The active-session query returned no rows immediately before the backup and again immediately
  before the Edge switch; it also returned no rows after rollout.
- Previous running Edge image ID: `sha256:369b0c14e3c2bbc1326f4f06245b03bc1194902ebbcfd100676c4c9954268f6f`,
  retained as `vlingo-speaking-live-staging-edge:rollback-20260923T081828Z`.
- New built and running Edge image ID: `sha256:4bccf0a63b350cfded6168aecd21a692932221e8cea5834d06413bb0e69896af`.
- Pre-switch encrypted PostgreSQL backup: `postgres-20260923T081828Z.sql.gz.age`, SHA-256
  `8d700a30fcd89abdba5638ff735d95349b1d9b7dc3b7ffe75be40160c81ad768`. Its
  off-server Mac copy had the same hash, decrypted with the recovery key, and passed `gzip -t`.
- The private `.env` file remained mode `600`; its SHA-256 before and after checkout was
  `85ba85bc7621f080c8f7ee974b2a7cc1a4a4213377de53f97c41329f17ec24d2`. Compose and
  Caddyfile hashes also remained unchanged. Rollback uses the retained Edge image/tag and
  previous source revision; the database was not migrated, so restoring it is not part of a
  routine Web-only rollback.

## Verification

- Local Web suite: 7 files, 28 tests passed; TypeScript/Vite production build passed.
- PR CI: contracts, secret scan, Swift core, Web, server, and Phase 5.5B deployment checks passed.
- Edge alone was recreated using `docker compose --env-file ./.env up -d --no-deps edge`.
- On-host `verify.sh` passed public TLS, health, disabled Gateway audio capabilities, container
  state, and sanitized-log checks. The API and database remained healthy; running Edge image ID
  matched the newly built image.
- A fresh public staging page accessibility snapshot showed `English` selected, `普通话 — coming
  later` disabled, and `粤语 — coming later` disabled. The public static bundle contained the new
  labels and no `香港粵語` label.
- No new LiveKit room, OpenAI request, purchase, or billable acceptance session was used for
  this rollout.

## Still open

The revised English-only Gate 7 still lacks a safe real LiveKit Cloud quota-refusal result or
an explicitly reviewed waiver, measured first-audio/interruption/reconnect latency with sample
counts, and the same-window Cloud/resource/error/billing audit. The operator authorized three
daily checks of [LiveKit community topic 2106](https://community.livekit.io/t/safe-way-to-test-real-roomservice-quota-rejection-on-build-without-exhausting-shared-limits/2106),
with notification only for a substantive answer; the monitor stops after the third check.
Mandarin development and testing are paused, not passed. The two historical
`provider_usage_final=false` Worker-lease records remain intact for recurrence monitoring.
