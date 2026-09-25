import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { parseHostedHelperInput } from '../src/hosted-helpers.js';

const contractURL = new URL('../../../shared/contracts/mural-api.openapi.json', import.meta.url);
const loadContract = async () => JSON.parse(await readFile(contractURL, 'utf8')) as Record<string, any>;

test('shared native wire fixtures agree with OpenAPI validation', async () => {
  const require = createRequire(import.meta.url), Ajv = require('ajv/dist/2020.js').default;
  const ajv = new Ajv({ strict: false }); require('ajv-formats')(ajv);
  const contract = await loadContract();
  const rows = JSON.parse(await readFile(new URL('../../../shared/contracts/tests/live-wire-fixtures.json', import.meta.url), 'utf8'));
  for (const row of rows) {
    const validate = ajv.compile({ $ref: `#/components/schemas/${row.schema}`, components: contract.components });
    assert.equal(validate(row.value), row.valid, `${row.schema}: ${JSON.stringify(validate.errors)}`);
  }
});

test('public contract freezes the Web/iOS/Android product boundary', async () => {
  const contract = await loadContract();
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.version, '1.0.0');
  assert.deepEqual(Object.keys(contract.paths).sort(), [
    '/v1/conversations',
    '/v1/conversations/{sessionID}',
    '/v1/conversations/{sessionID}/events',
    '/v1/live/capabilities',
    '/v1/live/requests/{requestID}',
    '/v1/live/sessions',
    '/v1/live/sessions/current',
    '/v1/live/sessions/{sessionID}',
    '/v1/live/sessions/{sessionID}/close',
    '/v1/live/sessions/{sessionID}/helpers',
    '/v1/model-tasks',
  ]);

  const schemas = contract.components.schemas;
  assert.equal(schemas.ConversationEventInput.additionalProperties, false);
  assert.deepEqual(schemas.ConversationEventInput.properties.source.enum, ['live', 'typed']);
  assert.deepEqual(schemas.ConversationSummary.properties.language.type, ['string', 'null']);
  assert.equal(schemas.ConversationSummary.properties.language.maxLength, 32);
  assert.equal(schemas.LiveSessionCreateRequest.additionalProperties, false);
  assert.equal(schemas.LiveSessionCreateRequest.properties.transport, undefined);
  assert.deepEqual(schemas.LiveSessionCreateRequest.required, ['language']);
  assert.equal(schemas.LiveSessionCreateRequest.properties.sdp.pattern, '^v=0');
  assert.equal(schemas.LiveSessionCreateRequest.properties.instructions.deprecated, true);
  assert.deepEqual(schemas.LiveTransport.oneOf.map((item: { $ref: string }) => item.$ref),
    ['#/components/schemas/LiveWebRTCTransport', '#/components/schemas/LiveKitRoomTransport']);
  assert.equal(schemas.ModelTaskRequest.discriminator.propertyName, 'kind');
  assert.deepEqual(schemas.LiveSessionFunding.required, ['type', 'sessionID']);
  assert.equal(schemas.LiveSessionFunding.properties.type.const, 'liveSession');
  for (const name of ['TranslationTask', 'AssessmentTask', 'TeachingReplyTask'])
    assert.equal(schemas[name].properties.funding.$ref, '#/components/schemas/LiveSessionFunding');
  assert.deepEqual(schemas.AccountAIValueFunding.required, ['type']);
  assert.equal(schemas.AccountAIValueFunding.properties.type.const, 'account');
  assert.deepEqual(schemas.TopicSearchTask.properties.funding.oneOf.map((item: { $ref: string }) => item.$ref), [
    '#/components/schemas/LiveSessionFunding', '#/components/schemas/AccountAIValueFunding',
  ]);
  assert.equal(schemas.AssessmentTask.properties.context.$ref, '#/components/schemas/TaskConversationContext');
  assert.equal(schemas.AssessmentTask.properties.passage.$ref, '#/components/schemas/AssessmentPassage');
  assert.deepEqual(
    schemas.ModelTaskRequest.oneOf.map((item: { $ref: string }) => item.$ref),
    [
      '#/components/schemas/TranslationTask',
      '#/components/schemas/AssessmentTask',
      '#/components/schemas/TeachingReplyTask',
      '#/components/schemas/TopicSearchTask',
    ],
  );
  assert.deepEqual(Object.keys(schemas.ModelTaskResult.discriminator.mapping).sort(), [
    'assessment',
    'teachingReply',
    'topicSearch',
    'translation',
  ]);
});

