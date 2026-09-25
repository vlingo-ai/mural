// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import type { MuralAPI } from '../api/mural';
import { LiveConnection, type LiveState } from './LiveConnection';
import { MURAL_RECOVERY_FALLBACK_MS, MURAL_RECOVERY_RETRY_MS, MURAL_RECOVERY_WINDOW_MS } from './livekit-reconnect';
import type { TimingKind } from './timing-diagnostic';

type FakeTrack = MediaStreamTrack & { readyState: 'live' | 'ended' };
type FakeRoom = {
  state: string;
  localParticipant: { audioTrackPublications: Map<string, {
    source: string; isMuted: boolean; track: { mediaStreamTrack: FakeTrack };
  }> };
  emit(event: string, ...args: unknown[]): void;
};

const mock = vi.hoisted(() => ({
  rooms: [] as FakeRoom[], rejectedRoomNumbers: new Set<number>(),
  deferredConnects: new Map<number, Promise<void>>(),
}));

vi.mock('livekit-client', () => {
  class Room {
    state = 'disconnected';
    remoteParticipants = new Map();
    localParticipant = {
      audioTrackPublications: new Map(),
      publishTrack: async (track: { mediaStreamTrack: FakeTrack }) => {
        if (track.mediaStreamTrack.readyState !== 'live') throw new Error('microphone track already ended');
        this.localParticipant.audioTrackPublications.set('mic', {
          source: 'microphone', isMuted: false, track,
        });
      },
    };
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    private stopOnUnpublish: boolean;

    constructor(options: { stopLocalTrackOnUnpublish?: boolean }) {
      this.stopOnUnpublish = options.stopLocalTrackOnUnpublish ?? true;
      mock.rooms.push(this as unknown as FakeRoom);
    }
    on(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
    async connect() {
      const roomNumber = mock.rooms.indexOf(this as unknown as FakeRoom) + 1;
      try {
        if (mock.deferredConnects.has(roomNumber)) await mock.deferredConnects.get(roomNumber);
        if (mock.rejectedRoomNumbers.has(roomNumber)) throw new Error('network still unavailable');
      } catch (error) {
        await this.disconnect(this.stopOnUnpublish);
        throw error;
      }
      this.state = 'connected';
    }
    async disconnect(stopTracks = true) {
      if (stopTracks) for (const publication of this.localParticipant.audioTrackPublications.values())
        publication.track.mediaStreamTrack.stop();
      this.state = 'disconnected';
      this.emit('disconnected');
    }
  }
  class LocalAudioTrack {
    constructor(readonly mediaStreamTrack: FakeTrack) {}
  }
  return {
    Room, LocalAudioTrack,
    RoomEvent: {
      TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed',
      TranscriptionReceived: 'transcriptionReceived', ParticipantDisconnected: 'participantDisconnected',
      SignalReconnecting: 'signalReconnecting', Reconnecting: 'reconnecting',
      Reconnected: 'reconnected', Disconnected: 'disconnected',
    },
    DisconnectReason: { ROOM_DELETED: 5, PARTICIPANT_REMOVED: 4 },
    Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
  };
});

class TestMediaStream {
  private tracks: FakeTrack[] = [];
  addTrack(track: FakeTrack) { this.tracks.push(track); }
  removeTrack(track: FakeTrack) { this.tracks = this.tracks.filter(item => item !== track); }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}

function harness() {
  const microphone = { readyState: 'live' } as FakeTrack;
  microphone.stop = vi.fn(() => { microphone.readyState = 'ended'; });
  const media = new TestMediaStream();
  media.addTrack(microphone);
  vi.stubGlobal('MediaStream', TestMediaStream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(media) } });
  const closeLiveSession = vi.fn().mockResolvedValue({ sessionID: 'session-1', state: 'closed' });
  const liveSessionStatus = vi.fn().mockImplementation(async () => ({ sessionID: 'session-1',
    state: 'active', deadline: new Date(Date.now() + 60_000).toISOString() }));
  const api = {
    liveCapabilities: vi.fn().mockResolvedValue({ hostedMinutes: true, transport: 'livekit-room' }),
    createLiveSession: vi.fn().mockImplementation(async () => ({ sessionID: 'session-1',
      deadline: new Date(Date.now() + 900_000).toISOString(), transport: {
      type: 'livekit-room', url: 'wss://example.test', token: 'test-token',
    } })),
    closeLiveSession,
    liveSessionStatus,
  } as unknown as MuralAPI;
  const states: LiveState[] = [];
  const timings: TimingKind[] = [];
  const connection = new LiveConnection(api, state => states.push(state), () => {}, () => {},
    () => {}, kind => timings.push(kind));
  const agentAudio = { kind: 'audio', mediaStreamTrack: { readyState: 'live' } as FakeTrack };
  const publishAgent = (room: FakeRoom) => {
    (room as FakeRoom & { remoteParticipants: Map<string, unknown> }).remoteParticipants = new Map([
      ['agent', { identity: 'agent', audioTrackPublications: new Map([
        ['audio', { isSubscribed: true }],
      ]) }],
    ]);
    room.emit(RoomEvent.TrackSubscribed, agentAudio, {}, { identity: 'agent' });
  };
  return { connection, states, timings, closeLiveSession, liveSessionStatus, publishAgent, microphone,
    createLiveSession: vi.mocked(api.createLiveSession) };
}

