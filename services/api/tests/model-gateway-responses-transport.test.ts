import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelGatewayResponsesTransport } from '../src/model-gateway/responses-transport.js';
import type { HostedResponsesContext, HostedResponsesRequest } from '../src/hosted-helpers.js';

const key = 'synthetic-model-gateway-key-for-local-tests';
const base: HostedResponsesRequest = { model: 'gpt-5.6-luna', store: false, background: false, stream: false,
  service_tier: 'default', prompt_cache_options: { mode: 'explicit' }, instructions: 'Teach briefly.',
  input: [{ role: 'user', content: 'Hello' }], max_output_tokens: 1400, reasoning: { effort: 'low' },
  tool_choice: 'none', max_tool_calls: 1 };
const context = (purpose: HostedResponsesContext['purpose']): HostedResponsesContext =>
  ({ requestID: '12345678-1234-4234-8234-123456789abc', purpose });
const gatewayResult = (model: string) => ({ object: 'gateway.response', id: 'provider-private-response-id', status: 'completed', model,
  output_text: 'Hello there.', output_json: null, provider: { name: 'fixture', model: 'fixture-model' },
  usage: { input_tokens: 100, cached_input_tokens: 20, cache_write_input_tokens: 30,
    output_tokens: 40, reasoning_output_tokens: 5, total_tokens: 140, web_search_calls: 1 },
  sources: [{ title: 'Example', url: 'https://example.test/source' }], finish_reason: null });

test('Gateway Responses adapter maps helper purposes to logical models and preserves trusted accounting', async () => {
  const requests: Array<{ url: string; init: RequestInit; body: any }> = [];
  let nextModel = '';
  const transport = new ModelGatewayResponsesTransport('https://gateway.example.test', key, { request: (async (url, init) => {
    const body = JSON.parse(String(init?.body)); requests.push({ url: String(url), init: init!, body }); nextModel = body.model;
    return new Response(JSON.stringify(gatewayResult(nextModel)), { status: 200 });
  }) as typeof fetch });
  const cases: Array<[HostedResponsesContext['purpose'], HostedResponsesRequest, string]> = [
    ['meaning', base, 'mural.translation.fast'],
    ['lookup', base, 'mural.reasoning.default'],
    ['assessment', { ...base, text: { format: { type: 'json_schema', name: 'mural_result', strict: true,
      schema: { type: 'object' } } } }, 'mural.assessment.default'],
    ['topic', { ...base, tools: [{ type: 'web_search', search_context_size: 'low' }], tool_choice: 'auto' }, 'mural.search.default'],
  ];
  for (const [purpose, body, expected] of cases) {
    const result = await transport.send(body, new AbortController().signal, context(purpose));
    assert.equal(nextModel, expected);
    assert.match((result as any).id, /^resp_gateway_[A-Za-z0-9_-]{43}$/);
    assert.equal((result as any).id.includes('provider-private-response-id'), false);
    assert.deepEqual((result as any).usage, { input_tokens: 100,
      input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 }, output_tokens: 40 });
    assert.deepEqual((result as any).output, [{ type: 'web_search_call' }, { type: 'message', content: [{
      type: 'output_text', text: 'Hello there.', annotations: [{ type: 'url_citation', title: 'Example', url: 'https://example.test/source' }],
    }] }]);
  }
  assert.ok(requests.every(item => item.url === 'https://gateway.example.test/v1/responses'));
  assert.ok(requests.every(item => item.init.redirect === 'error' && item.init.headers &&
    (item.init.headers as Record<string, string>).Authorization === `Bearer ${key}`));
  assert.ok(requests.every(item => item.body.store === false && item.body.metadata.request_id === context('meaning').requestID));
  assert.deepEqual(requests[3]!.body.tools, [{ type: 'web_search' }]);
  assert.equal(JSON.stringify(requests).includes('search_context_size'), false);
});

test('Gateway Responses adapter maps structured output back into the existing funded pipeline', async () => {
  const transport = new ModelGatewayResponsesTransport('https://gateway.example.test', key, { request: (async () =>
    new Response(JSON.stringify({ ...gatewayResult('mural.assessment.default'), output_text: null, output_json: { score: 4 },
      usage: { ...gatewayResult('').usage, web_search_calls: 0 }, sources: [] }), { status: 200 })) as typeof fetch });
  const body = { ...base, text: { format: { type: 'json_schema' as const, name: 'mural_result' as const, strict: true as const,
    schema: { type: 'object' } } }, max_output_tokens: 2200 as const };
  const result = await transport.send(body, new AbortController().signal, context('assessment')) as any;
  assert.equal(result.output[0].content[0].text, '{"score":4}');
});

test('Gateway Responses adapter fails closed on rejection and malformed accounting without retaining bodies', async () => {
  for (const response of [new Response(`private failure ${key}`, { status: 503 }),
    new Response(JSON.stringify({ ...gatewayResult('mural.reasoning.default'), usage: { input_tokens: -1 } }), { status: 200 })]) {
    const transport = new ModelGatewayResponsesTransport('https://gateway.example.test', key,
      { request: (async () => response) as typeof fetch });
    await assert.rejects(transport.send(base, new AbortController().signal, context('help')), error => {
      assert.equal((error as { code: string }).code, 'hosted_helper_provider_unavailable');
      assert.equal(String(error).includes(key), false); return true;
    });
  }
});

test('Gateway Responses adapter rejects unsafe destinations and credentials', () => {
  for (const [origin, credential] of ([['not a URL', key], ['http://gateway.internal:8000', key],
    ['https://user@gateway.example.test', key], ['https://gateway.example.test/path', key],
    ['https://gateway.example.test', 'short']] as Array<[string, string]>))
    assert.throws(() => new ModelGatewayResponsesTransport(origin, credential), { code: 'model_gateway_configuration_invalid' });
});
