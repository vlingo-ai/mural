import type { TranscriptEvent, LiveSessionResult } from '../api/contracts';
import { providerLocale, type AvailableLanguage } from '../api/contracts';
import type { MuralAPI } from '../api/mural';
import { MuralAPIError } from '../api/mural';
import type { Room, TranscriptionSegment } from 'livekit-client';
import { observeBrowserOffline } from './browser-connectivity';
import { retryHistoryWrite } from './history-sync';
import { MuralReconnectPolicy, MURAL_MEDIA_READY_MS, MURAL_RECOVERY_FALLBACK_MS,
  MURAL_RECOVERY_RETRY_MS, MURAL_RECOVERY_WINDOW_MS } from './livekit-reconnect';
import { agentDisconnectIsTerminal, agentMediaIsReady, microphoneIsReady } from './livekit-state';
import type { TimingKind } from './timing-diagnostic';
import { initialRecoveryState, reduceRecovery, type RecoveryState, type RecoveryUpdate } from './recovery-protocol';

export type LiveState = 'idle' | 'requesting-microphone' | 'connecting' | 'active' | 'closing' | 'failed';

export class LiveConnection {
  private peer?: RTCPeerConnection;
  private room?: Room;
  private channel?: RTCDataChannel;
  private local?: MediaStream;
  private remote = new MediaStream();
  private closed = false;
  private generation = 0;
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
  private liveKitRecoveryTimer?: number;
  private liveKitRecoveryDeadline?: number;
  private liveKitRecoveryUntil?: number;
  private liveKitAgentDepartureTimer?: number;
  private stopObservingOffline?: () => void;
  private closingRequest?: Promise<void>;
  private recoveryState?: RecoveryState;
  private controlTimer?: number;
  private pendingAdmission?: Promise<LiveSessionResult>;
  private closingAdmission?: Promise<LiveSessionResult>;
  private admissionUncertain = false;
  private admissionRequestID?: string;

  private reduceRecovery(update: RecoveryUpdate): void {
    if (!this.recoveryState) return;
    this.recoveryState = reduceRecovery(this.recoveryState, { ...update,
      generation: this.recoveryState.generation, roomEpoch: this.recoveryState.roomEpoch,
      at: performance.now() });
  }

  private protocolMediaReady(): boolean {
    this.reduceRecovery({ kind: 'signal', connected: true });
    this.reduceRecovery({ kind: 'media', microphone: true, agentAudio: true });
    if (this.recoveryState?.phase === 'failed') this.failLiveKitAgent('reconnect_failed');
    return this.recoveryState?.phase === 'active';
  }

  private clearControlTimer(): void {
    if (this.controlTimer !== undefined) globalThis.clearTimeout(this.controlTimer);
    this.controlTimer = undefined;
  }

  constructor(
    private readonly api: MuralAPI,
    private readonly onState: (state: LiveState) => void,
    private readonly onEvent: (event: TranscriptEvent | Record<string, unknown>) => void,
    private readonly onRemoteStream: (stream: MediaStream) => void,
    private readonly onSession: (sessionID: string | undefined) => void = () => {},
    private readonly onTiming: (kind: TimingKind) => void = () => {},
    private readonly onLocalStream: (stream: MediaStream) => void = () => {},
  ) {}

  async connect(language: AvailableLanguage, inputDeviceID?: string): Promise<void> {
    if (this.admissionUncertain) throw new Error('Previous session admission is unconfirmed. Retry closing first.');
    this.disconnect();
    this.closed = false;
    const generation = this.generation;
    this.language = language;
    this.context = [];
    this.onState('requesting-microphone');
    try {
      const local = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceID ? { deviceId: { exact: inputDeviceID }, echoCancellation: true, noiseSuppression: true } :
          { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.closed || generation !== this.generation) {
        local.getTracks().forEach(track => track.stop());
        return;
      }
      this.local = local;
      this.onLocalStream(this.local);
      this.onState('connecting');
      const capabilities = await this.api.liveCapabilities();
      if (!capabilities.hostedMinutes) throw new Error('Hosted voice is not available.');
      if (this.closed || generation !== this.generation) return;
      if (capabilities.transport === 'livekit-room') await this.connectLiveKit(language, generation);
      else await this.connectWebRTC(language, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.admissionUncertain) {
        this.close();
        throw error;
      }
      this.onTiming('failed');
      this.disconnect();
      this.onState('failed');
      throw error;
    }
  }

