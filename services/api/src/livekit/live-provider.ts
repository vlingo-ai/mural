import { createHmac, timingSafeEqual } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient, ServerError } from 'livekit-server-sdk';
import { ServiceError } from '../errors.js';
import { parseConversationEvent } from '../conversation-history.js';
import { LiveCreateFailure, LiveCreateRejectedError, liveInstructions, parseLiveContext, type LiveContext, type LiveCreateResult,
  type LiveDelegation, type LiveHistoryEvent, type LiveProvider, type LiveProviderRejection, type Sideband, type VoiceUsage } from '../live-provider.js';

type Listener = { onUsage: (event: VoiceUsage) => void; onLoss: () => void };

export interface LiveKitProviderConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  controlSecret: string;
  agentName?: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every(key => keys.includes(key));
const cleanText = (value: unknown, bytes: number): value is string => typeof value === 'string' &&
  Boolean(value.trim()) && Buffer.byteLength(value) <= bytes && !/[\uD800-\uDFFF]/u.test(value) &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
export const isLiveKitRoomAbsent = (error: unknown): boolean => object(error) &&
  error.code === 'not_found' && error.status === 404;
export const liveKitRoomOptions = (name: string) => ({
  name, emptyTimeout: 60, departureTimeout: 60, maxParticipants: 2,
});

export class LiveKitLiveProvider implements LiveProvider {
  readonly clientTransport = 'livekit-room' as const;
  readonly controlLeaseMilliseconds = 30_000;
  readonly #url: URL;
  readonly #rooms: RoomServiceClient;
  readonly #dispatches: AgentDispatchClient;
  readonly #apiKey: string;
  readonly #apiSecret: string;
  readonly #controlSecret: string;
  readonly #agentName: string;
  readonly #listeners = new Map<string, Listener>();

