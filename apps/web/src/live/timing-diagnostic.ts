// Opt-in staging diagnostics: relative browser timestamps and audio energy only.
// Analyser frames are transient and cleared on detach; nothing is persisted or uploaded.
export type TimingKind = 'start-click' | 'initial-media-ready' | 'first-audio' |
  'browser-offline' | 'browser-online' | 'recovery-detected' | 'recovery-media-ready' |
  'post-recovery-audio' | 'speech-onset-candidate' | 'remote-silence-after-onset' |
  'failed' | 'stop-requested' | 'closed' | 'audio-probe-unavailable';

type TimingEvent = { kind: TimingKind; ms: number };
type Recovery = { detectedAtMs: number; offlineToDetectionMs: number | null;
  mediaReadyMs: number | null; firstAudibleMs: number | null };
type Interruption = { onsetAtMs: number; remoteStoppedMs: number | null;
  latencyMs: number | null };

export type TimingReport = { version: 1; firstAudioMs: number | null;
  recoveries: Recovery[]; interruptions: Interruption[]; events: TimingEvent[];
  note: string };

const RMS_THRESHOLD = 0.012;

export class TimingRecorder {
  private startAt?: number;
  private events: TimingEvent[] = [];
  private firstAudio = false;
  private waitingForRecoveryAudio = false;
  private interruptionPending = false;
  private remoteLoud = false;
  private localLoud = false;
  private remoteAbove = 0;
  private remoteBelow = 0;
  private localAbove = 0;
  private localBelow = 0;

  constructor(private readonly now: () => number = () => performance.now(),
    private readonly onChange: (report: TimingReport) => void = () => {}) {}

  start(): void {
    this.startAt = this.now();
    this.events = [];
    this.firstAudio = false;
    this.waitingForRecoveryAudio = false;
    this.interruptionPending = false;
    this.resetLevels();
    this.mark('start-click');
  }

  mark(kind: TimingKind): void {
    if (this.startAt === undefined || this.events.length >= 200) return;
    if (kind === 'recovery-detected') {
      this.interruptionPending = false;
      this.waitingForRecoveryAudio = false;
      this.resetLevels();
    }
    if (kind === 'recovery-media-ready') {
      this.waitingForRecoveryAudio = true;
      this.resetLevels();
    }
    this.events.push({ kind, ms: Math.max(0, Math.round(this.now() - this.startAt)) });
    this.onChange(this.report());
  }

  // Two above-threshold samples establish speech; three quiet samples establish its end.
  // This is a candidate timing signal, not a transcript or proof of intentional barge-in.
  sampleAudio(localRms: number, remoteRms: number, remotePlayable: boolean): void {
    if (this.startAt === undefined) return;
    const localAbove = Number.isFinite(localRms) && localRms >= RMS_THRESHOLD;
    const remoteAbove = remotePlayable && Number.isFinite(remoteRms) && remoteRms >= RMS_THRESHOLD;
    this.localAbove = localAbove ? this.localAbove + 1 : 0;
    this.localBelow = localAbove ? 0 : this.localBelow + 1;
    this.remoteAbove = remoteAbove ? this.remoteAbove + 1 : 0;
    this.remoteBelow = remoteAbove ? 0 : this.remoteBelow + 1;

    if (!this.localLoud && this.localAbove >= 2) {
      this.localLoud = true;
      if (this.remoteLoud && !this.interruptionPending) {
        this.interruptionPending = true;
        this.mark('speech-onset-candidate');
      }
    } else if (this.localLoud && this.localBelow >= 4) this.localLoud = false;

    if (!this.remoteLoud && this.remoteAbove >= 2) {
      this.remoteLoud = true;
      if (!this.firstAudio) {
        this.firstAudio = true;
        this.mark('first-audio');
      }
      if (this.waitingForRecoveryAudio) {
        this.waitingForRecoveryAudio = false;
        this.mark('post-recovery-audio');
      }
    } else if (this.remoteLoud && this.remoteBelow >= 3) {
      this.remoteLoud = false;
      if (this.interruptionPending) {
        this.interruptionPending = false;
        this.mark('remote-silence-after-onset');
      }
    }
  }

