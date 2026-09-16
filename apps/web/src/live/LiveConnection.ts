import type { TranscriptEvent } from '../api/contracts';
import { providerLocale, type AvailableLanguage } from '../api/contracts';
import type { MuralAPI } from '../api/mural';

export type LiveState = 'idle' | 'requesting-microphone' | 'connecting' | 'active' | 'closing' | 'failed';

export class LiveConnection {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private local?: MediaStream;
  private remote = new MediaStream();
  private closed = false;
  private sessionID?: string;
  private language?: AvailableLanguage;
  private context: Array<{ speaker: 'user' | 'assistant'; text: string }> = [];
  private historyWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly api: MuralAPI,
    private readonly onState: (state: LiveState) => void,
    private readonly onEvent: (event: TranscriptEvent | Record<string, unknown>) => void,
    private readonly onRemoteStream: (stream: MediaStream) => void,
    private readonly onSession: (sessionID: string | undefined) => void = () => {},
  ) {}

  async connect(language: AvailableLanguage, inputDeviceID?: string): Promise<void> {
    this.disconnect();
    this.closed = false;
    this.language = language;
    this.context = [];
    this.onState('requesting-microphone');
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceID ? { deviceId: { exact: inputDeviceID }, echoCancellation: true, noiseSuppression: true } :
          { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.closed) return;
      this.onState('connecting');
      const peer = new RTCPeerConnection();
      this.peer = peer;
      for (const track of this.local.getTracks()) peer.addTrack(track, this.local);
      peer.ontrack = ({ track }) => {
        this.remote.addTrack(track);
        this.onRemoteStream(this.remote);
      };
      peer.onconnectionstatechange = () => {
        if (!this.closed && ['failed', 'disconnected'].includes(peer.connectionState)) this.onState('failed');
      };
      const channel = peer.createDataChannel('oai-events', { ordered: true });
      this.channel = channel;
      channel.onopen = () => this.onState('connecting');
      channel.onmessage = ({ data }) => {
        if (typeof data !== 'string' || data.length > 262_144) return;
        try {
          const event = JSON.parse(data) as Record<string, unknown>;
          if (event.type === 'session.started') this.onState('active');
          if ((event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') &&
              typeof event.delta === 'string' && event.delta.length && event.delta.length <= 4_000) {
            const speaker = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
            const eventID = typeof event.event_id === 'string' ? event.event_id : crypto.randomUUID();
            this.addContext(speaker, event.delta);
            const transcript: TranscriptEvent = { type: 'session.transcript.appended', event_id: eventID,
              speaker, text: event.delta, source: 'live' };
            this.onEvent(transcript);
            if (this.sessionID) void this.persistEvent(this.sessionID, {
              eventID, speaker, text: event.delta, source: 'live',
            });
          }
          if (event.type === 'session.transcript.appended' &&
              (event.speaker === 'user' || event.speaker === 'assistant') && typeof event.text === 'string') {
            this.addContext(event.speaker, event.text);
          }
          if (typeof event.type === 'string') this.onEvent(event);
        } catch { /* Ignore malformed provider events. */ }
      };
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      await this.waitForICE(peer);
      if (!peer.localDescription?.sdp) throw new Error('No local SDP offer.');
      const result = await this.api.createLiveSession({
        sdp: peer.localDescription.sdp,
        language: providerLocale(language),
        requestedMilliseconds: 15 * 60_000,
      }, crypto.randomUUID());
      if (this.closed) return;
      this.sessionID = result.sessionID;
      this.onSession(result.sessionID);
      await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
      this.onEvent({ type: 'mural.session.created', session: { id: result.sessionID } });
    } catch (error) {
      this.disconnect();
      this.onState('failed');
      throw error;
    }
  }

  async sendText(text: string): Promise<boolean> {
    const clean = text.trim().slice(0, 2_000);
    if (!clean || this.channel?.readyState !== 'open' || !this.sessionID || !this.language) return false;
    const priorContext = this.context.slice(-10);
    const eventID = crypto.randomUUID();
    this.context.push({ speaker: 'user', text: clean });
    this.context = this.context.slice(-10);
    this.onEvent({ type: 'session.transcript.appended', event_id: eventID, speaker: 'user', text: clean, source: 'typed' });
    await this.persistEvent(this.sessionID, { eventID, speaker: 'user', text: clean, source: 'typed' });
    const result = await this.api.createModelTask<{ kind: 'teachingReply'; text: string }>({
      kind: 'teachingReply',
      funding: { type: 'liveSession', sessionID: this.sessionID },
      language: providerLocale(this.language),
      text: clean,
      context: priorContext,
    }, crypto.randomUUID());
    if (this.closed || this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify({ type: 'session.commentary.append', event_id: crypto.randomUUID(), content: result.text }));
    return true;
  }

  close(): void {
    this.onState('closing');
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ type: 'session.close', event_id: crypto.randomUUID() }));
    if (this.sessionID) void this.api.closeLiveSession(this.sessionID).catch(() => {});
    globalThis.setTimeout(() => this.disconnect(), 1_000);
  }

  disconnect(): void {
    this.closed = true;
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    this.local?.getTracks().forEach(track => track.stop());
    this.local = undefined;
    this.sessionID = undefined;
    this.onSession(undefined);
    this.language = undefined;
    this.context = [];
    this.remote.getTracks().forEach(track => this.remote.removeTrack(track));
    this.onState('idle');
  }

  private async waitForICE(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => reject(new Error('ICE gathering timed out.')), 10_000);
      const changed = () => {
        if (peer.iceGatheringState !== 'complete') return;
        globalThis.clearTimeout(timeout);
        peer.removeEventListener('icegatheringstatechange', changed);
        resolve();
      };
      peer.addEventListener('icegatheringstatechange', changed);
    });
  }

  private addContext(speaker: 'user' | 'assistant', text: string): void {
    const previous = this.context.at(-1);
    if (previous?.speaker === speaker && BufferlessLength(previous.text + text) <= 4_000) previous.text += text;
    else this.context.push({ speaker, text });
    this.context = this.context.slice(-10);
  }

  private persistEvent(sessionID: string, event: { eventID: string; speaker: 'user' | 'assistant'; text: string; source: 'live' | 'typed' }): Promise<void> {
    const write = this.historyWrite.then(() => this.api.appendConversationEvent(sessionID, event).then(() => {}));
    this.historyWrite = write.catch(() => this.onEvent({ type: 'mural.history.sync_failed' }));
    return write;
  }
}

const BufferlessLength = (text: string) => new TextEncoder().encode(text).byteLength;
