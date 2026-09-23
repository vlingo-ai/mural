import { describe, expect, it, vi } from 'vitest';
import { AudioEnergyProbe, TimingRecorder } from './timing-diagnostic';

describe('opt-in browser timing recorder', () => {
  it('uses only relative time and waits for playable non-silent Agent audio', () => {
    let now = 1_000;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    now = 1_050;
    recorder.mark('initial-media-ready');
    recorder.sampleAudio(0, 0.05, false);
    recorder.sampleAudio(0, 0.05, true);
    expect(recorder.report().firstAudioMs).toBeNull();
    now = 1_120;
    recorder.sampleAudio(0, 0.05, true);
    expect(recorder.report().firstAudioMs).toBe(120);
    expect(recorder.report().events).toEqual([
      { kind: 'start-click', ms: 0 }, { kind: 'initial-media-ready', ms: 50 },
      { kind: 'remote-energy-onset', ms: 120 },
      { kind: 'first-audio', ms: 120 },
    ]);
  });

  it('separates browser-offline detection delay from media and audible recovery', () => {
    let now = 0;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    recorder.sampleAudio(0, 0.03, true);
    recorder.sampleAudio(0, 0.03, true);
    now = 100;
    recorder.mark('browser-offline');
    now = 160;
    recorder.mark('recovery-detected');
    now = 1_000;
    recorder.mark('browser-online');
    now = 1_400;
    recorder.mark('recovery-media-ready');
    recorder.sampleAudio(0, 0.03, true);
    now = 1_500;
    recorder.sampleAudio(0, 0.03, true);
    expect(recorder.report().recoveries).toEqual([{ detectedAtMs: 160,
      offlineToDetectionMs: 60, mediaReadyMs: 1_240, firstAudibleMs: 1_340 }]);
  });

  it('records a barge-in candidate only when local speech begins over Agent audio', () => {
    let now = 0;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    recorder.sampleAudio(0.03, 0, true);
    recorder.sampleAudio(0.03, 0, true);
    expect(recorder.report().interruptions).toEqual([]);
    recorder.sampleAudio(0, 0.03, true);
    recorder.sampleAudio(0, 0.03, true);
    for (let sample = 0; sample < 4; sample++) recorder.sampleAudio(0, 0.03, true);
    now = 200;
    recorder.sampleAudio(0.03, 0.03, true);
    recorder.sampleAudio(0.03, 0.03, true);
    now = 320;
    recorder.sampleAudio(0.03, 0, true);
    recorder.sampleAudio(0.03, 0, true);
    recorder.sampleAudio(0.03, 0, true);
    expect(recorder.report().interruptions).toEqual([{ onsetAtMs: 200,
      remoteStoppedMs: 320, latencyMs: 120 }]);
    expect(recorder.report().events.map(event => event.kind)).toContain('local-energy-onset');
    expect(recorder.report().events.map(event => event.kind)).toContain('remote-energy-silence');
  });

  it('cannot identify a new speech onset when speaker bleed keeps the local channel loud', () => {
    let now = 0;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    for (let sample = 0; sample < 5; sample++) recorder.sampleAudio(0.03, 0.03, true);
    now = 200;
    for (let sample = 0; sample < 5; sample++) recorder.sampleAudio(0.08, 0.03, true);
    now = 400;
    for (let sample = 0; sample < 3; sample++) recorder.sampleAudio(0.03, 0, true);
    expect(recorder.report().firstAudioMs).toBe(0);
    expect(recorder.report().interruptions).toEqual([]);
    expect(recorder.report().events.filter(event => event.kind === 'local-energy-onset')).toHaveLength(1);
  });

  it('caps energy events without losing a later session-close event', () => {
    const recorder = new TimingRecorder(() => 0);
    recorder.start();
    for (let segment = 0; segment < 70; segment++) {
      recorder.sampleAudio(0, 0.03, true);
      recorder.sampleAudio(0, 0.03, true);
      for (let quiet = 0; quiet < 3; quiet++) recorder.sampleAudio(0, 0, true);
    }
    recorder.mark('closed');
    expect(recorder.report().events.filter(event => event.kind.startsWith('remote-energy'))).toHaveLength(120);
    expect(recorder.report().events.at(-1)?.kind).toBe('closed');
  });

  it('does not label speech beginning in a remote-audio gap as an interruption candidate', () => {
    const recorder = new TimingRecorder(() => 0);
    recorder.start();
    for (let sample = 0; sample < 4; sample++) recorder.sampleAudio(0, 0.03, true);
    for (let sample = 0; sample < 3; sample++) recorder.sampleAudio(0, 0, true);
    recorder.sampleAudio(0.05, 0, true);
    recorder.sampleAudio(0.05, 0, true);
    expect(recorder.report().firstAudioMs).toBe(0);
    expect(recorder.report().interruptions).toEqual([]);
    expect(recorder.report().events.map(event => event.kind)).toEqual([
      'start-click', 'remote-energy-onset', 'first-audio', 'remote-energy-silence',
      'local-energy-onset',
    ]);
  });

  it('resets evidence between sessions and leaves incomplete recoveries visibly incomplete', () => {
    let now = 500;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    now = 700;
    recorder.mark('recovery-detected');
    expect(recorder.report().recoveries[0]).toMatchObject({ mediaReadyMs: null, firstAudibleMs: null });
    now = 900;
    recorder.start();
    expect(recorder.report().events).toEqual([{ kind: 'start-click', ms: 0 }]);
    expect(recorder.report().recoveries).toEqual([]);
  });

  it('counts first-ever audio after recovery for both first-audio and recovery timing', () => {
    let now = 0;
    const recorder = new TimingRecorder(() => now);
    recorder.start();
    now = 100;
    recorder.mark('browser-offline');
    now = 120;
    recorder.mark('recovery-detected');
    now = 200;
    recorder.mark('recovery-media-ready');
    now = 240;
    recorder.sampleAudio(0, 0.03, true);
    recorder.sampleAudio(0, 0.03, true);
    expect(recorder.report().firstAudioMs).toBe(240);
    expect(recorder.report().recoveries[0]).toEqual({ detectedAtMs: 120,
      offlineToDetectionMs: 20, mediaReadyMs: 80, firstAudibleMs: 120 });
    now = 400;
    recorder.mark('recovery-detected');
    expect(recorder.report().recoveries[1]?.offlineToDetectionMs).toBeNull();
  });

  it('disconnects its silent analyser graph and timer after a session', async () => {
    vi.useFakeTimers();
    const close = vi.fn().mockResolvedValue(undefined), disconnect = vi.fn();
    class FakeAudioContext {
      state = 'running';
      destination = {};
      createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect }; }
      createMediaStreamSource() { return { connect: vi.fn(), disconnect }; }
      createAnalyser() { return { fftSize: 512, connect: vi.fn(), disconnect,
        getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.03) }; }
      resume() { return Promise.resolve(); }
      close() { return close(); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const recorder = new TimingRecorder(() => Date.now());
      const probe = new AudioEnergyProbe(recorder);
      recorder.start();
      probe.start({ paused: false, muted: false, volume: 1, readyState: 2 } as HTMLAudioElement);
      probe.attachRemote({ getAudioTracks: () => [{}] } as unknown as MediaStream);
      await vi.advanceTimersByTimeAsync(80);
      expect(recorder.report().firstAudioMs).not.toBeNull();
      const count = recorder.report().events.length;
      probe.stop();
      await vi.advanceTimersByTimeAsync(120);
      expect(recorder.report().events).toHaveLength(count);
      expect(disconnect).toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