test('helper JSON and SSE schemas preserve compatibility and purpose constraints', async () => {
  const contract = await loadContract(), require = createRequire(import.meta.url);
  const Ajv = require('ajv/dist/2020.js').default, ajv = new Ajv({ strict: false });
  require('ajv-formats')(ajv);
  const compile = (name: string) => ajv.compile({ $ref: `#/components/schemas/${name}`, components: contract.components });
  const request = compile('HostedHelperRequest'), event = compile('HostedHelperStreamEvent');
  const input = { requestID: '00000000-0000-4000-8000-000000000001', purpose: 'meaning', instructions: 'Translate.', input: 'Hello.' };
  assert.equal(request(input), true); assert.doesNotThrow(() => parseHostedHelperInput(input));
  for (const invalid of [{ ...input, search: true }, { ...input, purpose: 'assessment' },
    { ...input, schema: {} }, { ...input, provider: 'custom' }]) {
    assert.equal(request(invalid), false);
    assert.throws(() => parseHostedHelperInput(invalid));
  }
  const result = { requestID: input.requestID, text: 'Synthetic.', sources: [],
    usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, searchCalls: 0 },
    costNanoUSD: '1400', rateVersion: 'fixture' };
  assert.equal(compile('HostedHelperResult')(result), true);
  for (const value of [{ type: 'mural.meaning.delta', delta: 'Synthetic.' },
    { type: 'mural.meaning.completed', result }, { type: 'mural.meaning.error', code: 'helper_response_uncertain', reference: 'fixture' }])
    assert.equal(event(value), true, JSON.stringify(event.errors));
  assert.equal(event({ type: 'mural.meaning.completed' }), false);
  assert.equal(event({ type: 'unknown', delta: '' }), false);
  const content = contract.paths['/v1/live/sessions/{sessionID}/helpers'].post.responses['200'].content;
  assert.equal(content['text/event-stream'].schema.type, 'string');
  assert.equal(content['application/json'].schema.$ref, '#/components/schemas/HostedHelperResult');
});

test('public contract cannot accept provider configuration; prompt compatibility is explicitly deprecated', async () => {
  const serialized = JSON.stringify(await loadContract()).toLowerCase();
  for (const forbidden of [
    'api_key',
    'apikey',
    'provider_session',
    'openai',
    'gpt-',
    '/volumes/',
    '/users/',
  ]) assert.equal(serialized.includes(forbidden), false, `contract leaked ${forbidden}`);
});

test('Live schemas validate transport, billing and nullable-current fixtures and reject stale wire shapes', async () => {
  const contract = await loadContract();
  const require = createRequire(import.meta.url);
  const Ajv = require('ajv/dist/2020.js').default;
  const ajv = new Ajv({ strict: false });
  require('ajv-formats')(ajv);
  const validate = ajv.compile({ $ref: '#/components/schemas/LiveSession', components: contract.components });
  const live = { sessionID: '00000000-0000-4000-8000-000000000001',
    transport: { type: 'livekit-room', url: 'wss://example.invalid', token: 'synthetic-room-token' },
    deadline: '2026-09-25T00:00:00Z', rateVersion: 'fixture', experimental: true,
    fundingMode: 'minutes', reservedMilliseconds: 60000, billingBasis: 'connected-conversation-time',
    minimumChargeMilliseconds: 15000, billingPolicy: 'connected-time-15s-minimum-v1' };
  assert.equal(validate(live), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...live, sessionID: 'invalid-uuid' }), false);
  assert.equal(validate({ ...live, deadline: 'invalid-date' }), false);
  assert.equal(validate({ ...live, transport: { ...live.transport, url: 'not a uri' } }), false);
  assert.equal(validate({ ...live, transport: { type: 'webrtc', sdp: 'v=0' }, sdp: 'v=0' }), true);
  assert.equal(validate({ ...live, state: 'active' }), false, 'create does not return state');
  assert.equal(validate({ ...live, transport: { type: 'livekit-room', url: 'wss://example.invalid' } }), false);
  assert.equal(validate({ ...live, providerSessionID: 'private' }), false);
  const request = ajv.compile({ $ref: '#/components/schemas/LiveSessionCreateRequest', components: contract.components });
  assert.equal(request({ language: 'en' }), true);
  assert.equal(request({ language: 'en', sdp: 'v=0', requestedMilliseconds: 60000 }), true);
  assert.equal(request({ language: 'en', transport: { type: 'webrtc', sdp: 'v=0' } }), false);
  assert.equal(request({ language: 'en', requestedMilliseconds: 59999 }), false);
  const current = ajv.compile({ $ref: '#/components/schemas/CurrentLiveSession', components: contract.components });
  assert.equal(current({ session: null }), true);
  assert.equal(current({ session: { sessionID: live.sessionID, state: 'closed', deadline: live.deadline,
    observedMilliseconds: 0, providerCostNanoUSD: null, chargedMilliseconds: null } }), true);
  assert.equal(current({ session: {} }), false);
  assert.deepEqual(contract.paths['/v1/live/capabilities'].get.security, [{}, { bearerAuth: [] }]);
});

test('mutating public operations require authentication and idempotency where needed', async () => {
  const contract = await loadContract();
  assert.deepEqual(contract.security, [{ bearerAuth: [] }]);
  assert.equal(contract.components.securitySchemes.bearerAuth.scheme, 'bearer');

  for (const path of ['/v1/live/sessions', '/v1/model-tasks']) {
    const parameters = contract.paths[path].post.parameters as Array<{ $ref: string }>;
    assert.equal(parameters.some(parameter => parameter.$ref.endsWith('/IdempotencyKey')), true);
  }
});
