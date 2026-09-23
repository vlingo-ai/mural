# English Gate 7 browser timing diagnostic — 2026-09-23

Status: **deployed to staging; one bounded English live observation made, but timing acceptance and Gate 7 remain open**.
Deployment and rollback evidence is in
[the rollout record](2026-09-23-english-timing-rollout.md).

The Web diagnostic is off by default. On the staging hostname only, adding `?timing=1` exposes
an in-memory panel; local development also permits it. Opening the panel does not create a room
or call a provider. The normal Web UI, API requests, credentials, and server behavior are unchanged.

The panel records only event names and relative milliseconds from the browser's
`performance.now()` clock. The analyser uses transient audio frame buffers, clears them on
detach, and never persists or uploads them. Transcript text, account data, room metadata,
credentials, and wall-clock timestamps are not recorded. Its JSON report has no session ID; the
operator must correlate a bounded test manually with the separately held opaque Mural session ID.

## Measurement definitions

- `firstAudioMs`: Start click to two consecutive above-threshold Agent audio-energy samples while
  the page's audio element is playing and the diagnostic audio context is running. Merely
  subscribing to a LiveKit track does not satisfy this metric.
- `recoveries[*].offlineToDetectionMs`: browser `offline` event to the first recovery signal, when
  both exist. Physical Wi-Fi cutoff to browser `offline` is **not** measured.
- `recoveries[*].mediaReadyMs`: first recovery signal to LiveKit connected with Agent audio and
  microphone publications ready. `firstAudibleMs` extends that interval to the first post-recovery
  above-threshold playback candidate. Missing signals remain `null`, not zero.
- `interruptions[*].latencyMs`: local processed microphone energy onset while Agent audio is
  active to the first sustained drop of remote audio energy. This is a **barge-in candidate**,
  not proof that the user spoke intentionally or that the provider handled the interruption.

The opt-in analyser samples at 40 ms. Two consecutive samples above RMS 0.012 establish an
audio onset; three quiet remote samples establish a stop. It connects a zero-gain analyser path
alongside the existing audio element and never changes the element's output route. Microphone
echo, noise, volume, browser autoplay restrictions, or AudioContext suspension can invalidate a
candidate; `audio-probe-unavailable` and `null` measurements must be reported rather than
filled in. Validate the thresholds with headphones and a manually timed reference before using
numbers as acceptance evidence. Worker `RealtimeModelMetrics.ttft` remains a separate clock and
must not be subtracted directly from browser timestamps.

## Local verification and remaining work

The pure recorder tests cover silence/playback gating, Wi-Fi-detection versus recovery intervals,
barge-in candidate pairing, incomplete recovery, first audio after recovery, reset between
sessions, and analyser cleanup. The LiveKit lifecycle test checks media-ready/recovery event
emission. All 34 Web unit tests, TypeScript/build, and both non-billable Playwright flows passed.
No live room, provider request, or paid timing sample was made for this implementation.

The change was merged, an encrypted backup was checked off-server, only Edge was deployed, and
the public staging page was verified with and without the query flag. Before a bounded English
live measurement, recheck the account's remaining
minute allowance, external OpenAI spend, LiveKit usage, and absence of other active sessions.
Collect multiple labeled English samples and report count, median, worst observed, failures,
concurrent VPS CPU/RSS, Cloud participant/byte usage, and billed duration. Do not label this
local instrumentation as a completed latency acceptance test.

## First bounded English observation (2026-09-23)

After the preflight, the operator used the opt-in staging page for one 48-second English
conversation. The browser reported `firstAudioMs=15646` and `initial-media-ready` at 12134 ms.
The operator confirmed that first audible speech and captions worked. They did not manage to
interrupt the first Agent sentence, but interrupted the second while it was playing; the Agent
understood the request and replied more slowly. This is a **manual functional interruption pass**,
not a measured interruption-latency result: the diagnostic's `interruptions` array was empty.
The test used a speaker rather than headphones. The recorder requires a new processed-microphone
energy onset while remote audio is loud; speaker echo or threshold/gating may prevent that
candidate, but the cause has not been established. Do not infer from the empty array that the
operator's interruption failed, and do not invent a latency value. Recheck detection quality
without a billable provider call before using this metric for acceptance.

