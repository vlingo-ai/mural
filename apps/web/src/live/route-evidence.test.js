import { describe, expect, it } from 'vitest';
import { resolveMediaRoute } from '../../media-tests/route-evidence.js';

const local = { port: 12345, protocol: 'udp', address: 'redacted-ip.invalid' };
const remote = { port: 17882, protocol: 'udp', address: 'redacted-ip.invalid' };
const pair = { local: { ...local, address: '127.0.0.1' }, remote: { ...remote, address: '127.0.0.1' } };
describe('selected ICE address evidence', () => {
  it('resolves nonempty redaction through the matching native pair', () => {
    expect(resolveMediaRoute(local, remote, [pair])).toMatchObject({ localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' });
  });
  it('uses valid stats without native evidence', () => {
    expect(resolveMediaRoute(pair.local, pair.remote, [])?.remoteAddress).toBe('127.0.0.1');
  });
  it.each(['', 'redacted-ip.invalid', 'peer.local', '999.0.0.1'])('does not invent address for %s', address => {
    expect(resolveMediaRoute(local, { ...remote, address }, [])?.remoteAddress).toBeUndefined();
  });
  it.each(['local', 'remote'])('rejects mismatched %s port', side => {
    const mismatch = { ...pair, [side]: { ...pair[side], port: 9999 } };
    expect(resolveMediaRoute(local, remote, [mismatch])?.remoteAddress).toBeUndefined();
  });
  it.each(['local', 'remote'])('rejects mismatched %s protocol', side => {
    const mismatch = { ...pair, [side]: { ...pair[side], protocol: 'tcp' } };
    expect(resolveMediaRoute(local, remote, [mismatch])?.remoteAddress).toBeUndefined();
  });
  it('fails on conflicting valid addresses rather than choosing loopback', () => {
    expect(() => resolveMediaRoute(local, { ...remote, address: '192.0.2.9' }, [pair])).toThrow('Conflicting');
  });
  it('preserves a non-loopback address for the strict caller to reject', () => {
    expect(resolveMediaRoute(local, { ...remote, address: '192.0.2.9' }, [])?.remoteAddress).toBe('192.0.2.9');
  });
  it('fails closed on absent candidates and invalid ports', () => {
    expect(resolveMediaRoute(undefined, remote, [])).toBeNull();
    expect(resolveMediaRoute({ ...local, port: 0 }, remote, [pair])).toBeNull();
  });
});
