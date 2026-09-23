# Phase 5.5B English timing diagnostic staging rollout — 2026-09-23

Status: **deployed for opt-in, non-billable inspection; Gate 7 not yet accepted**.

## Change and compatibility

- [PR #33](https://github.com/vlingo-ai/mural/pull/33) passed contracts, secret scan,
  deployment, server, Swift-core, and Web checks, then merged as
  `a4eb6f9464c839a93e67e7667c3ec39a182dc3de`.
- The staging Web page now has a collapsed timing diagnostic only when opened with
  `?timing=1`; the ordinary URL has no diagnostic UI. It records browser-relative
  candidates for first audible audio, interruption, and reconnection. Values may be
  `null` and require manual validation. No audio, transcript, or credential is
  recorded or uploaded by this diagnostic. The language selector remains English-only,
  with 普通话 and 粤语 marked “coming later”.
- Compared with the previous deployed source `f3a602e898eed0560fbc36eea809588d469cc5ad`,
  this change affects only the Web app. API, Worker, Gateway, Compose, Caddyfile, and
  Web Dockerfile did not require changes; only the Edge container was recreated.

## Safety and rollback

- The active-session query returned no rows immediately before the Edge switch and
  after deployment. No active conversation was interrupted by the rollout.
- Previous Edge image ID `sha256:4bccf0a63b350cfded6168aecd21a692932221e8cea5834d06413bb0e69896af`
  was retained as `vlingo-speaking-live-staging-edge:rollback-timing-20260923`.
  New built and running Edge image ID:
  `sha256:c035abf66c90768aa2d5cbb52045dfb28d73d6407a78346bcef39fa67b9bd651`.
- Pre-switch encrypted PostgreSQL backup:
  `postgres-20260923T085048Z.sql.gz.age`, SHA-256
  `74cf5130ff162897a8c38f502af8eafa7669a6b43986b3045f7625408540f049`.
  An off-server Mac copy matched the hash and passed decrypt plus `gzip -t`.
- The private `.env` remained mode `600`; its SHA-256 stayed
  `85ba85bc7621f080c8f7ee974b2a7cc1a4a4213377de53f97c41329f17ec24d2`.
  Compose and Caddyfile hashes remained unchanged. Rollback uses the retained Edge
  image and previous source; no database migration was made.

## Non-billable verification

- Local Web tests: 34 unit tests, TypeScript/Vite production build, and two
  Playwright E2E tests passed. All required PR CI checks passed.
- `docker compose --env-file ./.env up -d --no-deps edge` started Edge without
  recreating API, Worker, Gateway, or database. On-host `verify.sh` returned
  `PASS` for public TLS, health, disabled Gateway audio capabilities, container
  state, and sanitized logs. `docker inspect` showed Edge running on the new image.
- A fresh public staging browser visit showed the collapsed diagnostic at
  `https://speaking-live-staging.vlingo.ai/?timing=1`, initially with null/empty
  measurements. A visit to the normal URL showed no diagnostic panel. Neither
  visit signed in, opened a LiveKit room, nor made a provider call.

## Remaining gates and limitations

- Opt-in UI availability does not itself establish latency acceptance. Measured
  English first-audio, interruption, and reconnection samples, sample counts,
  manual validation, and same-window resource/error/billing evidence are still
  required. Any live-provider measurement must first recheck active calls,
  remaining allowance, and Cloud/third-party spend against the authorized bound.
- A safe real LiveKit Cloud quota-refusal result or explicitly reviewed waiver
  remains open. Three daily checks of the provider
  [community topic](https://community.livekit.io/t/safe-way-to-test-real-roomservice-quota-rejection-on-build-without-exhausting-shared-limits/2106)
  were authorized, with notification only on a substantive reply.
- Mandarin development/testing is paused, not passed. The two historical
  `provider_usage_final=false` Worker-lease records remain intact for recurrence
  monitoring.
- Staging TCP 22 remains publicly reachable under the accepted dynamic-VPN
  exception. The shared LiveKit project key pair remains an accepted staging
  defense-in-depth limitation; API and Worker pairs still need later separation.
