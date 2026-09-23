# English Gate 7 browser timing diagnostic — 2026-09-23

Status: **implemented and tested locally; not deployed or measured live**.

The Web diagnostic is off by default. On the staging hostname only, adding `?timing=1` exposes
an in-memory panel; local development also permits it. Opening the panel does not create a room
or call a provider. The normal Web UI, API requests, credentials, and server behavior are unchanged.

The panel records only event names and relative milliseconds from the browser's
`performance.now()` clock. It never retains or uploads raw audio, transcript text, account data,
room metadata, credentials, or wall-clock timestamps. Its JSON report has no session ID; the
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

Next: review and merge the change, check active sessions and take a fresh encrypted backup,
deploy only the Edge image, then verify the diagnostic stays hidden without the query flag and
appears with it. Before a bounded English live measurement, recheck the account's remaining
minute allowance, external OpenAI spend, LiveKit usage, and absence of other active sessions.
Collect multiple labeled English samples and report count, median, worst observed, failures,
concurrent VPS CPU/RSS, Cloud participant/byte usage, and billed duration. Do not label this
local instrumentation as a completed latency acceptance test.