describe('LiveKit reconnect lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers(); mock.rooms.length = 0; mock.rejectedRoomNumbers.clear(); mock.deferredConnects.clear();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('ends an active connection at its product deadline without extending on SDK recovery', async () => {
    const h = harness();
    h.createLiveSession.mockResolvedValue({ sessionID: 'session-1',
      deadline: new Date(Date.now() + 10_000).toISOString(),
      transport: { type: 'livekit-room', url: 'wss://example.test', token: 'test-token' },
      reservedMilliseconds: 10_000, billingBasis: 'connected-conversation-time', experimental: true });
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    await vi.advanceTimersByTimeAsync(5_000);
    mock.rooms[0]!.emit(RoomEvent.SignalReconnecting);
    mock.rooms[0]!.emit(RoomEvent.Reconnected);
    expect(h.states.at(-1)).toBe('active');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.states.at(-1)).toBe('failed');
    expect(h.microphone.readyState).toBe('ended');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(h.createLiveSession).toHaveBeenCalledTimes(1);
  });

  it('closes a late admitted session after Stop without joining its Room', async () => {
    const h = harness();
    let resolve!: (value: Awaited<ReturnType<MuralAPI['createLiveSession']>>) => void;
    h.createLiveSession.mockReturnValue(new Promise(done => { resolve = done; }));
    const connecting = h.connection.connect('en');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createLiveSession).toHaveBeenCalledTimes(1);
    h.connection.close();
    resolve({ sessionID: 'session-late', deadline: new Date(Date.now() + 60_000).toISOString(),
      transport: { type: 'livekit-room', url: 'wss://example.test', token: 'test-token' },
      reservedMilliseconds: 60_000, billingBasis: 'connected-conversation-time', experimental: true });
    await connecting;
    expect(mock.rooms).toHaveLength(0);
    expect(h.closeLiveSession).toHaveBeenCalledWith('session-late');
    expect(h.states.at(-1)).toBe('idle');
  });

  it('keeps closing after API failure and supports an explicit idempotent retry', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    h.closeLiveSession.mockRejectedValueOnce(new Error('offline'));
    h.connection.close();
    h.connection.close();
    expect(h.microphone.readyState).toBe('ended');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(h.states.at(-1)).toBe('closing');
    mock.rooms[0]!.emit(RoomEvent.Reconnected);
    expect(h.states.at(-1)).toBe('closing');
    h.connection.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.closeLiveSession).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)).toBe('idle');
  });

  it('does not treat a successful HTTP response with closing state as closed', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.closeLiveSession.mockResolvedValue({ sessionID: 'session-1', state: 'closing' });
    h.connection.close();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.states.at(-1)).toBe('closing');
    h.connection.disconnect();
  });

  for (const deadline of [null, 'invalid', '2000-01-01T00:00:00Z']) {
    it(`does not reuse a token with invalid/expired deadline ${deadline}`, async () => {
      const h = harness();
      await h.connection.connect('en');
      h.liveSessionStatus.mockResolvedValue({ sessionID: 'session-1', state: 'active', deadline });
      mock.rooms[0]!.emit(RoomEvent.Reconnecting);
      await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
      expect(mock.rooms).toHaveLength(1);
      expect(h.states.at(-1)).toBe('failed');
    });
  }

  for (const state of ['closed', 'closing', 'incomplete', 'creating']) {
    it(`does not rejoin a server session in ${state}`, async () => {
      const h = harness();
      await h.connection.connect('en');
      h.publishAgent(mock.rooms[0]!);
      h.liveSessionStatus.mockResolvedValue({ sessionID: 'session-1', state,
        deadline: new Date(Date.now() + 60_000).toISOString() });
      mock.rooms[0]!.emit(RoomEvent.Reconnecting);
      await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
      expect(h.liveSessionStatus).toHaveBeenCalledWith('session-1');
      expect(mock.rooms).toHaveLength(1);
      expect(h.states.at(-1)).toBe('failed');
      expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    });
  }

  it('ignores a status response arriving after Stop', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    let resolve!: (value: unknown) => void;
    h.liveSessionStatus.mockReturnValue(new Promise(done => { resolve = done; }));
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    h.connection.close();
    resolve({ sessionID: 'session-1', state: 'active', deadline: new Date(Date.now() + 60_000).toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.rooms).toHaveLength(1);
    expect(h.states.at(-1)).toBe('idle');
    h.connection.disconnect();
  });

  it('does not show Active until both Agent audio and the local microphone are published', async () => {
    const h = harness();
    await h.connection.connect('en');
    const room = mock.rooms[0]!;
    room.localParticipant.audioTrackPublications.clear();
    h.publishAgent(room);
    expect(h.states.at(-1)).toBe('connecting');
    room.localParticipant.audioTrackPublications.set('mic', {
      source: 'microphone', isMuted: false, track: { mediaStreamTrack: h.microphone },
    });
    h.publishAgent(room);
    expect(h.states.at(-1)).toBe('active');
    expect(h.timings).toContain('initial-media-ready');
    h.connection.disconnect();
  });

  it('preserves the Room on signal-only loss and lets the SDK recover', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    expect(h.states.at(-1)).toBe('active');
    mock.rooms[0]!.emit(RoomEvent.SignalReconnecting);
    expect(h.states.at(-1)).toBe('connecting');
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(1);
    mock.rooms[0]!.emit(RoomEvent.Reconnected);
    expect(h.states.at(-1)).toBe('active');
    expect(h.timings.filter(kind => kind === 'recovery-detected')).toHaveLength(1);
    expect(h.timings.filter(kind => kind === 'recovery-media-ready')).toHaveLength(1);
    expect(h.closeLiveSession).not.toHaveBeenCalled();
    expect(h.microphone.readyState).toBe('live');
    h.connection.disconnect();
  });

  it('stops a microphone permission result arriving after Stop', async () => {
    const h = harness();
    let resolve!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>(done => { resolve = done; });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(pending);
    const connecting = h.connection.connect('en');
    h.connection.close();
    const stream = new TestMediaStream();
    stream.addTrack(h.microphone);
    resolve(stream as unknown as MediaStream);
    await connecting;
    expect(h.microphone.stop).toHaveBeenCalledTimes(1);
    expect(mock.rooms).toHaveLength(0);
    expect(h.states.at(-1)).toBe('idle');
    h.connection.disconnect();
  });

  it('escalates signal loss to replacement only after media reconnect evidence', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.SignalReconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(1);
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(2);
    h.connection.disconnect();
  });

  it('does not let an old permission result overwrite the new microphone', async () => {
    const h = harness();
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(
      new Promise<MediaStream>(done => { resolve = done; }));
    const oldConnect = h.connection.connect('en');
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    const obsolete = { readyState: 'live', stop: vi.fn() } as unknown as FakeTrack;
    const stream = new TestMediaStream();
    stream.addTrack(obsolete);
    resolve(stream as unknown as MediaStream);
    await oldConnect;
    expect(obsolete.stop).toHaveBeenCalledTimes(1);
    expect(h.microphone.readyState).toBe('live');
    expect(h.states.at(-1)).toBe('active');
    h.connection.disconnect();
    expect(h.microphone.stop).toHaveBeenCalledTimes(1);
  });

  it('ends persistent signaling loss at the existing bounded deadline without room churn', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.SignalReconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_WINDOW_MS);
    expect(mock.rooms).toHaveLength(1);
    expect(h.states.at(-1)).toBe('failed');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(h.microphone.readyState).toBe('ended');
  });

  it('does not mistake SDK participant removal before Reconnecting for a lost agent', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.ParticipantDisconnected, { identity: 'agent' });
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.states.at(-1)).toBe('connecting');
    expect(h.closeLiveSession).not.toHaveBeenCalled();
    h.connection.disconnect();
  });

  it('shows Connecting when the subscribed Agent audio disappears', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    expect(h.states.at(-1)).toBe('active');
    mock.rooms[0]!.emit(RoomEvent.TrackUnsubscribed,
      { kind: 'audio', mediaStreamTrack: { readyState: 'live' } }, {}, { identity: 'agent' });
    expect(h.states.at(-1)).toBe('connecting');
    h.connection.disconnect();
  });

  it('still fails for an Agent departure without a reconnect', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.ParticipantDisconnected, { identity: 'agent' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.states.at(-1)).toBe('failed');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(mock.rooms[0]!.state).toBe('disconnected');
  });

  it('fails immediately when LiveKit reports that the room was deleted', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.Disconnected, 5);
    expect(h.states.at(-1)).toBe('failed');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(mock.rooms[0]!.state).toBe('disconnected');
  });

  it('rebuilds if SDK says Reconnected but Agent audio does not return', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    (mock.rooms[0]! as FakeRoom & { remoteParticipants: Map<string, unknown> }).remoteParticipants.clear();
    mock.rooms[0]!.emit(RoomEvent.Reconnected);
    expect(h.states.at(-1)).toBe('connecting');
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(2);
    h.publishAgent(mock.rooms[1]!);
    expect(h.states.at(-1)).toBe('active');
    h.connection.disconnect();
  });

  it('retries a temporary room join error instead of ending the paid session immediately', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    mock.rejectedRoomNumbers.add(2);
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(h.states.at(-1)).toBe('connecting');
    expect(h.closeLiveSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_RETRY_MS);
    expect(mock.rooms).toHaveLength(3);
    h.publishAgent(mock.rooms[2]!);
    expect(h.states.at(-1)).toBe('active');
    h.connection.disconnect();
  });

  it('waits through confirmed offline and starts room recovery when online returns', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    globalThis.dispatchEvent(new Event('offline'));
    expect(h.states.at(-1)).toBe('connecting');
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    globalThis.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.rooms).toHaveLength(2);
    h.publishAgent(mock.rooms[1]!);
    expect(h.states.at(-1)).toBe('active');
    h.connection.disconnect();
  });

  it('fails closed at the recovery deadline when every new join fails', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    for (let attempt = 2; attempt < 30; attempt++) mock.rejectedRoomNumbers.add(attempt);
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_WINDOW_MS);
    expect(h.states.at(-1)).toBe('failed');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
    expect(h.microphone.stop).toHaveBeenCalledTimes(1);
    expect(mock.rooms.every(room => room.state === 'disconnected')).toBe(true);
  });

  it('closes an admitted API session if the initial LiveKit join fails', async () => {
    const h = harness();
    mock.rejectedRoomNumbers.add(1);
    await expect(h.connection.connect('en')).rejects.toThrow('network still unavailable');
    expect(h.states.at(-1)).toBe('failed');
    expect(h.closeLiveSession).toHaveBeenCalledTimes(1);
  });

  it('ignores a late failure from an obsolete recovery after a new session starts', async () => {
    const h = harness();
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[0]!);
    let rejectOldJoin!: (error: Error) => void;
    mock.deferredConnects.set(2, new Promise<void>((_resolve, reject) => { rejectOldJoin = reject; }));
    mock.rooms[0]!.emit(RoomEvent.Reconnecting);
    await vi.advanceTimersByTimeAsync(MURAL_RECOVERY_FALLBACK_MS);
    expect(mock.rooms).toHaveLength(2);
    h.connection.disconnect();
    const newMic = { readyState: 'live', stop: vi.fn() } as unknown as FakeTrack;
    const newMedia = new TestMediaStream();
    newMedia.addTrack(newMic);
    vi.stubGlobal('navigator', { onLine: true, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(newMedia) } });
    await h.connection.connect('en');
    h.publishAgent(mock.rooms[2]!);
    expect(h.states.at(-1)).toBe('active');
    rejectOldJoin(new Error('old network attempt failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)).toBe('active');
    h.connection.disconnect();
  });
});
