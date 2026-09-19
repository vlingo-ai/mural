import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelGatewayClient } from '../src/model-gateway/client.js';

const key = 'synthetic-model-gateway-key-for-local-tests';

test('Gateway client validates health without sending its credential to the public endpoint', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new ModelGatewayClient('https://gateway.example.test', key, { request: (async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ status: 'ok', service: 'DeepTutor Model Gateway', version: '0.1.0' });
  }) as typeof fetch });
  await client.checkHealth();
  assert.equal(requests[0]?.url, 'https://gateway.example.test/healthz');
  assert.equal((requests[0]?.init?.headers as Record<string, string> | undefined)?.Authorization, undefined);
});

test('Gateway client opens after consecutive availability failures and closes after a successful probe', async () => {
  let now = 1_000, attempts = 0, healthy = false;
  const client = new ModelGatewayClient('https://gateway.example.test', key, {
    failureThreshold: 2, resetMilliseconds: 1_000, now: () => now,
    request: (async () => { attempts++; return new Response(null, { status: healthy ? 204 : 503 }); }) as typeof fetch,
  });
  assert.equal((await client.request('/v1/responses')).status, 503);
  assert.equal((await client.request('/v1/responses')).status, 503);
  await assert.rejects(client.request('/v1/responses'), { code: 'model_gateway_circuit_open' });
  assert.equal(attempts, 2);
  now += 1_000; healthy = true;
  assert.equal((await client.request('/v1/responses')).status, 204);
  healthy = false;
  assert.equal((await client.request('/v1/responses')).status, 503);
  assert.equal(attempts, 4);
});

test('Gateway client rejects unsafe destinations, credentials, and bounds', () => {
  for (const [origin, credential] of ([['not a URL', key], ['http://gateway.internal:8000', key],
    ['https://user@gateway.example.test', key], ['https://gateway.example.test/path', key],
    ['https://gateway.example.test', 'short']] as Array<[string, string]>))
    assert.throws(() => new ModelGatewayClient(origin, credential), { code: 'model_gateway_configuration_invalid' });
  assert.throws(() => new ModelGatewayClient('https://gateway.example.test', key, { failureThreshold: 0 }),
    { code: 'model_gateway_configuration_invalid' });
});

test('Gateway client does not count caller cancellation as an availability failure', async () => {
  const controller = new AbortController();
  const client = new ModelGatewayClient('https://gateway.example.test', key, {
    failureThreshold: 1,
    request: (async (_url, init) => {
      controller.abort();
      throw (init?.signal as AbortSignal).reason;
    }) as typeof fetch,
  });
  await assert.rejects(client.request('/v1/responses', { signal: controller.signal }));
  await assert.rejects(client.request('/v1/responses', { signal: controller.signal }), error => {
    assert.notEqual((error as { code?: string }).code, 'model_gateway_circuit_open');
    return true;
  });
});
