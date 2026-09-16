import WebSocket from 'ws';
import { ServiceError } from '../errors.js';
import {
  LiveCreateFailure,
  LiveCreateRejectedError,
  boundedJSON,
  liveInstructions,
  parseLiveContext,
  type LiveContext,
  type LiveProvider,
  type Sideband,
  type VoiceUsage,
} from '../live-provider.js';
import { ModelGatewayClient } from './client.js';

const CLIENT_EVENTS = [
  'session.input_audio.mute', 'session.input_audio.unmute', 'session.instructions.append',
  'session.thinking.append', 'session.commentary.append', 'session.close',
];
const SERVER_EVENTS = [
  'session.started', 'session.updated', 'session.input_audio.muted', 'session.input_audio.unmuted',
  'session.instructions.appended', 'session.thinking.appended', 'session.commentary.appended',
  'session.input_transcript.delta', 'session.output_transcript.delta', 'session.delegation.created',
  'session.usage.updated', 'session.closed', 'error',
];

const gatewaySessionPath = (id: string) => {
  if (!id || id.length > 256 || /[\x00-\x20/]/.test(id))
    throw new ServiceError('invalid_provider_session', 502);
  return `/v1/live/sessions/${encodeURIComponent(id)}`;
};

/** Creation and trusted sideband use Gateway; client media stays on WebRTC. */
export class ModelGatewayLiveProvider implements LiveProvider {
  readonly clientTransport = 'webrtc' as const;
  readonly #client: ModelGatewayClient;
  readonly #timeout: number;

  constructor(client: ModelGatewayClient, timeoutMilliseconds = 10_000) {
    this.#client = client;
    this.#timeout = timeoutMilliseconds;
    if (!Number.isSafeInteger(this.#timeout) || this.#timeout < 100 || this.#timeout > 60_000)
      throw new ServiceError('model_gateway_configuration_invalid', 503);
  }

  async create(sdp: string, language: string, input?: LiveContext): Promise<{ sessionID: string; sdp: string }> {
    if (!sdp) throw new ServiceError('invalid_live_offer');
    const context = parseLiveContext(input);
    const instructions = liveInstructions(language, context);
    let responseStatus: number | undefined, requestID: string | null = null;
    try {
      const response = await this.#client.request('/v1/live/sessions', {
        method: 'POST',
        headers: { Authorization: this.#client.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mural.live.default', transport: { type: 'webrtc', sdp },
          session: { instructions, voice: 'marin', input: context.history,
            data_channel: { allowed_client_events: CLIENT_EVENTS, allowed_server_events: SERVER_EVENTS },
            delegation: { type: 'application' } }, metadata: {},
        }),
      }, this.#timeout);
      responseStatus = response.status; requestID = response.headers.get('x-request-id');
      if (!response.ok) {
        const rejection = response.status >= 400 && response.status < 500 && response.status !== 408
          ? new LiveCreateRejectedError(response.status, requestID) : undefined;
        await response.body?.cancel().catch(() => {});
        if (rejection) throw rejection;
        throw new LiveCreateFailure('http_uncertain', response.status, requestID);
      }
      const raw = await boundedJSON(response, 131_072);
      if (!raw || typeof raw !== 'object' || raw.object !== 'gateway.live_session' || raw.status !== 'ready' ||
          raw.model !== 'mural.live.default' || typeof raw.id !== 'string' || raw.transport?.type !== 'webrtc' ||
          typeof raw.transport.sdp !== 'string' || raw.sideband?.protocol !== 'vlingo.live.sideband' ||
          raw.sideband.protocol_version !== '1.0' || raw.sideband.url !== `${gatewaySessionPath(raw.id)}/sideband`)
        throw new Error();
      return { sessionID: raw.id, sdp: raw.transport.sdp };
    } catch (error) {
      if (error instanceof LiveCreateFailure) throw error;
      throw new LiveCreateFailure(responseStatus === undefined ? 'transport' : 'invalid_success', responseStatus, requestID);
    }
  }

  async attach(sessionID: string, onUsage: (event: VoiceUsage) => void, onLoss: () => void): Promise<Sideband> {
    const socket = this.#socket(sessionID);
    return new Promise((resolve, reject) => {
      let intentional = false, opened = false, finalized = false, lossReported = false;
      let lastSequence = 0, lastSeconds: number | undefined, pongAt = Date.now();
      const heartbeat = setInterval(() => {
        if (!opened) return;
        if (Date.now() - pongAt > 15_000) { lost(); socket.terminate(); }
        else if (socket.readyState === WebSocket.OPEN) socket.ping();
      }, 5_000);
      heartbeat.unref();
      socket.on('pong', () => { pongAt = Date.now(); });
      const lost = () => { if (!intentional && !finalized && !lossReported) { lossReported = true; onLoss(); } };
      socket.on('error', () => { if (!opened) reject(new ServiceError('provider_attach_failed', 502)); lost(); });
      socket.on('close', () => { clearInterval(heartbeat); if (!opened) reject(new ServiceError('provider_attach_failed', 502)); lost(); });
      socket.on('message', (bytes, binary) => {
        try {
          if (finalized) return;
          if (binary) throw new Error();
          const event = JSON.parse(bytes.toString()) as Record<string, any>;
          if (event.protocol_version !== '1.0' || event.session_id !== sessionID ||
              !Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence) throw new Error();
          lastSequence = event.sequence;
          if (event.type === 'audio_usage.updated') {
            if (typeof event.seconds !== 'number' || !Number.isFinite(event.seconds) || event.seconds < 0 ||
                event.seconds > Number.MAX_SAFE_INTEGER / 1000) throw new Error();
            lastSeconds = event.seconds;
            onUsage({ type: 'session.usage.updated', usage: { seconds: event.seconds } });
          } else if (event.type === 'session.closed') {
            if (lastSeconds === undefined) throw new Error();
            finalized = true; onUsage({ type: 'session.closed', usage: { seconds: lastSeconds } });
          } else if (event.type === 'error' && event.fatal === true) throw new Error();
        } catch { lost(); socket.terminate(); }
      });
      socket.once('open', () => {
        opened = true;
        resolve({ closeSession() {
          if (socket.readyState !== WebSocket.OPEN) throw new ServiceError('provider_connection_lost', 502);
          socket.send(JSON.stringify({ type: 'session.close' }));
        }, disconnect() { intentional = true; socket.terminate(); } });
      });
    });
  }

  async hangup(sessionID: string): Promise<void> {
    const socket = this.#socket(sessionID);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) return; settled = true; socket.terminate();
        reject(new ServiceError('provider_hangup_unconfirmed', 502));
      };
      socket.once('error', fail); socket.once('close', fail);
      socket.once('open', () => socket.send(JSON.stringify({ type: 'session.close' }), error => {
        if (error) { fail(); return; }
        settled = true; socket.removeAllListeners(); socket.close(); resolve();
      }));
    });
  }

  #socket(sessionID: string): WebSocket {
    const url = new URL(`${gatewaySessionPath(sessionID)}/sideband`, this.#client.origin);
    url.protocol = this.#client.origin.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url, { headers: { Authorization: this.#client.authorization },
      handshakeTimeout: this.#timeout, maxPayload: 524_288, perMessageDeflate: false, followRedirects: false });
  }
}
