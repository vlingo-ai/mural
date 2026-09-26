import { createHash } from 'node:crypto';
import { ServiceError } from '../errors.js';
import { boundedJSON } from '../live-provider.js';
import type {
  HostedResponsesContext,
  HostedResponsesRequest,
  HostedResponsesTransport,
} from '../hosted-helpers.js';
import { ModelGatewayClient } from './client.js';
import { HOSTED_HELPER_MODEL } from '../hosted-helpers.js';

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
  readonly #client: ModelGatewayClient;

  constructor(client: ModelGatewayClient) { this.#client = client; }

  async send(body: HostedResponsesRequest, signal: AbortSignal, context: HostedResponsesContext,
    onText?: (text: string) => void): Promise<unknown> {
    const model = logicalModel(body, context.purpose);
    try {
      const response = await this.#client.request('/v1/responses', {
        method: 'POST', signal,
        headers: { Authorization: this.#client.authorization, 'Content-Type': 'application/json',
          'Idempotency-Key': context.requestID },
        body: JSON.stringify({ model, input: body.input, instructions: body.instructions,
          max_output_tokens: body.max_output_tokens, reasoning: body.reasoning,
          tools: body.tools?.map(tool => ({ type: tool.type })) ?? [],
          output_format: body.text?.format ?? { type: 'text' }, store: false,
          metadata: { request_id: context.requestID } }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      const result = this.#legacyResponse(await boundedJSON(response, 1_048_576), model);
      if (onText) {
        const message = result.output.find(item => item.type === 'message');
        const text = message?.content[0]?.text;
        if (typeof text === 'string' && text) onText(text);
      }
      return result;
    } catch { throw new ServiceError('hosted_helper_provider_unavailable', 502); }
  }

  #legacyResponse(raw: unknown, model: string) {
    if (!object(raw) || raw.object !== 'gateway.response' || raw.model !== model || typeof raw.id !== 'string' ||
        !raw.id || Buffer.byteLength(raw.id) > 256 || !['completed', 'incomplete', 'failed'].includes(raw.status) ||
        !object(raw.provider) || raw.provider.name !== 'openai' || raw.provider.model !== HOSTED_HELPER_MODEL ||
        !object(raw.usage) || !integer(raw.usage.input_tokens) || !integer(raw.usage.cached_input_tokens) ||
        !integer(raw.usage.cache_write_input_tokens) || !integer(raw.usage.output_tokens) ||
        !integer(raw.usage.web_search_calls, 100) || raw.usage.cached_input_tokens + raw.usage.cache_write_input_tokens > raw.usage.input_tokens ||
        !Array.isArray(raw.sources) || raw.sources.length > 12) throw new Error();
    const output: any[] = Array.from({ length: raw.usage.web_search_calls }, () => ({ type: 'web_search_call' as const }));
    const text = raw.output_text ?? (raw.output_json === undefined || raw.output_json === null ? undefined : JSON.stringify(raw.output_json));
    if (text !== undefined) {
      if (typeof text !== 'string') throw new Error();
      const annotations = raw.sources.map((source: unknown) => {
        if (!object(source) || typeof source.title !== 'string' || typeof source.url !== 'string') throw new Error();
        return { type: 'url_citation', title: source.title, url: source.url };
      });
      output.push({ type: 'message' as const, content: [{ type: 'output_text' as const, text, annotations }] } as any);
    }
    return { id: `resp_gateway_${createHash('sha256').update(raw.id).digest('base64url')}`, model: HOSTED_HELPER_MODEL,
      status: raw.status, usage: { input_tokens: raw.usage.input_tokens, input_tokens_details: {
        cached_tokens: raw.usage.cached_input_tokens, cache_write_tokens: raw.usage.cache_write_input_tokens },
      output_tokens: raw.usage.output_tokens }, output };
  }
}