The first Mural session closed `user_requested`, observed/charged 48,000 ms with final provider
usage. An operator-side button race then unintentionally opened a second session; it was stopped
after about one second and incurred the 15,000 ms minimum charge, with final provider usage.
Both reservations were released. After both, the Mural allowance was 116,000 ms remaining with
zero reserved, and no session was active. The 24-hour LiveKit project aggregate increased from
103 to 105 participant minutes, 6.82 to 7.50 MB ingress, 5.84 to 6.48 MB egress, and 18 to 20
rooms. These are project aggregates, not per-session media measurements. Two idle VPS snapshots
during the test showed 92–93% CPU idle and about 2.2 GB memory available; they are not peaks.
No median/worst latency or error rate can be inferred from this single observation. Recheck the
external OpenAI spend and all budgets before any further paid run.

## Non-billable local calibration before another live sample

The deterministic recorder test now covers the speaker-bleed case: if processed microphone energy
is already continuously above the threshold while remote audio plays, later speech produces no new
onset candidate even though an actual provider interruption may succeed. This establishes a known
measurement limitation, not the cause of the operator's particular missing candidate.

[`local-audio-calibration.html`](local-audio-calibration.html) is a self-contained, local-only
page for checking the current Mac microphone/speaker path. Open the page locally and follow its
three phases: silence, synthetic tone while silent, then speaking over the tone. It requests only
local microphone permission, generates a moderate-level tone,
computes transient 40 ms RMS values with the same 0.012 threshold, and reports whether a local
onset candidate occurred during playback. It makes no Mural, LiveKit, or OpenAI request, and does
not record, persist, or upload audio. The tone is not a substitute for real Agent speech; a passing
local calibration does not prove the live timing metric valid. Keep the paid test paused until the
calibration result is reviewed and external spend is rechecked.

The first local run used the Mac mini speaker but the operator heard no test tone. The page reported
62 quiet, 100 tone-only, and 125 tone-plus-speech 40 ms samples; every local sample was below the
current 0.012 threshold. Quiet local RMS peaked at 0.0016, tone-only at 0.0003, and the speech
phase at 0.0072. Consequently it produced zero onset candidates. This supports a **too-high fixed
microphone threshold in this local setup** as a plausible reason for a missed candidate, but it
does not validate speaker echo behavior because audible tone playback was unconfirmed. The page
now uses a more audible test level and reports generated-tone energy plus candidate counts for
several local thresholds. Do not alter the production threshold based on this one unvalidated
run or claim a calibrated interruption latency.

The second local run had audible test output on the Mac mini speaker and a running AudioContext.
The generated tone was above the remote threshold in 99% of tone-only samples. While only the
speaker played, processed microphone energy remained below 0.012 (P95 0.0002, peak 0.0065).
During the operator's speech over the tone, 38% of local samples crossed 0.012 (P95 0.0957,
peak 0.136), and the local checker found two onset candidates at the current threshold. The
lower thresholds tested also produced two candidates, so lowering 0.012 is **not justified** by
this valid local run. This supersedes the threshold concern inferred from the first inaudible
run. It also means speaker bleed did not hold the local signal continuously high under this
synthetic tone. Real Agent speech and the timing of the operator's utterance differ; the live
missing-candidate cause remains unknown. Do not change the deployed threshold or mark
interruption-latency acceptance complete on this basis.

A second deterministic test confirms another measurement gap: when the operator's speech starts
after three quiet remote frames (a roughly 120 ms audio gap), the recorder does not classify it
as an interruption even if the preceding Agent sentence was playing. The live report does not
contain enough local/remote energy-state timestamps to distinguish this from a threshold miss.
Future instrumentation should log only aggregate onset/gating event times, not audio, and be
validated locally before consuming another paid live sample.

The follow-up Web diagnostic implementation now adds relative `local-energy-onset`,
`remote-energy-onset`, and `remote-energy-silence` events. They distinguish a missing local
threshold crossing from a local onset during a remote-audio gap without changing the existing
barge-in latency definition. These are energy transitions, not speech recognition or proof of
audible playback. At most 120 such events per session are retained, with additional space reserved
for other events, so energy transitions cannot crowd
out close/failure events; raw samples still are not persisted or uploaded. This change must pass
Web checks and a staged rollout before any live observation can use it. The first live report
cannot be retroactively completed from the new events.
