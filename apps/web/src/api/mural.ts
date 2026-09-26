import type { AccountProfile, AuthChallenge, AuthExchange, ConversationDetail, ConversationSummary, HistoryPage, LiveCapabilities, LiveSessionResult, ProviderLocale } from './contracts';
import type { LiveSessionStatusDTO, CurrentLiveSessionDTO } from '../../../../shared/contracts/generated/live';

type Fetch = typeof globalThis.fetch;
type ErrorBody = { error?: { code?: string } };

export class MuralAPIError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly reference?: string,
  ) {
    super(code);
    this.name = 'MuralAPIError';
  }
}

export class MuralAPI {
  readonly origin: URL;

  constructor(origin: string, private readonly accessToken: () => string | undefined, private readonly send: Fetch = fetch) {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))) {
      throw new Error('Mural API origin must be HTTPS or an exact loopback origin.');
    }
    parsed.pathname = '';
    this.origin = parsed;
  }

  async createLiveSession(input: {
    sdp?: string;
    language: ProviderLocale;
    instructions?: string;
    history?: Array<{ speaker: 'user' | 'assistant'; text: string }>;
    requestedMilliseconds?: number;
  }, idempotencyKey: string): Promise<LiveSessionResult> {
    return this.sendRequest('/v1/live/sessions', 'POST', input, idempotencyKey, true, AbortSignal.timeout(30_000));
  }

  liveCapabilities(): Promise<LiveCapabilities> { return this.get('/v1/live/capabilities'); }

  liveSessionStatus(sessionID: string): Promise<LiveSessionStatusDTO> {
    return this.sendRequest(`/v1/live/sessions/${encodeURIComponent(sessionID)}`, 'GET',
      undefined, undefined, true, AbortSignal.timeout(5_000));
  }
  liveSessionByRequest(requestID: string): Promise<CurrentLiveSessionDTO> {
    return this.sendRequest(`/v1/live/requests/${encodeURIComponent(requestID)}`, 'GET',
      undefined, undefined, true, AbortSignal.timeout(5_000));
  }

  async createModelTask<T>(input: unknown, idempotencyKey: string): Promise<T> {
    return this.request('/v1/model-tasks', input, idempotencyKey);
  }

  createAuthChallenge(): Promise<AuthChallenge> { return this.sendRequest('/v1/auth/challenge', 'POST', {}, undefined, false); }
  exchangeIdentity(provider: 'google' | 'apple', idToken: string, challengeID: string): Promise<AuthExchange> {
    return this.sendRequest('/v1/auth/exchange', 'POST', { provider, idToken, challengeID }, undefined, false);
  }
  account(): Promise<AccountProfile> { return this.get('/v1/account'); }
  async signOut(): Promise<void> { await this.request('/v1/auth/sign-out', {}); }
  conversations(): Promise<{ conversations: ConversationSummary[] }> { return this.get('/v1/conversations'); }
  conversation(id: string): Promise<ConversationDetail> {
    return this.sendRequest(`/v1/conversations/${encodeURIComponent(id)}`, 'GET',
      undefined, undefined, true, AbortSignal.timeout(10_000));
  }
  conversationEvents(id: string, cursor?: string): Promise<HistoryPage> {
    const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
    return this.sendRequest(`/v1/conversations/${encodeURIComponent(id)}/events?${query}`, 'GET',
      undefined, undefined, true, AbortSignal.timeout(10_000));
  }
  appendConversationEvent(sessionID: string, event: { eventID: string; speaker: 'user' | 'assistant'; text: string; source: 'live' | 'typed' }): Promise<{ accepted: true; duplicate: boolean }> {
    return this.request(`/v1/conversations/${encodeURIComponent(sessionID)}/events`, event);
  }
  closeLiveSession(sessionID: string): Promise<LiveSessionStatusDTO> {
    return this.sendRequest(`/v1/live/sessions/${encodeURIComponent(sessionID)}/close`, 'POST',
      {}, undefined, true, AbortSignal.timeout(5_000));
  }

  private async get<T>(path: string): Promise<T> { return this.sendRequest(path, 'GET'); }

  private async request<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.sendRequest(path, 'POST', body, idempotencyKey);
  }

  private async sendRequest<T>(path: string, method: 'GET' | 'POST', body?: unknown, idempotencyKey?: string, authenticated = true, signal?: AbortSignal): Promise<T> {
    const token = this.accessToken();
    if (authenticated && !token) throw new MuralAPIError('sign_in_required', 401);
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin.origin) throw new Error('Cross-origin API request rejected.');
    const response = await this.send.call(globalThis, url, {
      method, redirect: 'error', cache: 'no-store', credentials: 'omit', signal,
      headers: {
        accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let decoded: unknown;
    try { decoded = await response.json(); } catch { throw new MuralAPIError('service_unavailable', response.status); }
    if (!response.ok) {
      const code = (decoded as ErrorBody)?.error?.code;
      throw new MuralAPIError(typeof code === 'string' ? code : 'service_unavailable', response.status,
        response.headers.get('x-mural-error-reference') ?? undefined);
    }
    return decoded as T;
  }
}
