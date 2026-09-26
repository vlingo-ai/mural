# Local real-media tests (B5, incomplete)

Run from `apps/web` with Node/npm, Chrome and `livekit-server` on PATH.
Validated locally with LiveKit Server 1.13.7, locked client 2.22.3 and Chrome 153.

```bash
npm ci --ignore-scripts
npm run test:media
npm run test:media -- --repeat-each=3
```

Playwright starts and stops its own Vite and LiveKit processes. Ports 15173,
17880 and 17882 must be free; existing servers are not reused. Media TCP is disabled
to make UDP fault tests deterministic; this suite does not establish TCP fallback coverage.
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
the suite in a Linux network namespace with loopback and an unconnected dummy NIC
(`192.0.2.1/24`, default route to the dummy, no veth/uplink). Vite, LiveKit and Chromium
share the namespace; the test processes run as the ordinary runner user. The runner's
own network is unchanged. Failure to create the namespace fails the job (no fallback).
The first loopback-only Linux run failed: browser ICE candidates were empty. The dummy
NIC topology passed all six media cases in GitHub Linux run 36225537205 (16.5 seconds).
CI also enables short UDP uplink/downlink loss cases via `MEDIA_NETWORK_FAULTS=1`.
It refuses the host network namespace, drops only the selected publisher port tuple,
and removes the rule in finally. Do not enable this flag outside the dedicated Linux
namespace; macOS does not run it. Linux run 36226258315 passed all seven cases; this does not
cover long-outage detection or physical Wi-Fi recovery.
Run 36227091966 subsequently passed eight cases, including independent uplink and
downlink UDP loss/restoration. Redacted local addresses are corroborated with the
actual namespace UDP socket and kernel route; missing/mismatched evidence fails closed.
CI runs all eight cases three times with zero retries. Browser stats can hide remote
addresses too: the fixture correlates the native selected ICE transport pair by
ports and protocol rather than substituting a configured address. Empty evidence fails.
Historical single-run passes do not establish stability; see the dated evidence for
later failures and current results. Local Mac interface selection can also cause
initial ICE failure; do not change the user's VPN or treat that failure as a PASS.

Stop-during-recovery observes five seconds after Idle for stale Active transitions;
it is a bounded regression check, not proof against arbitrarily late events.
Injected signaling faults can produce SDK disconnect/leave/error logs. Preserve
unexpected errors for diagnosis; a passing assertion is not a zero-error-log claim.

Evidence: `verification/2026-09-26-b5-local-media.md` at the repository root.
Keep the mandatory release verification plan updated after each iteration.
