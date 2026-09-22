import type { TranscriptEvent } from '../api/contracts';
import { providerLocale, type AvailableLanguage } from '../api/contracts';
import type { MuralAPI } from '../api/mural';
import type { Room, TranscriptionSegment } from 'livekit-client';
import { observeBrowserOffline } from './browser-connectivity';
import { retryHistoryWrite } from './history-sync';
import { MuralReconnectPolicy } from './livekit-reconnect';
import { agentDisconnectIsTerminal, agentMediaIsReady } from './livekit-state';

export type LiveState = 'idle' | 'requesting-microphone' | 'connecting' | 'active' | 'closing' | 'failed';

export class LiveConnection {
  private peer?: RTCPeerConnection;
  private room?: Room;
  private channel?: RTCDataChannel;
  private local?: MediaStream;
  private remote = new MediaStream();
  private closed = false;
  private sessionID?: string;
  private language?: AvailableLanguage;
  private context: Array<{ speaker: 'user' | 'assistant'; text: string }> = [];
  private transcriptionText = new Map<string, string>();
  private historyWrite: Promise<void> = Promise.resolve();
  private liveKitReady = false;
  private liveKitReadyTimer?: number;
  private liveKitAgentIdentity?: string;
  private liveKitReconnecting = false;
  private liveKitRecovery?: Promise<void>;
  private stopObservingOffline?: () => void;

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
      const capabilities = await this.api.liveCapabilities();
      if (!capabilities.hostedMinutes) throw new Error('Hosted voice is not available.');
      if (capabilities.transport === 'livekit-room') await this.connectLiveKit(language);
      else await this.connectWebRTC(language);
    } catch (error) {
      this.disconnect();
      this.onState('failed');
      throw error;
    }
  }

  private async connectWebRTC(language: AvailableLanguage): Promise<void> {
      const local = this.local;
      if (!local) throw new Error('No local microphone stream.');
      const peer = new RTCPeerConnection();
      this.peer = peer;
      for (const track of local.getTracks()) peer.addTrack(track, local);
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
      if (result.transport.type !== 'webrtc') throw new Error('Mural returned an unexpected live transport.');
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
      this.onEvent({ type: 'mural.session.created', session: { id: result.sessionID } });
  }

  private async connectLiveKit(language: AvailableLanguage): Promise<void> {
    const { LocalAudioTrack, Room: LiveKitRoom, RoomEvent, Track } = await import('livekit-client');
    const result = await this.api.createLiveSession({ language: providerLocale(language),
      requestedMilliseconds: 15 * 60_000 }, crypto.randomUUID());
    if (result.transport.type !== 'livekit-room') throw new Error('Mural returned an unexpected live transport.');
    const transport = result.transport;
    const openRoom = async (): Promise<void> => {
      const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true,
        reconnectPolicy: new MuralReconnectPolicy() });
      this.room = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (this.room !== room || track.kind !== Track.Kind.Audio) return;
        this.liveKitAgentIdentity = participant.identity;
        this.markLiveKitActive();
        this.remote.addTrack(track.mediaStreamTrack);
        this.onRemoteStream(this.remote);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (this.room === room && track.kind === Track.Kind.Audio) this.remote.removeTrack(track.mediaStreamTrack);
      });
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        if (this.room !== room) return;
        if (participant?.isLocal === false) {
          this.liveKitAgentIdentity = participant.identity;
          this.markLiveKitActive();
        }
        this.receiveTranscriptions(segments, participant?.isLocal === true);
      });
      room.on(RoomEvent.ParticipantDisconnected, participant => {
        if (this.room === room && !this.closed && agentDisconnectIsTerminal(this.liveKitAgentIdentity,
          participant.identity, this.liveKitReconnecting)) this.failLiveKitAgent();
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (this.room === room && !this.closed) {
          this.liveKitReconnecting = true;
          this.liveKitReady = false;
          this.onState('connecting');
        }
      });
      room.on(RoomEvent.Reconnected, () => {
        if (this.room !== room || this.closed) return;
        this.liveKitReconnecting = false;
        if (agentMediaIsReady(this.liveKitAgentIdentity, room.remoteParticipants.values())) {
          this.liveKitReady = true;
          this.onState('active');
        } else {
          this.onState('connecting');
          this.armLiveKitReadyTimeout();
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (this.room === room && !this.closed) {
          this.liveKitReconnecting = false;
          this.onState('failed');
        }
      });
      await room.connect(transport.url, transport.token);
      if (this.closed || this.room !== room) { await room.disconnect(); return; }
      const track = this.local?.getAudioTracks()[0];
      if (!track) throw new Error('No local microphone track.');
      await room.localParticipant.publishTrack(new LocalAudioTrack(track), {
        source: Track.Source.Microphone,
      });
    };
    const recoverRoom = (): void => {
      if (this.closed || !this.liveKitReconnecting || this.liveKitRecovery) return;
      this.liveKitRecovery = (async () => {
        const previous = this.room;
        this.room = undefined;
        this.remote.getTracks().forEach(track => this.remote.removeTrack(track));
        await previous?.disconnect();
        await openRoom();
        if (!this.closed) this.armLiveKitReadyTimeout();
      })().catch(() => this.failLiveKitAgent()).finally(() => { this.liveKitRecovery = undefined; });
    };
    this.stopObservingOffline = observeBrowserOffline(() => {
      if (!this.closed) {
        this.liveKitReconnecting = true;
        this.liveKitReady = false;
        this.onState('connecting');
      }
    }, globalThis, recoverRoom);
    await openRoom();
    if (this.closed) return;
    this.sessionID = result.sessionID;
    this.onSession(result.sessionID);
    this.armLiveKitReadyTimeout();
    this.onEvent({ type: 'mural.session.created', session: { id: result.sessionID } });
  }

  private armLiveKitReadyTimeout(): void {
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    this.liveKitReadyTimer = globalThis.setTimeout(() => {
      if (!this.closed && !this.liveKitReady) {
        this.onState('failed');
        if (this.sessionID) void this.api.closeLiveSession(this.sessionID).catch(() => {});
        void this.room?.disconnect();
      }
    }, 20_000);
  }

  private markLiveKitActive(): void {
    if (this.closed || this.liveKitReady) return;
    this.liveKitReady = true;
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    this.liveKitReadyTimer = undefined;
    if (!this.liveKitReconnecting) this.onState('active');
  }

  private failLiveKitAgent(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopObservingOffline?.();
    this.stopObservingOffline = undefined;
    this.onEvent({ type: 'mural.live.agent_lost' });
    this.onState('failed');
    if (this.sessionID) void this.api.closeLiveSession(this.sessionID).catch(() => {});
    if (this.room) void this.room.disconnect();
    this.local?.getTracks().forEach(track => track.stop());
  }

  private receiveTranscriptions(segments: TranscriptionSegment[], local: boolean): void {
    for (const segment of segments) {
      if (!segment.text) continue;
      const speaker = local ? 'user' : 'assistant';
      const previous = this.transcriptionText.get(segment.id) ?? '';
      const delta = segment.text.startsWith(previous) ? segment.text.slice(previous.length) : segment.text;
      this.transcriptionText.set(segment.id, segment.text);
      if (delta) {
        this.addContext(speaker, delta);
        this.onEvent({ type: 'session.transcript.appended', event_id: segment.id,
          speaker, text: delta, source: 'live' });
      }
      if (segment.final && this.sessionID) void this.persistEvent(this.sessionID,
        { eventID: segment.id, speaker, text: segment.text, source: 'live' });
      if (segment.final) this.transcriptionText.delete(segment.id);
    }
  }

  async sendText(text: string): Promise<boolean> {
    const clean = text.trim().slice(0, 2_000);
    const livekit = this.room?.state === 'connected';
    if (!clean || (!livekit && this.channel?.readyState !== 'open') || !this.sessionID || !this.language) return false;
    const priorContext = this.context.slice(-10);
    const eventID = crypto.randomUUID();
    this.context.push({ speaker: 'user', text: clean });
    this.context = this.context.slice(-10);
    this.onEvent({ type: 'session.transcript.appended', event_id: eventID, speaker: 'user', text: clean, source: 'typed' });
    await this.persistEvent(this.sessionID, { eventID, speaker: 'user', text: clean, source: 'typed' });
    if (livekit) {
      await this.room!.localParticipant.sendText(clean, { topic: 'lk.chat' });
      return true;
    }
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
    // A user-requested disconnect is expected; suppress transport failure handlers while
    // the API close and local cleanup finish.
    this.closed = true;
    if (this.room) void this.room.disconnect();
    if (this.sessionID) void this.api.closeLiveSession(this.sessionID).catch(() => {});
    globalThis.setTimeout(() => this.disconnect(), 1_000);
  }

  disconnect(): void {
    this.closed = true;
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    if (this.room) void this.room.disconnect();
    this.room = undefined;
    this.local?.getTracks().forEach(track => track.stop());
    this.local = undefined;
    this.sessionID = undefined;
    this.onSession(undefined);
    this.language = undefined;
    this.context = [];
    this.transcriptionText.clear();
    this.liveKitReady = false;
    this.liveKitAgentIdentity = undefined;
    this.liveKitReconnecting = false;
    this.liveKitRecovery = undefined;
    this.stopObservingOffline?.();
    this.stopObservingOffline = undefined;
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    this.liveKitReadyTimer = undefined;
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
    const write = this.historyWrite.then(() => retryHistoryWrite(
      () => this.api.appendConversationEvent(sessionID, event).then(() => {}),
    ));
    this.historyWrite = write.catch(() => this.onEvent({ type: 'mural.history.sync_failed' }));
    return write;
  }
}

const BufferlessLength = (text: string) => new TextEncoder().encode(text).byteLength;
