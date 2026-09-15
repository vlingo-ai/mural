import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contractURL = new URL('../../../shared/contracts/mural-api.openapi.json', import.meta.url);
const loadContract = async () => JSON.parse(await readFile(contractURL, 'utf8')) as Record<string, any>;

test('public contract freezes the Web/iOS/Android product boundary', async () => {
  const contract = await loadContract();
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.version, '1.0.0');
  assert.deepEqual(Object.keys(contract.paths).sort(), [
    '/v1/live/sessions',
    '/v1/live/sessions/{sessionID}',
    '/v1/live/sessions/{sessionID}/close',
    '/v1/model-tasks',
  ]);

  const schemas = contract.components.schemas;
  assert.equal(schemas.LiveSessionCreateRequest.additionalProperties, false);
  assert.equal(schemas.LiveSessionCreateRequest.properties.transport.properties.type.const, 'webrtc');
  assert.equal(schemas.ModelTaskRequest.discriminator.propertyName, 'kind');
  assert.deepEqual(schemas.LiveSessionFunding.required, ['type', 'sessionID']);
  assert.equal(schemas.LiveSessionFunding.properties.type.const, 'liveSession');
  for (const name of ['TranslationTask', 'AssessmentTask', 'TeachingReplyTask', 'TopicSearchTask'])
    assert.equal(schemas[name].properties.funding.$ref, '#/components/schemas/LiveSessionFunding');
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

test('public contract cannot accept provider configuration or client-owned prompts', async () => {
  const serialized = JSON.stringify(await loadContract()).toLowerCase();
  for (const forbidden of [
    'api_key',
    'apikey',
    'instructions',
    'provider_session',
    'openai',
    'gpt-',
    '/volumes/',
    '/users/',
  ]) assert.equal(serialized.includes(forbidden), false, `contract leaked ${forbidden}`);
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
