import { ServiceError } from './errors.js';

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function webOrigins(value: string | undefined): ReadonlySet<string> {
  const result = new Set<string>();
  for (const candidate of (value ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
    let url: URL;
    try { url = new URL(candidate); } catch { throw new Error('MURAL_WEB_ALLOWED_ORIGINS contains an invalid origin.'); }
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') ||
        !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !loopback.has(url.hostname)))
      throw new Error('MURAL_WEB_ALLOWED_ORIGINS requires HTTPS or exact loopback origins.');
    result.add(url.origin);
  }
  return result;
}

export function assertWebPreflight(method: string | undefined, headers: string | undefined): void {
  if (!['GET', 'POST', 'DELETE'].includes(method ?? '')) throw new ServiceError('cors_preflight_denied', 403);
  const requested = (headers ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set(['authorization', 'content-type', 'idempotency-key']);
  if (requested.some(value => !allowed.has(value))) throw new ServiceError('cors_preflight_denied', 403);
}
