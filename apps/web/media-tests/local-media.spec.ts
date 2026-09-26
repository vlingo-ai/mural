import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// LiveKit --dev credentials only. Never load staging .env or provider keys.
function token(identity: string, room: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'devkey', sub: identity, nbf: now - 5, exp: now + 120,
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true },
  })}`;
  return `${body}.${createHmac('sha256', 'secret').update(body).digest('base64url')}`;
}

test('real SDK transports synthetic audio both ways and releases tracks on Stop', async ({ browser }) => {
  const context = await browser.newContext();
  const external: string[] = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  await context.routeWebSocket(/.*/, socket => {
    if (new URL(socket.url()).hostname !== '127.0.0.1') {
      external.push(new URL(socket.url()).origin);
      return socket.close();
    }
    socket.connectToServer();
  });
  const a = await context.newPage(), b = await context.newPage();
  try {
    await Promise.all([a.goto('http://127.0.0.1:15173/media-tests/peer.html'), b.goto('http://127.0.0.1:15173/media-tests/peer.html')]);
    await Promise.all([a.waitForFunction(() => !!(window as any).mediaFixture), b.waitForFunction(() => !!(window as any).mediaFixture)]);
    const room = `b5-${randomUUID()}`;
    await a.evaluate(t => (window as any).mediaFixture.connect(t), token('learner', room));
    await b.evaluate(t => (window as any).mediaFixture.connect(t), token('synthetic-agent', room));
    for (const page of [a, b]) {
      await expect.poll(() => page.evaluate(() => (window as any).mediaFixture.rms()), { timeout: 15_000 }).toBeGreaterThan(0.01);
      const diagnostics = await page.evaluate(() => (window as any).mediaFixture.diagnostics());
      // Decoded energy is asserted through Web Audio above; muted playback can
      // leave Chrome's inbound totalAudioEnergy at zero despite nonzero RMS.
      expect(diagnostics.inbound.some((s: any) => s.packets > 0 && s.bytes > 0)).toBe(true);
      expect(diagnostics.selectedRemoteLoopback.length).toBeGreaterThan(0);
      expect(diagnostics.selectedRemoteLoopback.every(Boolean)).toBe(true);
    }
    // Negative control: receiver energy must follow the OTHER peer, not its own oscillator.
    await a.evaluate(() => (window as any).mediaFixture.setTone(false));
    await expect.poll(() => b.evaluate(() => (window as any).mediaFixture.rms())).toBeLessThan(0.001);
    await a.evaluate(() => (window as any).mediaFixture.setTone(true));
    await expect.poll(() => b.evaluate(() => (window as any).mediaFixture.rms())).toBeGreaterThan(0.01);
    for (const page of [a, b]) {
      expect(await page.evaluate(() => (window as any).mediaFixture.stop())).toEqual({ state: 'disconnected', tracksEnded: true });
    }
    expect(external).toEqual([]);
  } catch (error) {
    for (const page of [a, b]) console.log(await page.evaluate(() => ({
      rtc: (window as any).rtcDiagnostics?.(),
    })));
    throw error;
  } finally { await context.close(); }
});

const scenarios = ['baseline', 'recover-signal', 'stop-during-recovery', 'detach-uplink', 'detach-downlink'];
if (process.env.MEDIA_NETWORK_FAULTS === '1') scenarios.push('udp-uplink-loss');
for (const scenario of scenarios) test(`Mural LiveConnection real audio: ${scenario}`, async ({ browser }) => {
  const context = await browser.newContext();
  const external: string[] = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.origin); return route.abort();
  });
  await context.routeWebSocket(/.*/, socket => {
    if (new URL(socket.url()).hostname === '127.0.0.1') return void socket.connectToServer();
    external.push(new URL(socket.url()).origin); socket.close();
  });
  try {
    const learner = await context.newPage(), agent = await context.newPage();
    let closeSignal: (() => void) | undefined;
    await learner.routeWebSocket('ws://127.0.0.1:17880/**', socket => {
      const upstream = socket.connectToServer();
      closeSignal = () => { socket.close({ code: 1011 }); upstream.close({ code: 1011 }); };
    });
    await learner.goto('http://127.0.0.1:15173/media-tests/product.html');
    await agent.goto('http://127.0.0.1:15173/media-tests/peer.html');
    await learner.waitForFunction(() => !!(window as any).productFixture);
    await agent.waitForFunction(() => !!(window as any).mediaFixture);
    const room = `b5-product-${randomUUID()}`;
    await agent.evaluate(t => (window as any).mediaFixture.connect(t), token('synthetic-agent', room));
    await learner.evaluate(t => (window as any).productFixture.connect(t), token('learner', room));
    await expect.poll(() => learner.evaluate(() => (window as any).productFixture.state())).toBe('active');
    await expect.poll(() => learner.evaluate(() => (window as any).productFixture.rms())).toBeGreaterThan(0.01);
    await expect.poll(() => agent.evaluate(() => (window as any).mediaFixture.rms())).toBeGreaterThan(0.01);
    if (scenario === 'udp-uplink-loss') {
      // Refuse mutation outside the dedicated Linux test namespace.
      expect(process.platform).toBe('linux');
      // PID 1's namespace link is protected from the ordinary CI runner user.
      // Elevate only this read, never the browser/test process; fail closed on errors.
      const hostNamespace = execFileSync('sudo', ['-n', 'readlink', '/proc/1/ns/net'],
        { encoding: 'utf8', timeout: 5000 }).trim();
      const testNamespace = readlinkSync('/proc/self/ns/net');
      expect(hostNamespace).toMatch(/^net:\[\d+\]$/);
      expect(testNamespace).toMatch(/^net:\[\d+\]$/);
      expect(testNamespace).not.toBe(hostNamespace);
      const route = await learner.evaluate(() => (window as any).rtcSenderRoute());
      expect(route?.protocol).toBe('udp');
      expect(route?.remoteAddress).toBe('127.0.0.1');
      for (const port of [route.localPort, route.remotePort]) {
        expect(Number.isInteger(port) && port > 0 && port <= 65535).toBe(true);
      }
      const rule = ['OUTPUT', '-p', 'udp', '--sport', String(route.localPort),
        '--dport', String(route.remotePort), '-d', '127.0.0.1', '-j', 'DROP'];
      execFileSync('sudo', ['-n', 'iptables', '-I', ...rule]);
      try {
        await expect.poll(() => agent.evaluate(() => (window as any).mediaFixture.rms())).toBeLessThan(0.001);
        // Downlink must still carry fresh transitions while the uplink packets drop.
        await agent.evaluate(() => (window as any).mediaFixture.setTone(false));
        await expect.poll(() => learner.evaluate(() => (window as any).productFixture.rms())).toBeLessThan(0.001);
        await agent.evaluate(() => (window as any).mediaFixture.setTone(true));
        await expect.poll(() => learner.evaluate(() => (window as any).productFixture.rms())).toBeGreaterThan(0.01);
      } finally { execFileSync('sudo', ['-n', 'iptables', '-D', ...rule]); }
      await expect.poll(() => agent.evaluate(() => (window as any).mediaFixture.rms())).toBeGreaterThan(0.01);
    }
    if (scenario.startsWith('detach-')) {
      const uplink = scenario === 'detach-uplink';
      const sender = uplink ? learner : agent;
      const receiver = uplink ? agent : learner;
      const senderFixture = uplink ? 'productFixture' : 'mediaFixture';
      const receiverFixture = uplink ? 'mediaFixture' : 'productFixture';
      expect(await sender.evaluate(f => (window as any)[f].detachAudio(true), senderFixture)).toBeGreaterThan(0);
      await expect.poll(() => receiver.evaluate(f => (window as any)[f].rms(), receiverFixture)).toBeLessThan(0.001);
      // The opposite direction must still carry fresh transitions.
      await receiver.evaluate(f => (window as any)[f].setTone(false), receiverFixture);
      await expect.poll(() => sender.evaluate(f => (window as any)[f].rms(), senderFixture)).toBeLessThan(0.001);
      await receiver.evaluate(f => (window as any)[f].setTone(true), receiverFixture);
      await expect.poll(() => sender.evaluate(f => (window as any)[f].rms(), senderFixture)).toBeGreaterThan(0.01);
      expect(await learner.evaluate(() => (window as any).productFixture.state())).toBe('active');
      await sender.evaluate(f => (window as any)[f].detachAudio(false), senderFixture);
      await expect.poll(() => receiver.evaluate(f => (window as any)[f].rms(), receiverFixture)).toBeGreaterThan(0.01);
    }
    if (scenario === 'recover-signal' || scenario === 'stop-during-recovery') {
      const before = await learner.evaluate(() => (window as any).productFixture.snapshot());
      if (scenario === 'stop-during-recovery') {
        await learner.evaluate(() => (window as any).productFixture.armStopOnRecovery());
      }
      expect(closeSignal).toBeDefined(); closeSignal!();
      await expect.poll(() => learner.evaluate(n => (window as any).productFixture.snapshot().states.slice(n).includes('connecting'), before.states.length)).toBe(true);
    }
    if (scenario === 'recover-signal') {
      await expect.poll(() => learner.evaluate(() => (window as any).productFixture.state()), { timeout: 20_000 }).toBe('active');
      // A fresh tone transition proves new downstream media, not just an Active label.
      await agent.evaluate(() => (window as any).mediaFixture.setTone(false));
      await expect.poll(() => learner.evaluate(() => (window as any).productFixture.rms())).toBeLessThan(0.001);
      await agent.evaluate(() => (window as any).mediaFixture.setTone(true));
      await expect.poll(() => learner.evaluate(() => (window as any).productFixture.rms())).toBeGreaterThan(0.01);
      await expect.poll(() => agent.evaluate(() => (window as any).mediaFixture.rms())).toBeGreaterThan(0.01);
    }
    await learner.evaluate(() => { (window as any).productFixture.stop(); (window as any).productFixture.stop(); });
    await expect.poll(() => learner.evaluate(() => (window as any).productFixture.state())).toBe('idle');
    if (scenario === 'stop-during-recovery') {
      // Bounded negative observation across the normal signaling recovery window.
      await learner.waitForTimeout(5000);
      const after = await learner.evaluate(() => (window as any).productFixture.snapshot());
      expect(after.stoppedAt).not.toBeNull();
      expect(after.states.slice(after.stoppedAt)).not.toContain('active');
      expect(after.states.at(-1)).toBe('idle');
    }
    const snapshot = await learner.evaluate(() => (window as any).productFixture.snapshot());
    expect(snapshot.admissions).toBe(1); expect(snapshot.closes).toBe(1); expect(snapshot.tracksEnded).toBe(true);
    await agent.evaluate(() => (window as any).mediaFixture.stop());
    expect(external).toEqual([]);
  } finally { await context.close(); }
});
