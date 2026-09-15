import { createHash } from 'node:crypto';
import { ServiceError } from '../errors.js';
import { boundedJSON } from '../live-provider.js';
import type {
  HostedResponsesContext,
  HostedResponsesRequest,
  HostedResponsesTransport,
} from '../hosted-helpers.js';

type GatewayResponsesOptions = { request?: typeof fetch };
type JSONRecord = Record<string, any>;

const object = (value: unknown): value is JSONRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, maximum = 100_000_000): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

const logicalModel = (body: HostedResponsesRequest, purpose: HostedResponsesContext['purpose']) => {
  if (body.tools?.length) return 'mural.search.default';
  if (body.text) return 'mural.assessment.default';
  if (purpose === 'meaning') return 'mural.translation.fast';
  return 'mural.reasoning.default';
};

/** One-shot provider-neutral Responses transport for Mural's existing funded helper pipeline. */
export class ModelGatewayResponsesTransport implements HostedResponsesTransport {
  readonly #origin: URL;
  readonly #key: string;
  readonly #request: typeof fetch;

  constructor(origin: string, key: string, options: GatewayResponsesOptions = {}) {
    try { this.#origin = new URL(origin); }
    catch { throw new ServiceError('model_gateway_configuration_invalid', 503); }
    const local = this.#origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(this.#origin.hostname);
    if ((this.#origin.protocol !== 'https:' && !local) || this.#origin.username || this.#origin.password ||
        this.#origin.search || this.#origin.hash || !['', '/'].includes(this.#origin.pathname) ||
        !/^[\x21-\x7e]{32,512}$/.test(key)) throw new ServiceError('model_gateway_configuration_invalid', 503);
    this.#key = key;
    this.#request = options.request ?? fetch;
  }

  async send(body: HostedResponsesRequest, signal: AbortSignal, context: HostedResponsesContext): Promise<unknown> {
    const model = logicalModel(body, context.purpose);
    try {
      const response = await this.#request(new URL('/v1/responses', this.#origin), {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.#key}`, 'Content-Type': 'application/json',
          'Idempotency-Key': context.requestID },
        body: JSON.stringify({ model, input: body.input, instructions: body.instructions,
          max_output_tokens: body.max_output_tokens, reasoning: body.reasoning,
          tools: body.tools?.map(tool => ({ type: tool.type })) ?? [],
          output_format: body.text?.format ?? { type: 'text' }, store: false,
          metadata: { request_id: context.requestID } }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      return this.#legacyResponse(await boundedJSON(response, 1_048_576), model);
    } catch { throw new ServiceError('hosted_helper_provider_unavailable', 502); }
  }

  #legacyResponse(raw: unknown, model: string): unknown {
    if (!object(raw) || raw.object !== 'gateway.response' || raw.model !== model || typeof raw.id !== 'string' ||
        !raw.id || Buffer.byteLength(raw.id) > 256 || !['completed', 'incomplete', 'failed'].includes(raw.status) ||
        !object(raw.provider) || typeof raw.provider.name !== 'string' || typeof raw.provider.model !== 'string' ||
        !object(raw.usage) || !integer(raw.usage.input_tokens) || !integer(raw.usage.cached_input_tokens) ||
        !integer(raw.usage.cache_write_input_tokens) || !integer(raw.usage.output_tokens) ||
        !integer(raw.usage.web_search_calls, 100) || raw.usage.cached_input_tokens + raw.usage.cache_write_input_tokens > raw.usage.input_tokens ||
        !Array.isArray(raw.sources) || raw.sources.length > 12) throw new Error();
    const output = Array.from({ length: raw.usage.web_search_calls }, () => ({ type: 'web_search_call' as const }));
    const text = raw.output_text ?? (raw.output_json === undefined || raw.output_json === null ? undefined : JSON.stringify(raw.output_json));
    if (text !== undefined) {
      if (typeof text !== 'string') throw new Error();
      const annotations = raw.sources.map((source: unknown) => {
        if (!object(source) || typeof source.title !== 'string' || typeof source.url !== 'string') throw new Error();
        return { type: 'url_citation', title: source.title, url: source.url };
      });
      output.push({ type: 'message' as const, content: [{ type: 'output_text' as const, text, annotations }] } as any);
    }
    return { id: `resp_gateway_${createHash('sha256').update(raw.id).digest('base64url')}`, model: 'gpt-5.6-luna',
      status: raw.status, usage: { input_tokens: raw.usage.input_tokens, input_tokens_details: {
        cached_tokens: raw.usage.cached_input_tokens, cache_write_tokens: raw.usage.cache_write_input_tokens },
      output_tokens: raw.usage.output_tokens }, output };
  }
}
