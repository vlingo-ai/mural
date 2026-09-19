import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from '../src/db.js';
import { createApp } from '../src/app.js';
import { webOrigins } from '../src/web-cors.js';

test('web origins accept exact HTTPS or loopback origins only', () => {
  assert.deepEqual([...webOrigins('https://mural.example, http://127.0.0.1:5173')],
    ['https://mural.example', 'http://127.0.0.1:5173']);
  for (const value of ['*', 'http://mural.example', 'https://user:password@mural.example', 'https://mural.example/path'])
    assert.throws(() => webOrigins(value));
});

test('allowed web preflight is bounded and actual failures retain CORS diagnostics', async () => {
  const origin = 'http://127.0.0.1:5173';
  const app = createApp({ db: {} as Database, auth: {}, webOrigins: webOrigins(origin) });
  try {
    const preflight = await app.inject({ method: 'OPTIONS', url: '/v1/live/sessions', headers: {
      origin, 'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type, idempotency-key',
    } });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    assert.equal(preflight.headers['access-control-allow-credentials'], undefined);
    assert.equal(preflight.headers['access-control-max-age'], '600');

    const failure = await app.inject({ method: 'POST', url: '/v1/live/sessions', headers: { origin }, payload: {} });
    assert.equal(failure.statusCode, 503);
    assert.equal(failure.headers['access-control-allow-origin'], origin);
    assert.match(String(failure.headers['x-mural-error-reference']), /^[a-f0-9]{12}$/);

    const denied = await app.inject({ method: 'OPTIONS', url: '/v1/live/sessions', headers: {
      origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'cookie',
    } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error.code, 'cors_preflight_denied');
  } finally { await app.close(); }
});

test('unknown browser origins are rejected without reflection', async () => {
  const app = createApp({ db: {} as Database, auth: {}, webOrigins: webOrigins('https://mural.example') });
  try {
    const response = await app.inject({ method: 'OPTIONS', url: '/v1/live/sessions', headers: {
      origin: 'https://attacker.example', 'access-control-request-method': 'POST',
    } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal(response.json().error.code, 'cors_origin_denied');
  } finally { await app.close(); }
});
