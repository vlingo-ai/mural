import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/check-model-gateway-contract.mjs', import.meta.url));
const lock = JSON.parse(await readFile(new URL('../contracts/model-gateway.lock.json', import.meta.url), 'utf8'));

test('Gateway profile separates Responses requirements from legacy Live without weakening shared checks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mural-contract-'));
  const run = (profile?: string) => spawnSync(process.execPath, [script, directory, ...(profile ? [profile] : [])], { encoding: 'utf8' });
  const schemas: Record<string, any> = Object.fromEntries(lock.requiredSchemas.map((name: string) => [name, {}]));
  schemas.ModelGatewayCapabilities = { properties: { protocol: { const: lock.protocol }, protocol_version: { const: lock.protocolVersion } } };
  schemas.GatewayResponse = { properties: { sources: {} } };
  schemas.TokenUsage = { properties: Object.fromEntries(lock.requiredResponseUsageFields.map((name: string) => [name, {}])) };
  const contract = { paths: Object.fromEntries(lock.requiredHTTPPaths.map((path: string) => [path, {}])), components: { schemas } };
  const save = () => writeFile(join(directory, 'openapi.json'), JSON.stringify(contract));
  try {
    await save();
    assert.equal(run().status, 0, 'Responses-only contract must not need Live schemas or event files');
    assert.equal(run('responses').status, 0);
    assert.notEqual(run('legacy-live').status, 0);
    assert.notEqual(run('typo').status, 0);
    assert.notEqual(run('toString').status, 0);
    delete contract.paths['/v1/responses'];
    await save();
    assert.notEqual(run().status, 0, 'Responses endpoint remains mandatory');
    contract.paths['/v1/responses'] = {};
    delete schemas.TokenUsage.properties.web_search_calls;
    await save();
    assert.notEqual(run().status, 0, 'Usage requirements remain mandatory');
    schemas.TokenUsage.properties.web_search_calls = {};
    contract.paths['/v1/live/sessions'] = {};
    schemas.LiveSessionCreateRequest = {};
    schemas.LiveSessionResponse = {};
    await save();
    assert.notEqual(run('legacy-live').status, 0, 'Legacy profile still needs event files');
    await mkdir(join(directory, 'events'));
    for (const path of lock.profiles['legacy-live'].requiredSidebandSchemas) {
      await writeFile(join(directory, path), JSON.stringify({ oneOf: [{ type: 'object' }] }));
    }
    assert.equal(run('legacy-live').status, 0);
    schemas.ModelGatewayCapabilities.properties.protocol.const = 'wrong';
    await save();
    assert.notEqual(run().status, 0, 'Protocol identity remains mandatory');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
