import type { LiveSessionResult, ProviderLocale } from './contracts';

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
    sdp: string;
    language: ProviderLocale;
    instructions?: string;
    history?: Array<{ speaker: 'user' | 'assistant'; text: string }>;
    requestedMilliseconds?: number;
  }, idempotencyKey: string): Promise<LiveSessionResult> {
    return this.request('/v1/live/sessions', input, idempotencyKey);
  }

  async createModelTask<T>(input: unknown, idempotencyKey: string): Promise<T> {
    return this.request('/v1/model-tasks', input, idempotencyKey);
  }

  private async request<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    const token = this.accessToken();
    if (!token) throw new MuralAPIError('sign_in_required', 401);
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin.origin) throw new Error('Cross-origin API request rejected.');
    const response = await this.send(url, {
      method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: {
        accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}`,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
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
