# Local real-media tests (B5, incomplete)

Run from `apps/web` with Node/npm, Chrome and `livekit-server` on PATH.
Validated locally with LiveKit Server 1.13.7, locked client 2.22.3 and Chrome 153.

```bash
npm ci --ignore-scripts
npm run test:media
npm run test:media -- --repeat-each=3
```

Playwright starts and stops its own Vite and LiveKit processes. Ports 15173,
17880, 17881 and 17882 must be free; existing servers are not reused.
Only synthetic dev credentials/audio are used. Do not supply staging environments
or provider keys. No physical microphone or audible speaker output is required.

The suite covers real SDK transport, the production LiveConnection adapter,
signaling recovery and repeated Stop, including Stop at recovery entry. Independent
uplink/downlink sender-source detachment uses native `RTCRtpSender.replaceTrack(null)`:
receiver energy must stop, the opposite direction must carry fresh tone transitions,
and reattaching the original track must restore receiver energy without new admission.
This is NOT packet loss or a broken ICE transport. Active is expected while transport
remains healthy; silence/source absence alone must not be called a network failure.
The product control API is a test double: this does not verify database accounting,
Worker lifecycle, persisted history, human audibility or real Wi-Fi failure.
HTTP/WebSocket guards and local ICE configuration are not an OS egress firewall.
The Web CI job installs checksum-pinned LiveKit 1.13.7 after dependencies, then runs
the suite in a Linux network namespace with loopback only. Vite, LiveKit and Chromium
share the namespace; the test processes run as the ordinary runner user. The runner's
own network is unchanged. Failure to create the namespace fails the job (no fallback).
This CI path is implemented but awaits a GitHub Linux run; local macOS results do not
validate Linux provisioning or isolation. Independent network fault injection is pending.

Stop-during-recovery observes five seconds after Idle for stale Active transitions;
it is a bounded regression check, not proof against arbitrarily late events.
Injected signaling faults can produce SDK disconnect/leave/error logs. Preserve
unexpected errors for diagnosis; a passing assertion is not a zero-error-log claim.

Evidence: `verification/2026-09-26-b5-local-media.md` at the repository root.
Keep the mandatory release verification plan updated after each iteration.