  report(): TimingReport {
    const recoveries: Recovery[] = [], interruptions: Interruption[] = [];
    let offlineAt: number | undefined;
    for (const event of this.events) {
      if (event.kind === 'browser-offline') offlineAt = event.ms;
      if (event.kind === 'recovery-detected') {
        recoveries.push({ detectedAtMs: event.ms,
          offlineToDetectionMs: offlineAt === undefined ? null : event.ms - offlineAt,
          mediaReadyMs: null, firstAudibleMs: null });
        offlineAt = undefined;
      }
      if (event.kind === 'recovery-media-ready') {
        const current = recoveries.at(-1);
        if (current && current.mediaReadyMs === null) current.mediaReadyMs = event.ms - current.detectedAtMs;
      }
      if (event.kind === 'post-recovery-audio') {
        const current = recoveries.at(-1);
        if (current && current.firstAudibleMs === null) current.firstAudibleMs = event.ms - current.detectedAtMs;
      }
      if (event.kind === 'speech-onset-candidate') interruptions.push({ onsetAtMs: event.ms,
        remoteStoppedMs: null, latencyMs: null });
      if (event.kind === 'remote-silence-after-onset') {
        const current = interruptions.at(-1);
        if (current && current.remoteStoppedMs === null) {
          current.remoteStoppedMs = event.ms;
          current.latencyMs = event.ms - current.onsetAtMs;
        }
      }
    }
    return { version: 1, firstAudioMs: this.events.find(event => event.kind === 'first-audio')?.ms ?? null,
      recoveries, interruptions, events: [...this.events],
      note: 'Browser-relative candidate measurements; energy thresholds and playback require manual validation.' };
  }

  private resetLevels(): void {
    this.remoteLoud = this.localLoud = false;
    this.remoteAbove = this.remoteBelow = this.localAbove = this.localBelow = 0;
  }
}

type AudioInput = { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> };

export class AudioEnergyProbe {
  private context?: AudioContext;
  private sink?: GainNode;
  private local?: AudioInput;
  private remote?: AudioInput;
  private timer?: number;
  private audio?: HTMLAudioElement;

  constructor(private readonly recorder: TimingRecorder) {}

  start(audio: HTMLAudioElement | null): void {
    this.stop();
    this.audio = audio ?? undefined;
    if (!audio || typeof AudioContext === 'undefined') {
      this.recorder.mark('audio-probe-unavailable');
      return;
    }
    try {
      this.context = new AudioContext();
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.sink.connect(this.context.destination);
      void this.context.resume().catch(() => this.recorder.mark('audio-probe-unavailable'));
      this.timer = globalThis.setInterval(() => {
        const playable = this.context?.state === 'running' && !audio.paused && !audio.muted &&
          audio.volume > 0 && audio.readyState >= 2;
        this.recorder.sampleAudio(this.rms(this.local), this.rms(this.remote), Boolean(playable));
      }, 40);
    } catch {
      this.stop();
      this.recorder.mark('audio-probe-unavailable');
    }
  }

  attachLocal(stream: MediaStream): void { this.local = this.attach(this.local, stream); }
  attachRemote(stream: MediaStream): void { this.remote = this.attach(this.remote, stream); }

  stop(): void {
    if (this.timer !== undefined) globalThis.clearInterval(this.timer);
    this.timer = undefined;
    for (const input of [this.local, this.remote]) {
      input?.source.disconnect(); input?.analyser.disconnect(); input?.samples.fill(0);
    }
    this.local = this.remote = undefined;
    this.sink?.disconnect();
    this.sink = undefined;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.audio = undefined;
  }

  private attach(previous: AudioInput | undefined, stream: MediaStream): AudioInput | undefined {
    previous?.source.disconnect();
    previous?.analyser.disconnect();
    previous?.samples.fill(0);
    if (!this.context || !this.sink || stream.getAudioTracks().length === 0) return undefined;
    try {
      const source = this.context.createMediaStreamSource(stream), analyser = this.context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyser.connect(this.sink);
      return { source, analyser, samples: new Float32Array(analyser.fftSize) };
    } catch {
      this.recorder.mark('audio-probe-unavailable');
      return undefined;
    }
  }

  private rms(input: AudioInput | undefined): number {
    if (!input) return 0;
    input.analyser.getFloatTimeDomainData(input.samples);
    let total = 0;
    for (const sample of input.samples) total += sample * sample;
    return Math.sqrt(total / input.samples.length);
  }
}
