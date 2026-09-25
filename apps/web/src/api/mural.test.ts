import { describe, expect, it, vi } from 'vitest';
import { MuralAPI, MuralAPIError } from './mural';

describe('MuralAPI', () => {
  it('reads session status with bearer, encoded identity and bounded request', async () => {
    const send = vi.fn(async (input, init) => {
      expect(String(input)).toBe('https://api.example.test/v1/live/sessions/session%2F1');
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-session');
      return new Response(JSON.stringify({ sessionID: 'session/1', state: 'closed' }));
    });
    const status = await new MuralAPI('https://api.example.test', () => 'test-session', send as typeof fetch)
      .liveSessionStatus('session/1');
    expect(status.state).toBe('closed');
  });
  it('binds bearer and idempotency to the configured origin', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const send: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return new Response(JSON.stringify({ sessionID: crypto.randomUUID(), transport: { type: 'webrtc', sdp: 'v=0' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    const api = new MuralAPI('https://api.example.test/', () => 'test-session', send);
    await api.createLiveSession({ sdp: 'v=0', language: 'en' }, 'request-123');
    const [url, init] = calls[0]!;
    expect(String(url)).toBe('https://api.example.test/v1/live/sessions');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-session');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('request-123');
  });

  it('does not expose server bodies and retains a safe support reference', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'hosted_voice_not_ready', detail: 'private' } }), {
      status: 503, headers: { 'content-type': 'application/json', 'x-mural-error-reference': 'abc123abc123' },
    }));
    const api = new MuralAPI('http://127.0.0.1:8080', () => 'test-session', send as typeof fetch);
    await expect(api.createLiveSession({ sdp: 'private', language: 'en' }, 'request-123')).rejects.toEqual(
      new MuralAPIError('hosted_voice_not_ready', 503, 'abc123abc123'),
    );
  });

  it('rejects insecure non-loopback origins before a request', () => {
    expect(() => new MuralAPI('http://api.example.test', () => 'token')).toThrow(/HTTPS/);
    expect(() => new MuralAPI('https://user:secret@api.example.test', () => 'token')).toThrow(/HTTPS/);
  });

  it('creates authentication challenges without sending an authorization header', async () => {
    const send = vi.fn(async (_input, init) => {
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      return new Response(JSON.stringify({ challengeID: crypto.randomUUID(), nonce: 'nonce', expiresInSeconds: 300 }), { status: 200 });
    });
    await new MuralAPI('https://api.example.test', () => undefined, send as typeof fetch).createAuthChallenge();
    expect(send).toHaveBeenCalledOnce();
  });

  it('uses authenticated GET without a request body for server history', async () => {
    const send = vi.fn(async (_input, init) => {
      expect(init?.method).toBe('GET'); expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-session');
      return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
    });
    await new MuralAPI('https://api.example.test', () => 'test-session', send as typeof fetch).conversations();
  });
});
