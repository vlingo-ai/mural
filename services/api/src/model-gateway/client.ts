import { ServiceError } from '../errors.js';
import { boundedJSON } from '../live-provider.js';

type GatewayClientOptions = {
  request?: typeof fetch;
  requestTimeoutMilliseconds?: number;
  healthTimeoutMilliseconds?: number;
  failureThreshold?: number;
  resetMilliseconds?: number;
  now?: () => number;
};

const validDuration = (value: number, minimum: number, maximum: number) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

/** Shared, retry-free transport guard for all trusted Mural-to-Gateway traffic. */
export class ModelGatewayClient {
  readonly origin: URL;
  readonly authorization: string;
  readonly #request: typeof fetch;
  readonly #requestTimeout: number;
  readonly #healthTimeout: number;
  readonly #failureThreshold: number;
  readonly #reset: number;
  readonly #now: () => number;
  #failures = 0;
  #openUntil = 0;
  #probeInFlight = false;

  constructor(origin: string, key: string, options: GatewayClientOptions = {}) {
    try { this.origin = new URL(origin); }
    catch { throw new ServiceError('model_gateway_configuration_invalid', 503); }
    const local = this.origin.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(this.origin.hostname);
    if ((this.origin.protocol !== 'https:' && !local) || this.origin.username || this.origin.password ||
        this.origin.search || this.origin.hash || !['', '/'].includes(this.origin.pathname) ||
        !/^[\x21-\x7e]{32,512}$/.test(key))
      throw new ServiceError('model_gateway_configuration_invalid', 503);
    this.#requestTimeout = options.requestTimeoutMilliseconds ?? 10_000;
    this.#healthTimeout = options.healthTimeoutMilliseconds ?? 3_000;
    this.#failureThreshold = options.failureThreshold ?? 3;
    this.#reset = options.resetMilliseconds ?? 15_000;
    if (!validDuration(this.#requestTimeout, 100, 60_000) || !validDuration(this.#healthTimeout, 100, 10_000) ||
        !validDuration(this.#failureThreshold, 1, 20) || !validDuration(this.#reset, 1_000, 300_000))
      throw new ServiceError('model_gateway_configuration_invalid', 503);
    this.authorization = `Bearer ${key}`;
    this.#request = options.request ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async request(path: string, init: RequestInit = {}, timeoutMilliseconds = this.#requestTimeout): Promise<Response> {
    if (!path.startsWith('/') || path.startsWith('//') || !validDuration(timeoutMilliseconds, 100, 60_000))
      throw new ServiceError('model_gateway_configuration_invalid', 503);
    const probe = this.#permit();
    const timeout = AbortSignal.timeout(timeoutMilliseconds);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const response = await this.#request(new URL(path, this.origin), { ...init, redirect: 'error', signal });
      if (response.status === 408 || response.status === 429 || response.status >= 500) this.#failed(probe);
      else this.#succeeded();
      return response;
    } catch (error) {
      if (init.signal?.aborted) {
        if (probe) { this.#probeInFlight = false; this.#openUntil = this.#now(); }
        throw error;
      }
      this.#failed(probe);
      throw error;
    }
  }

  async checkHealth(): Promise<void> {
    try {
      const response = await this.request('/healthz', { method: 'GET' }, this.#healthTimeout);
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(); }
      const raw: unknown = await boundedJSON(response, 16_384);
      if (!raw || typeof raw !== 'object' || (raw as any).status !== 'ok' ||
          typeof (raw as any).service !== 'string' || typeof (raw as any).version !== 'string') throw new Error();
    } catch {
      throw new ServiceError('model_gateway_unavailable', 503);
    }
  }

  #permit(): boolean {
    if (!this.#openUntil) return false;
    if (this.#now() < this.#openUntil || this.#probeInFlight)
      throw new ServiceError('model_gateway_circuit_open', 503);
    this.#probeInFlight = true;
    return true;
  }

  #failed(probe: boolean): void {
    if (probe) this.#probeInFlight = false;
    this.#failures++;
    if (probe || this.#failures >= this.#failureThreshold) this.#openUntil = this.#now() + this.#reset;
  }

  #succeeded(): void {
    this.#failures = 0;
    this.#openUntil = 0;
    this.#probeInFlight = false;
  }
}
