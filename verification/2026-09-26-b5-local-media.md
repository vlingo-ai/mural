# B5 local media harness — first implementation, not accepted

Base: `a9a74c8`. Worktree: sibling `mural-b5-local-media`, branch `codex/b5-local-media`.
No production code, VPS deployment, Cloud room or model call was made.

Implemented a separate Playwright configuration, two real livekit-client browser peers,
synthetic Web Audio source and remote RMS assertions in both directions, followed by
disconnect/track-ended assertions. This first fixture is a transport baseline, NOT the
Mural LiveConnection adapter, real Worker or a completed B5 acceptance suite.

Environment: local LiveKit Server 1.13.7, locked SDK 2.22.3, Chrome headless 153.
Locked npm installation passed (119 audited packages, zero reported vulnerabilities).
Local Vite/LiveKit ports are 15173/17880/17881/17882, no reuse of existing server.
Synthetic dev credentials only; no production environment is loaded. HTTP/WebSocket
requests outside loopback are aborted; this alone does not block raw WebRTC/STUN traffic.

First run was intentionally interrupted after external server-reflexive ICE candidates
revealed default STUN behavior. No claim of fully isolated network operation for that run.
Updated fixture explicitly supplies empty ICE servers, local server STUN list and an
explicit loopback node address, and suppresses verbose signaling logs.
Second run: FAIL, `could not establish pc connection` at the first peer connect (15.6s).
No remote-media or Stop assertion was reached; server startup is not media success.
Playwright-managed local processes shut down after execution; no staging resources changed.

Next: diagnose loopback ICE/Chromium routing using sanitized connection-state evidence;
prove selected candidate endpoints are local, then add Mural LiveConnection integration,
media/signaling fault isolation, recovery/new audio and Stop races. Browser request routing
must not be represented as a complete OS-level egress firewall. CI integration remains planned.
No deployment required for this test-only work; B5 remains incomplete and uncommitted.

## Second iteration: real transport baseline passing

Local server verbose help exposed `rtc.enable_loopback_candidate` (default false).
Enabling it resolved peer connection establishment without opening a non-loopback listener.
The next run reached connected/subscribed but failed remote RMS. Attaching and starting a
muted remote audio element made the real decoded stream available to Web Audio; no sound
is emitted to the user's speakers. Baseline then passed once.

Stricter RTP/energy assertions initially failed 3/3: Chrome reported inbound totalAudioEnergy
zero even with nonzero remote analyser RMS. Kept RTP packet/byte assertions and independent
decoded RMS, rather than treating that browser statistic as the only media oracle.
Added selected remote ICE candidate loopback assertion, plus a negative control: mute the
other peer's source, require receiver RMS below 0.001, restore and require above 0.01.
Final expanded suite: **3/3 repeated runs PASS**, zero retry, 7.6 seconds total.
Earlier intermediate repetition 3/3 and Web TypeScript check also PASS.
Each test checks both directions, positive RTP traffic, decoded energy, selected loopback
remote candidates and disconnect/ended tracks. This proves synthetic transport, not human
audibility, physical microphone behavior or the Mural product recovery implementation.

Run from `apps/web`: `npm run test:media` (requires livekit-server on PATH and local Chrome;
CI browser installation is not yet wired). No runtime source changed; no deployment needed.
The route guard and empty ICE server configuration are not an OS-level network sandbox.
Full Mural adapter/fault recovery integration and CI remain the next B5 tasks.

## Third iteration: actual Mural adapter and signaling recovery

Added `product.html`, importing the unchanged production `LiveConnection` adapter.
The microphone is a synthetic MediaStream, the peer is a real SDK audio publisher,
and admission/status/close/history methods are test doubles, not the API or database.
A test-only native RTCPeerConnection subclass supplies an empty ICE server list;
the peer connection itself remains real. No production credentials are loaded.

Three cases now cover raw transport, product connection/repeated Stop, and product
WebSocket signaling interruption. The last case observes Connecting then Active,
checks fresh downstream silence/tone transitions and continuing upstream energy,
and asserts one admission, one close and ended microphone tracks after repeated Stop.
Initial run: **3/3 PASS**. Repeated suite: **9/9 PASS**, zero retries, 22.2 seconds.
`npm run check`: PASS. No production code, deployment or paid calls were needed.

Reusable rule: recovery must prove media as well as state transitions and admission/
close counts. These counts prove adapter calls only, not server billing idempotency.
The signaling fault is not a physical Wi-Fi outage or an independent UDP media fault.
Human audibility, Worker/provider lifecycle, history persistence, Stop-during-recovery,
independent uplink/downlink failure and CI network isolation remain outside this result.
B5 remains incomplete; this is local implementation/testing, not live acceptance.

## Fourth iteration: Stop at recovery entry

The fixture arms repeated Stop on the next Connecting callback, using a microtask
to avoid re-entering the state callback synchronously. A real signaling disconnect
then triggers the production adapter's recovery path. Assertions require Idle,
one admission/close call and ended microphone tracks, with no later Active state
over a five-second observation window. This covers recovery-entry cancellation,
not every possible late status response or Room-replacement race.

