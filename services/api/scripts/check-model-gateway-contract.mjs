import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const lock = JSON.parse(await readFile(resolve(serverRoot, 'contracts/model-gateway.lock.json'), 'utf8'));
const contractDirectory = process.argv[2];
const profileName = process.argv[3] ?? 'responses';
assert.ok(Object.hasOwn(lock.profiles, profileName), `Unknown contract profile: ${profileName}`);
assert.ok(process.argv.length <= 4, 'Pass only the contract directory and optional profile.');
const profile = lock.profiles[profileName];
const required = name => [...(lock[name] ?? []), ...(profile[name] ?? [])];

if (!contractDirectory) {
  throw new Error('Pass the Model Gateway contracts directory as the first argument.');
}

const loadJSON = async relativePath => JSON.parse(
  await readFile(resolve(contractDirectory, relativePath), 'utf8'),
);

const openapi = await loadJSON('openapi.json');
const schemas = openapi.components?.schemas ?? {};
const capabilitySchema = schemas.ModelGatewayCapabilities?.properties ?? {};

assert.equal(capabilitySchema.protocol?.const, lock.protocol);
assert.equal(capabilitySchema.protocol_version?.const, lock.protocolVersion);

for (const path of required('requiredHTTPPaths')) {
  assert.ok(openapi.paths?.[path], `Missing required Model Gateway path: ${path}`);
}

for (const schema of required('requiredSchemas')) {
  assert.ok(schemas[schema], `Missing required Model Gateway schema: ${schema}`);
}

for (const field of lock.requiredResponseFields) {
  assert.ok(schemas.GatewayResponse?.properties?.[field], `Missing required GatewayResponse field: ${field}`);
}

for (const field of lock.requiredResponseUsageFields) {
  assert.ok(schemas.TokenUsage?.properties?.[field], `Missing required TokenUsage field: ${field}`);
}

for (const schemaPath of required('requiredSidebandSchemas')) {
  const schema = await loadJSON(schemaPath);
  assert.equal(typeof schema, 'object');
  assert.ok(Array.isArray(schema.oneOf), `Invalid sideband schema: ${schemaPath}`);
}

const serialized = JSON.stringify({ openapi, lock }).toLowerCase();
for (const forbidden of ['gateway_api_key', 'openai_api_key', 'bearer sk-', '/users/', '/volumes/']) {
  assert.equal(serialized.includes(forbidden), false, `Contract contains forbidden value: ${forbidden}`);
}

console.log(`Compatible Model Gateway contract ${lock.protocol}@${lock.protocolVersion} profile=${profileName}`);