  private async connectWebRTC(language: AvailableLanguage, generation: number): Promise<void> {
      const current = () => !this.closed && generation === this.generation;
      const local = this.local;
      if (!local) throw new Error('No local microphone stream.');
      const peer = new RTCPeerConnection();
      this.peer = peer;
      for (const track of local.getTracks()) peer.addTrack(track, local);
      peer.ontrack = ({ track }) => {
        if (!current() || this.peer !== peer) return;
        this.remote.addTrack(track);
        this.onRemoteStream(this.remote);
      };
      peer.onconnectionstatechange = () => {
        if (current() && this.peer === peer && ['failed', 'disconnected'].includes(peer.connectionState)) this.onState('failed');
      };
      const channel = peer.createDataChannel('oai-events', { ordered: true });
      this.channel = channel;
      channel.onopen = () => { if (current() && this.channel === channel) this.onState('connecting'); };
      channel.onmessage = ({ data }) => {
        if (this.closed || this.channel !== channel) return;
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
      if (!current()) return;
      await peer.setLocalDescription(offer);
      if (!current()) return;
      await this.waitForICE(peer);
      if (!current()) return;
      if (!peer.localDescription?.sdp) throw new Error('No local SDP offer.');
      const result = await this.admit({
        sdp: peer.localDescription.sdp,
        language: providerLocale(language),
        requestedMilliseconds: 15 * 60_000,
      }, generation);
      if (!result || !current()) return;
      this.sessionID = result.sessionID;
      this.onSession(result.sessionID);
      if (result.transport.type !== 'webrtc') throw new Error('Mural returned an unexpected live transport.');
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
      if (!current()) return;
      this.onEvent({ type: 'mural.session.created', session: { id: result.sessionID } });
  }

  private async admit(input: Parameters<MuralAPI['createLiveSession']>[0], generation: number): Promise<LiveSessionResult | undefined> {
    const requestID = crypto.randomUUID();
    this.admissionRequestID = requestID;
    this.admissionUncertain = true;
    const admission = this.api.createLiveSession(input, requestID);
    this.pendingAdmission = admission;
    let result: LiveSessionResult;
    try { result = await admission; }
    finally { if (this.pendingAdmission === admission) this.pendingAdmission = undefined; }
    if (this.closed || generation !== this.generation) {
      if (this.closingAdmission !== admission) void this.api.closeLiveSession(result.sessionID).catch(() => {});
      return undefined;
    }
    this.admissionUncertain = false;
    return result;
  }

  private async connectLiveKit(language: AvailableLanguage, generation: number): Promise<void> {
    const { DisconnectReason, LocalAudioTrack, Room: LiveKitRoom, RoomEvent, Track } = await import('livekit-client');
    if (this.closed || generation !== this.generation) return;
    const requestedAt = performance.now();
    const requestedWallTime = Date.now();
    const result = await this.admit({ language: providerLocale(language), requestedMilliseconds: 15 * 60_000 }, generation);
    if (!result || this.closed || generation !== this.generation) return;
    this.sessionID = result.sessionID;
    this.onSession(result.sessionID);
    if (result.transport.type !== 'livekit-room') throw new Error('Mural returned an unexpected live transport.');
    const transport = result.transport;
    this.recoveryState = initialRecoveryState(generation);
    // Convert the existing product deadline once, never extend it on a reconnect.
    // Server/Worker remain the authority; the browser timer is an extra local bound.
    const controlUntil = requestedAt + Date.parse(result.deadline) - requestedWallTime;
    this.reduceRecovery({ kind: 'control', validUntil: controlUntil });
    if (this.recoveryState.phase === 'failed') {
      this.failLiveKitAgent('reconnect_failed');
      return;
    }
    this.controlTimer = globalThis.setTimeout(() => {
      if (!this.closed && generation === this.generation) {
        this.reduceRecovery({ kind: 'expired' });
        this.failLiveKitAgent('reconnect_failed');
      }
    }, Math.max(0, controlUntil - performance.now()));
    let replacementRequired = false;
    let recoveryRevision = 0;
    let checkingRecovery = false;
    const current = (): boolean => !this.closed && generation === this.generation;
    const mediaReady = (room: Room): boolean => room.state === 'connected' && navigator.onLine !== false &&
      agentMediaIsReady(this.liveKitAgentIdentity, room.remoteParticipants.values()) &&
      microphoneIsReady(this.local?.getAudioTracks()[0], room.localParticipant.audioTrackPublications.values());
    const finishRecovery = (room: Room): void => {
      if (!current() || this.room !== room || !mediaReady(room) ||
          (this.liveKitReady && !this.liveKitReconnecting) || checkingRecovery) return;
      checkingRecovery = true;
      const revision = recoveryRevision;
      const at = performance.now(), wall = Date.now();
      const stillCurrent = () => current() && this.room === room && revision === recoveryRevision;
      void this.api.liveSessionStatus(result.sessionID).then(status => {
        if (!stillCurrent()) return;
        const until = typeof status.deadline === 'string' ? at + Date.parse(status.deadline) - wall : NaN;
        if (status.sessionID !== result.sessionID || status.state !== 'active' ||
            !Number.isFinite(until) || until <= performance.now()) {
          this.failLiveKitAgent('reconnect_failed');
          return;
        }
        const bounded = Math.min(this.recoveryState?.controlUntil ?? 0, until);
        this.reduceRecovery({ kind: 'control', validUntil: bounded });
        this.clearControlTimer();
        this.controlTimer = globalThis.setTimeout(() => {
          if (current()) this.failLiveKitAgent('reconnect_failed');
        }, Math.max(0, bounded - performance.now()));
        if (!mediaReady(room) || !this.protocolMediaReady()) return;
        this.liveKitReady = true;
        this.liveKitReconnecting = false;
        replacementRequired = false;
        this.clearLiveKitRecoveryTimers();
        if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
        this.liveKitReadyTimer = undefined;
        this.onTiming('recovery-media-ready');
        this.onState('active');
      }).catch((error: unknown) => {
        if (!stillCurrent()) return;
        if (error instanceof MuralAPIError && [401, 403, 404].includes(error.status)) {
          this.failLiveKitAgent('reconnect_failed');
        } else {
          if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
          this.liveKitReadyTimer = globalThis.setTimeout(() => finishRecovery(room), MURAL_RECOVERY_RETRY_MS);
        }
      }).finally(() => {
        checkingRecovery = false;
        if (current() && this.liveKitReconnecting && (revision !== recoveryRevision || this.room !== room) && this.room)
          finishRecovery(this.room);
      });
    };
    const scheduleRecovery = (delay: number): void => {
      if (!current() || !this.liveKitReconnecting || this.liveKitRecoveryTimer !== undefined) return;
      this.liveKitRecoveryTimer = globalThis.setTimeout(() => {
        this.liveKitRecoveryTimer = undefined;
        recoverRoom();
      }, delay);
    };
    const beginRecovery = (allowReplacement = true): void => {
      if (!current() || !this.sessionID) return;
      recoveryRevision++;
      replacementRequired ||= allowReplacement;
      this.reduceRecovery({ kind: 'signal', connected: false });
      const firstDetection = !this.liveKitReconnecting;
      this.liveKitReconnecting = true;
      this.liveKitReady = false;
      if (firstDetection) this.onTiming('recovery-detected');
      if (this.liveKitAgentDepartureTimer !== undefined) globalThis.clearTimeout(this.liveKitAgentDepartureTimer);
      this.liveKitAgentDepartureTimer = undefined;
      if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
      this.liveKitReadyTimer = undefined;
      this.onState('connecting');
      if (this.liveKitRecoveryDeadline === undefined) {
        this.liveKitRecoveryUntil = Date.now() + MURAL_RECOVERY_WINDOW_MS;
        this.liveKitRecoveryDeadline = globalThis.setTimeout(() => { if (current()) this.failLiveKitAgent('reconnect_failed'); },
          MURAL_RECOVERY_WINDOW_MS);
      }
      if (replacementRequired) scheduleRecovery(MURAL_RECOVERY_FALLBACK_MS);
    };
    const openRoom = async (): Promise<Room | undefined> => {
      const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true,
        // Room replacement must not stop the microphone owned by LiveConnection.
        stopLocalTrackOnUnpublish: false,
        reconnectPolicy: new MuralReconnectPolicy() });
      this.room = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (!current() || this.room !== room || track.kind !== Track.Kind.Audio) return;
        this.liveKitAgentIdentity = participant.identity;
        if (this.liveKitAgentDepartureTimer !== undefined) globalThis.clearTimeout(this.liveKitAgentDepartureTimer);
        this.liveKitAgentDepartureTimer = undefined;
        this.remote.addTrack(track.mediaStreamTrack);
        this.onRemoteStream(this.remote);
        if (this.liveKitReconnecting) finishRecovery(room);
        else this.markLiveKitActive();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (!current() || this.room !== room || track.kind !== Track.Kind.Audio) return;
        this.remote.removeTrack(track.mediaStreamTrack);
        if (participant.identity === this.liveKitAgentIdentity) beginRecovery();
      });
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        if (!current() || this.room !== room) return;
        this.receiveTranscriptions(segments, participant?.isLocal === true);
      });
      room.on(RoomEvent.ParticipantDisconnected, participant => {
        if (!current() || this.room !== room || !agentDisconnectIsTerminal(this.liveKitAgentIdentity,
          participant.identity, this.liveKitReconnecting)) return;
        // The SDK emits ParticipantDisconnected before Reconnecting on a full
        // restart. Give that second event one tick to identify a recoverable loss.
        if (this.liveKitAgentDepartureTimer !== undefined) globalThis.clearTimeout(this.liveKitAgentDepartureTimer);
        this.liveKitAgentDepartureTimer = globalThis.setTimeout(() => {
          this.liveKitAgentDepartureTimer = undefined;
          if (current() && this.room === room && !this.liveKitReconnecting) this.failLiveKitAgent();
        }, 1_000);
      });
      room.on(RoomEvent.SignalReconnecting, () => { if (current() && this.room === room) beginRecovery(false); });
      room.on(RoomEvent.Reconnecting, () => { if (current() && this.room === room) beginRecovery(); });
      room.on(RoomEvent.Reconnected, () => {
        if (!current() || this.room !== room) return;
        if (mediaReady(room)) finishRecovery(room);
        else if (this.liveKitReconnecting) {
          replacementRequired = true;
          this.armLiveKitReadyTimeout(true, recoverRoom);
        }
      });
      room.on(RoomEvent.Disconnected, reason => {
        if (current() && this.room === room && this.sessionID) {
          if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.PARTICIPANT_REMOVED) {
            this.failLiveKitAgent();
            return;
          }
          beginRecovery();
          if (this.liveKitRecoveryTimer !== undefined) globalThis.clearTimeout(this.liveKitRecoveryTimer);
          this.liveKitRecoveryTimer = undefined;
          scheduleRecovery(0);
        }
      });
      try {
        await room.connect(transport.url, transport.token);
        if (!current() || this.room !== room) { await room.disconnect(false); return; }
        const track = this.local?.getAudioTracks()[0];
        if (!track) throw new Error('No local microphone track.');
        await room.localParticipant.publishTrack(new LocalAudioTrack(track), {
          source: Track.Source.Microphone,
        });
        if (!current() || this.room !== room) { await room.disconnect(false); return; }
        if (this.liveKitReconnecting) finishRecovery(room);
        else this.markLiveKitActive();
        return room;
      } catch (error) {
        if (this.room === room) this.room = undefined;
        await room.disconnect(false).catch(() => {});
        throw error;
      }
    };
    const recoverRoom = (): void => {
      if (!current() || !this.liveKitReconnecting || !replacementRequired || this.liveKitRecovery) return;
      if (navigator.onLine === false) {
        scheduleRecovery(MURAL_RECOVERY_RETRY_MS);
        return;
      }
      if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
      this.liveKitReadyTimer = undefined;
      const recovery = (async () => {
        const sessionID = this.sessionID!;
        // A retained room token is not authority to rejoin a closed product session.
        const status = await this.api.liveSessionStatus(sessionID);
        if (!current() || !this.liveKitReconnecting) return;
        const deadline = typeof status.deadline === 'string' ? Date.parse(status.deadline) : NaN;
        if (status.sessionID !== sessionID || status.state !== 'active' ||
            !Number.isFinite(deadline) || deadline <= Date.now()) {
          this.failLiveKitAgent('reconnect_failed');
          return;
        }
        const previous = this.room;
        this.room = undefined;
        this.remote.getTracks().forEach(track => this.remote.removeTrack(track));
        await previous?.disconnect(false);
        if (!current() || deadline <= Date.now()) {
          if (current()) this.failLiveKitAgent('reconnect_failed');
          return;
        }
        this.reduceRecovery({ kind: 'room-replaced' });
        const room = await openRoom();
        if (!current() || !room) return;
        if (mediaReady(room)) finishRecovery(room);
        else this.armLiveKitReadyTimeout(true, recoverRoom);
      })().catch((error: unknown) => {
        if (!current()) return;
        if (error instanceof MuralAPIError && [401, 403, 404].includes(error.status)) {
          this.failLiveKitAgent('reconnect_failed');
          return;
        }
        if (this.liveKitReconnecting && Date.now() < (this.liveKitRecoveryUntil ?? 0))
          scheduleRecovery(MURAL_RECOVERY_RETRY_MS);
        else this.failLiveKitAgent('reconnect_failed');
      });
      this.liveKitRecovery = recovery;
      void recovery.finally(() => { if (this.liveKitRecovery === recovery) this.liveKitRecovery = undefined; });
    };
    this.stopObservingOffline = observeBrowserOffline(() => {
      this.onTiming('browser-offline');
      beginRecovery();
    }, globalThis, () => {
      this.onTiming('browser-online');
      if (current() && this.liveKitReconnecting) {
        if (this.liveKitRecoveryTimer !== undefined) globalThis.clearTimeout(this.liveKitRecoveryTimer);
        this.liveKitRecoveryTimer = undefined;
        recoverRoom();
      }
    });
    await openRoom();
    if (!current()) return;
    if (!this.liveKitReady) this.armLiveKitReadyTimeout();
    this.onEvent({ type: 'mural.session.created', session: { id: result.sessionID } });
  }

  private armLiveKitReadyTimeout(recovering = false, retry?: () => void): void {
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    const generation = this.generation;
    this.liveKitReadyTimer = globalThis.setTimeout(() => {
      if (generation === this.generation && !this.closed && !this.liveKitReady) {
        if (recovering && this.liveKitReconnecting && retry) retry();
        else this.failLiveKitAgent();
      }
    }, recovering ? MURAL_MEDIA_READY_MS : 20_000);
  }

  private markLiveKitActive(): void {
    if (this.closed || this.liveKitReady || !this.room || this.room.state !== 'connected' || navigator.onLine === false ||
        !agentMediaIsReady(this.liveKitAgentIdentity, this.room.remoteParticipants.values()) ||
        !microphoneIsReady(this.local?.getAudioTracks()[0],
          this.room.localParticipant.audioTrackPublications.values())) return;
    if (!this.protocolMediaReady()) return;
    this.liveKitReady = true;
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    this.liveKitReadyTimer = undefined;
    this.onTiming('initial-media-ready');
    if (!this.liveKitReconnecting) this.onState('active');
  }

  private clearLiveKitRecoveryTimers(): void {
    if (this.liveKitRecoveryTimer !== undefined) globalThis.clearTimeout(this.liveKitRecoveryTimer);
    if (this.liveKitRecoveryDeadline !== undefined) globalThis.clearTimeout(this.liveKitRecoveryDeadline);
    if (this.liveKitAgentDepartureTimer !== undefined) globalThis.clearTimeout(this.liveKitAgentDepartureTimer);
    this.liveKitRecoveryTimer = undefined;
    this.liveKitRecoveryDeadline = undefined;
    this.liveKitRecoveryUntil = undefined;
    this.liveKitAgentDepartureTimer = undefined;
  }

  private failLiveKitAgent(reason: 'agent_lost' | 'reconnect_failed' = 'agent_lost'): void {
    if (this.closed) return;
    this.reduceRecovery({ kind: 'agent-lost' });
    this.clearControlTimer();
    this.closed = true;
    this.generation++;
    this.clearLiveKitRecoveryTimers();
    if (this.liveKitReadyTimer !== undefined) globalThis.clearTimeout(this.liveKitReadyTimer);
    this.liveKitReadyTimer = undefined;
    this.stopObservingOffline?.();
    this.stopObservingOffline = undefined;
    this.onTiming('failed');
    this.onEvent({ type: reason === 'agent_lost' ? 'mural.live.agent_lost' : 'mural.live.reconnect_failed' });
    this.onState('failed');
    if (this.sessionID) void this.api.closeLiveSession(this.sessionID).catch(() => {});
    if (this.room) void this.room.disconnect(false);
    this.local?.getTracks().forEach(track => track.stop());
    this.local = undefined;
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
    const generation = this.generation;
    const sessionID = this.sessionID;
    const room = this.room;
    const language = this.language;
    const clean = text.trim().slice(0, 2_000);
    const livekit = this.room?.state === 'connected';
    if (this.closed || !clean || (!livekit && this.channel?.readyState !== 'open') || !sessionID || !language) return false;
    const priorContext = this.context.slice(-10);
    const eventID = crypto.randomUUID();
    this.context.push({ speaker: 'user', text: clean });
    this.context = this.context.slice(-10);
    this.onEvent({ type: 'session.transcript.appended', event_id: eventID, speaker: 'user', text: clean, source: 'typed' });
    await this.persistEvent(sessionID, { eventID, speaker: 'user', text: clean, source: 'typed' });
    if (this.closed || generation !== this.generation || sessionID !== this.sessionID) return false;
    if (livekit) {
      if (!room || room !== this.room || room.state !== 'connected') return false;
      await room.localParticipant.sendText(clean, { topic: 'lk.chat' });
      return true;
    }
    const result = await this.api.createModelTask<{ kind: 'teachingReply'; text: string }>({
      kind: 'teachingReply',
      funding: { type: 'liveSession', sessionID },
      language: providerLocale(language),
      text: clean,
      context: priorContext,
    }, crypto.randomUUID());
    if (this.closed || generation !== this.generation || this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify({ type: 'session.commentary.append', event_id: crypto.randomUUID(), content: result.text }));
    return true;
  }

  close(): void {
    if (this.closingRequest) return;
    this.reduceRecovery({ kind: 'stop' });
    this.clearControlTimer();
    this.onTiming('stop-requested');
    this.onState('closing');
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ type: 'session.close', event_id: crypto.randomUUID() }));
    // A user-requested disconnect is expected; suppress transport failure handlers while
    // the API close and local cleanup finish.
    this.closed = true;
    const generation = ++this.generation;
    this.clearLiveKitRecoveryTimers();
    if (this.room) void this.room.disconnect(false);
    this.local?.getTracks().forEach(track => track.stop());
    this.local = undefined;
    this.channel?.close();
    this.peer?.close();
    const sessionID = this.sessionID;
    const admission = this.pendingAdmission;
    if (!sessionID && !admission && !this.admissionUncertain) { this.disconnect(); return; }
    this.admissionUncertain = !sessionID;
    this.closingAdmission = admission;
    const target = sessionID ? Promise.resolve(sessionID) : admission ? admission.then(result => result.sessionID) :
      this.api.liveSessionByRequest(this.admissionRequestID!).then(result => {
        if (!result.session) throw new Error('Admission remains unknown.');
        return result.session.sessionID;
      });
    const request = target.then(async id => {
      if (generation === this.generation) {
        this.admissionUncertain = false;
        this.sessionID = id;
        this.onSession(id);
      }
      const status = await this.api.closeLiveSession(id);
      return { status, id };
    }).then(({ status, id }) => {
      if (generation !== this.generation) return;
      if (status.sessionID !== id || status.state !== 'closed') {
        this.onEvent({ type: 'mural.live.close_pending' });
        return;
      }
      this.disconnect();
      this.onEvent({ type: 'session.closed' });
    }).catch(() => {
      if (generation === this.generation) this.onEvent({ type: 'mural.live.close_pending' });
    }).finally(() => {
      if (this.closingRequest === request) this.closingRequest = undefined;
      if (this.closingAdmission === admission) this.closingAdmission = undefined;
    });
    this.closingRequest = request;
  }

  disconnect(): void {
    this.pendingAdmission = undefined;
    this.clearControlTimer();
    this.recoveryState = undefined;
    this.closingRequest = undefined;
    const shouldCloseSession = !this.closed && this.sessionID;
    this.closed = true;
    this.generation++;
    if (shouldCloseSession) void this.api.closeLiveSession(shouldCloseSession).catch(() => {});
    this.clearLiveKitRecoveryTimers();
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    if (this.room) void this.room.disconnect(false);
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