Four scenarios repeated three times: **12/12 PASS**, zero retries, 40.0 seconds.
Web TypeScript check: PASS. SDK logs include aborted reconnect, leave-before-connected
and websocket establishment errors during intentional cancellation; no claim of
zero error logs. Added a local execution README with dependencies and test boundaries.
Reusable STOP-01 rule: retain a bounded post-Idle observation, not just an immediate
Idle assertion; distinguish adapter close counts from real server idempotency.
No runtime source changes, deployment or paid calls. Independent media faults and
CI isolation remain pending; B5 is not complete.

## Fifth iteration: independent sender-source loss

Added shared test-only native PeerConnection instrumentation and two cases using
`RTCRtpSender.replaceTrack(null)` on the learner or synthetic agent independently.
Each case verifies receiver RMS falls below 0.001, the opposite direction follows
fresh silence/tone transitions, and reattaching the original sender track restores
RMS above 0.01. Product state remains Active while transport is healthy; admission
and close counts remain one. This is source detachment, NOT packet-loss/ICE failure.

Six scenarios repeated three times: **18/18 PASS**, zero retries, 51.2 seconds.
Web TypeScript check: PASS. No runtime changes, deployment or paid calls.
Reusable MEDIA-01 distinction: source loss/silence and network transport loss need
different assertions; absence of energy must not alone trigger a failed connection.
Execution README documents this boundary. Actual isolated network fault injection,
Worker/control API integration and CI execution remain pending.
Reviewed existing Checks workflow: the scoped Web job is the intended integration
point; no workflow edits or CI executions were made in this iteration.

## Sixth iteration: scoped Web CI wiring (Linux execution pending)

Added media tests to the existing scoped Web job, preserving the checks-gate
dependency and native platform scope. LiveKit Linux amd64 1.13.7 is pinned to
SHA-256 `6634aeeb2fb1366b6723708ae4320b9d5408106a4c63457c5e845ae3979c90e2`,
verified against the official GitHub release asset metadata. Installation precedes
network isolation. A dedicated `unshare --net` subprocess enables only loopback,
then runs tests as the ordinary runner user; failure to isolate fails the job.
The parent runner network is unchanged. No secrets or provider keys are supplied.
Web job timeout increases from 10 to 15 minutes; no native build is added.

Initial full unit run: FAIL because Vitest collected the Playwright media spec;
74 unit tests passed but one suite failed at collection. Fixed test-only discovery
by preserving Vitest default exclusions and adding `media-tests/**`.
Rerun: **74/74 unit tests PASS**, TypeScript PASS, production build PASS, workflow
YAML parse PASS and diff whitespace check PASS. Build retains a >500 kB chunk warning.
`actionlint` is not installed, so semantic actionlint validation was not performed.
No GitHub run has occurred; macOS cannot establish Linux namespace correctness.

Reusable release rule: adding a new test runner requires the existing unit/build
checks as well as the new suite; syntax-valid CI is not executed CI. Linux workflow
execution and network failure cases remain outstanding. No production runtime change
or deployment is needed for test discovery/CI configuration, and no paid calls occurred.

## Seventh iteration: first GitHub Linux execution failed

Candidate `90188ce`, [PR #49](https://github.com/vlingo-ai/mural/pull/49),
[Checks run](https://github.com/vlingo-ai/mural/actions/runs/36224843775).
Web unit/build/existing E2E and checksum-pinned LiveKit installation passed.
The namespace media step ran but **6/6 cases failed** at initial peer connection:
`could not establish pc connection`. Media/recovery assertions were not reached.
The local macOS 18/18 result does not establish Linux compatibility. Exact cause
within the loopback-only Linux/browser/server combination remains undiagnosed.
No isolation bypass, retries-to-green or merge was performed. Deployment configuration
and Docker build checks passed; these did not deploy anything to staging.

PR creation initially failed because gh's default repository resolved to upstream;
explicit `--repo vlingo-ai/mural` successfully targeted the user's fork. No upstream
PR was created. Future repository mutations must specify the intended fork explicitly.
Next: capture sanitized ICE gathering/candidate/pair diagnostics inside the namespace,
then validate a safe isolated topology before claiming B5 CI acceptance.

## Eighth iteration: Linux ICE diagnostics candidate

Added failure-only native peer state, candidate address/type/protocol and ICE error
code diagnostics. No SDP, token or ICE credentials are logged. TypeScript and diff
checks PASS. The failing isolated topology is unchanged so the next Linux run can
distinguish candidate gathering failure from media playback failure. Execution pending.

Diagnostic run 36225322469 (`1c22d06`): 6/6 failed again. The first peer reported
gathering state `gathering`, zero candidates and no candidate-error codes before
SDK cleanup closed the connection. This narrows the failure to candidate gathering,
not decoded audio. Candidate fix adds an unconnected dummy NIC with documentation
address 192.0.2.1/24 and default route to that dummy inside the network namespace.
There is no host veth or external uplink. The original runner network is unchanged.
This topology change is a hypothesis pending CI, not yet a verified repair.