  constructor(config: LiveKitProviderConfig) {
    this.#url = new URL(config.url);
    if (!['ws:', 'wss:'].includes(this.#url.protocol) || this.#url.username || this.#url.password ||
        this.#url.search || this.#url.hash || !config.apiKey || config.apiSecret.length < 6 ||
        config.controlSecret.length < 32 || !cleanText(config.agentName ?? 'mural-gpt-live', 128))
      throw new ServiceError('livekit_configuration_invalid', 503);
    if (this.#url.protocol === 'ws:' && !['127.0.0.1', 'localhost', '[::1]'].includes(this.#url.hostname))
      throw new ServiceError('livekit_configuration_invalid', 503);
    const serviceURL = new URL(this.#url);
    serviceURL.protocol = serviceURL.protocol === 'wss:' ? 'https:' : 'http:';
    // Keep control operations bounded; our durable cleanup owns retries. SDK
    // region failover must not hide unbounded/multiple create attempts.
    this.#rooms = new RoomServiceClient(serviceURL.origin, config.apiKey, config.apiSecret,
      { requestTimeout: 5, failover: false });
    this.#dispatches = new AgentDispatchClient(serviceURL.origin, config.apiKey, config.apiSecret,
      { requestTimeout: 5, failover: false });
    this.#apiKey = config.apiKey;
    this.#apiSecret = config.apiSecret;
    this.#controlSecret = config.controlSecret;
    this.#agentName = config.agentName ?? 'mural-gpt-live';
  }

  async create(_sdp: string, language: string, input?: LiveContext, muralSessionID?: string): Promise<LiveCreateResult> {
    if (!muralSessionID) throw new ServiceError('invalid_provider_session', 502);
    const context = parseLiveContext(input);
    const room = muralSessionID;
    let created = false;
    try {
      // A browser can take longer than ten seconds to detect a Wi-Fi loss and
      // rejoin. Keep the room (and its agent) alive beyond the client's bounded
      // recovery window; a permanently disconnected client still times out.
      await this.#rooms.createRoom(liveKitRoomOptions(room));
      created = true;
      const metadata = JSON.stringify({
        version: '1.0', sessionID: muralSessionID, language,
        controlToken: this.#controlToken(muralSessionID),
        instructions: liveInstructions(language, context),
        history: context.history.map(message => ({
          speaker: message.role,
          text: message.content[0]!.text,
        })),
      });
      await this.#dispatches.createDispatch(room, this.#agentName, { metadata });
      const token = new AccessToken(this.#apiKey, this.#apiSecret, {
        identity: `mural-web-${muralSessionID}`,
        ttl: 3_660,
      });
      token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
      return { sessionID: room, transport: { type: 'livekit-room', url: this.#url.toString(), token: await token.toJwt() } };
    } catch (error) {
      let roomAbsent = !created;
      if (created) {
        try { await this.#rooms.deleteRoom(room); roomAbsent = true; }
        catch (cleanupError) { roomAbsent = isLiveKitRoomAbsent(cleanupError); }
      }
      // A CreateRoom conflict can mean the named room already exists. Never
      // release its hold as if absence were proven. A dispatch 429 is safely
      // rejected only after the already-created room is confirmed absent.
      if (error instanceof ServerError && error.status >= 400 && error.status < 500 &&
          error.status !== 408 && error.status !== 409 &&
          (!created || (error.status === 429 && roomAbsent)))
        throw new LiveCreateRejectedError(error.status);
      throw new LiveCreateFailure('transport', undefined,
        object(error) && typeof error.requestId === 'string' ? error.requestId : undefined);
    }
  }

  async attach(sessionID: string, onUsage: (event: VoiceUsage) => void, onLoss: () => void): Promise<Sideband> {
    const listener = { onUsage, onLoss };
    this.#listeners.set(sessionID, listener);
    return {
      closeSession: () => { void this.hangup(sessionID).catch(onLoss); },
      disconnect: () => { if (this.#listeners.get(sessionID) === listener) this.#listeners.delete(sessionID); },
    };
  }

  async hangup(sessionID: string): Promise<void> {
    try { await this.#rooms.deleteRoom(sessionID); }
    catch (error) {
      // Room deletion is the close acknowledgement. Concurrent user, watchdog, and worker close
      // paths may observe the same already-deleted room; LiveKit's exact 404 is idempotent success.
      if (!isLiveKitRoomAbsent(error)) throw new ServiceError('provider_hangup_unconfirmed', 502);
    }
  }

  acceptTrustedEvent(sessionID: string, authorization: string | undefined, body: unknown):
    LiveDelegation | LiveProviderRejection | VoiceUsage | LiveHistoryEvent {
    const expected = `Bearer ${this.#controlToken(sessionID)}`;
    if (typeof authorization !== 'string' || authorization.length !== expected.length ||
        !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected)))
      throw new ServiceError('invalid_livekit_control_token', 401);
    if (!object(body) || typeof body.type !== 'string') throw new ServiceError('invalid_livekit_control_event');
    if (body.type === 'session.history.final') {
      if (!exactKeys(body, ['type', 'eventID', 'speaker', 'text']) ||
          typeof body.eventID !== 'string' || !body.eventID.startsWith('worker.'))
        throw new ServiceError('invalid_livekit_control_event');
      const event = parseConversationEvent({ eventID: body.eventID, speaker: body.speaker, text: body.text, source: 'live' });
      return { type: 'session.history.final', eventID: event.eventID, speaker: event.speaker, text: event.text };
    }
    if (body.type === 'session.usage.updated' || body.type === 'session.closed' || body.type === 'session.heartbeat') {
      if (!exactKeys(body, ['type', 'seconds']) || typeof body.seconds !== 'number' ||
          !Number.isFinite(body.seconds) || body.seconds < 0 || body.seconds > Number.MAX_SAFE_INTEGER / 1000)
        throw new ServiceError('invalid_livekit_control_event');
      const event: VoiceUsage = { type: body.type === 'session.heartbeat' ? 'session.usage.updated' : body.type,
        usage: { seconds: body.seconds } };
      // Parse only: the controller must await its database transaction before
      // returning HTTP 2xx. A retry after API restart or finalization cannot
      // depend on this process's in-memory listener.
      return event;
    }
    if (body.type === 'session.provider.rejected') {
      if (!exactKeys(body, ['type', 'providerStatus', 'requestID']) ||
          !Number.isInteger(body.providerStatus) || Number(body.providerStatus) < 400 ||
          Number(body.providerStatus) >= 500 || Number(body.providerStatus) === 408 ||
          (body.requestID !== undefined && (typeof body.requestID !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(body.requestID))))
        throw new ServiceError('invalid_livekit_control_event');
      return { type: body.type, providerStatus: Number(body.providerStatus),
        ...(body.requestID === undefined ? {} : { requestID: body.requestID as string }) };
    }
    if (body.type !== 'session.delegation.created' ||
        !exactKeys(body, ['type', 'delegationID', 'text', 'context']) ||
        !cleanText(body.delegationID, 256) || !cleanText(body.text, 8_000) ||
        !Array.isArray(body.context) || body.context.length > 10)
      throw new ServiceError('invalid_livekit_control_event');
    const context = body.context.map(turn => {
      if (!object(turn) || !exactKeys(turn, ['speaker', 'text']) ||
          !['user', 'assistant'].includes(String(turn.speaker)) || !cleanText(turn.text, 4_000))
        throw new ServiceError('invalid_livekit_control_event');
      return { speaker: turn.speaker as 'user' | 'assistant', text: turn.text };
    });
    return { type: body.type, delegationID: body.delegationID, text: body.text, context };
  }

  #controlToken(sessionID: string): string {
    return createHmac('sha256', this.#controlSecret).update('mural-livekit-control-v1\0').update(sessionID).digest('base64url');
  }
}
