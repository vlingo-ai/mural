# English timing energy-gate diagnostic rollout — 2026-09-23

Status: **deployed to staging for opt-in inspection; Gate 7 latency acceptance remains open**.

## Reviewed change and scope

- [Mural PR #35](https://github.com/vlingo-ai/mural/pull/35) merged after the Web, server,
  Swift-core, contracts, deployment, and secret-scan checks passed. Merge/source revision:
  `525925e63922efab7a9a25d9920b18e622388748`.
- The staging Web diagnostic, only visible with `?timing=1`, now records bounded browser-relative
  `local-energy-onset`, `remote-energy-onset`, and `remote-energy-silence` events. These are
  candidate energy transitions, not transcripts, audio recordings, or proof of intentional
  speech. The existing interruption-latency calculation and ordinary Web page are unchanged.
- The change touched only Web code, tests, and verification files. It required no API contract,
  Worker, Gateway, Compose, Caddyfile, migration, runtime-grant, or secret change. Only Edge was
  rebuilt and recreated; the running API, Worker, Gateway, and PostgreSQL were not restarted.

## Pre-switch safety and rollback

- Before the switch, `active-sessions.sh` returned no non-closed sessions. The release worktree
  was clean. `preflight.sh` passed without printing secrets.
- An encrypted PostgreSQL backup was created at
  `backups/postgres-20260923T101014Z.sql.gz.age`; its SHA-256 is
  `c7ba65b404af5c9b81e8e876d9490f2a4b501ca0820b3c899374b999b977e77a`.
  A mode-600 Mac off-server copy matched that hash, decrypted with the recovery identity, and
  passed `gzip -t`. No SQL plaintext was displayed or stored in this record.
- The previous running Edge image was
  `sha256:c035abf66c90768aa2d5cbb52045dfb28d73d6407a78346bcef39fa67b9bd651`.
  It was retained as `vlingo-speaking-live-staging-edge:rollback-before-525925e` before build.
- The private `.env` SHA-256 stayed
  `85ba85bc7621f080c8f7ee974b2a7cc1a4a4213377de53f97c41329f17ec24d2`
  through source checkout and after deployment. Its values were not printed.

## Non-billable verification

- Local Web verification: 37 unit tests, TypeScript/Vite production build, and two Playwright
  E2E flows passed. The standalone Mac-only microphone/speaker calibration established that
  the current 0.012 threshold detected two spoken onsets over an audible synthetic tone, without
  LiveKit/OpenAI requests; it does not prove the real Agent case.
- The built and now running Edge image is
  `sha256:cdff871496ffbcccc905793c9dfa26470eb111299cc8b00bb9ddd90bb6913c50`.
  `docker compose up -d --no-deps edge` recreated only Edge, which reported `running`.
- On-host `verify.sh` returned PASS for public TLS, service health, disabled Gateway audio
  capability, all running containers, and sanitized logs. A second active-session query returned
  no non-closed sessions. The API and Gateway retained their healthy state; Worker remained up.
- Fresh public browser visits found the revised explanatory text and an empty diagnostic report
  at `https://speaking-live-staging.vlingo.ai/?timing=1`. The ordinary staging URL had no timing
  panel. No login, room creation, model call, or paid acceptance sample was performed.

## Remaining acceptance limits

The first English live observation remains a single uncalibrated first-audio sample with a
manually successful interruption but no recorded latency; the new energy-gate events cannot
reconstruct it retroactively. Before another bounded live run, recheck active sessions,
the 116,000 ms Mural allowance and external OpenAI actual spend against the authorized cap.
The real LiveKit Cloud quota-refusal gate still needs a safe supported method or an explicit
reviewed waiver. Mandarin development/testing remains paused; prior Mandarin ASR quality was
not accepted. The correct overall status remains **deployed but not Gate 7 accepted**.

Staging TCP 22 remains publicly reachable under the operator's accepted dynamic-VPN exception,
with key-only SSH, disabled root/password login and UFW rate limiting; replace it with restricted
or private access before long-term operation. The API and Worker also still share one LiveKit
project key pair under the accepted staging-only exception; independent pairs and revocation of
the shared pair remain a defense-in-depth follow-up. Neither exception was changed in this rollout.
