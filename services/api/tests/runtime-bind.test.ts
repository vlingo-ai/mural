import assert from 'node:assert/strict';
import test from 'node:test';
import { bindHostFromEnvironment } from '../src/runtime-bind.js';

test('keeps the existing all-interface default', () => {
  assert.equal(bindHostFromEnvironment({}), '0.0.0.0');
});

test('allows an exact loopback bind for a host-network deployment', () => {
  assert.equal(bindHostFromEnvironment({ MURAL_BIND_HOST: '127.0.0.1' }), '127.0.0.1');
  assert.equal(bindHostFromEnvironment({ MURAL_BIND_HOST: '::1' }), '::1');
});

test('rejects hostnames and arbitrary addresses', () => {
  assert.throws(() => bindHostFromEnvironment({ MURAL_BIND_HOST: 'api' }), /service_configuration_invalid/);
  assert.throws(() => bindHostFromEnvironment({ MURAL_BIND_HOST: '192.0.2.10' }), /service_configuration_invalid/);
});
