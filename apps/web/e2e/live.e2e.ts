import { expect, test } from '@playwright/test';

test('development sign-in, Live captions, teaching tools and server history form one browser flow', async ({ page }) => {
  const sessionID = '11111111-1111-4111-8111-111111111111', calls: Array<{ path: string; body?: any }> = [];
  const acceptedTranscriptEvents: string[] = [];
  await page.addInitScript(() => {
    class Channel {
      readyState = 'open'; onopen?: () => void; onmessage?: (event: { data: string }) => void;
      send(raw: string) {
        const command = JSON.parse(raw);
        if (command.type === 'session.commentary.append') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
          type: 'session.output_transcript.delta', event_id: `output-${Date.now()}`, delta: command.content,
        }) }));
        if (command.type === 'session.close') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'session.closed' }) }));
      }
      close() { this.readyState = 'closed'; }
    }
    class Peer {
      connectionState = 'connected'; iceGatheringState = 'complete'; localDescription?: { type: string; sdp: string };
      ontrack?: (event: any) => void; onconnectionstatechange?: () => void; channel = new Channel();
      addTrack() {} createDataChannel() { return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nbrowser-fixture-offer' }; }
      async setLocalDescription(value: any) { this.localDescription = value; }
      async setRemoteDescription() { queueMicrotask(() => { this.channel.onopen?.(); this.channel.onmessage?.({ data: JSON.stringify({ type: 'session.started' }) });
        this.channel.onmessage?.({ data: JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'input-1', delta: 'Good ' }) });
        this.channel.onmessage?.({ data: JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'input-2', delta: 'morning' }) }); }); }
      addEventListener() {} removeEventListener() {} close() { this.connectionState = 'closed'; }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: async () => new MediaStream(), enumerateDevices: async () => [],
    } });
  });
  await page.route('http://127.0.0.1:8080/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.postDataJSON?.(); calls.push({ path: url.pathname, body });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/v1/account') return json({ accountID: '22222222-2222-4222-8222-222222222222', email: 'learner@example.test', providers: ['google'], createdAt: new Date().toISOString() });
    if (url.pathname === '/v1/conversations' && request.method() === 'GET') return json({ conversations: [{ id: sessionID, language: 'en', state: 'active', createdAt: new Date().toISOString(), deadline: new Date().toISOString(), preview: 'Good morning', eventCount: 2, resultCount: 0 }] });
    if (url.pathname === `/v1/conversations/${sessionID}`) return json({ id: sessionID, language: 'en', state: 'active', createdAt: new Date().toISOString(), deadline: new Date().toISOString(), observedMilliseconds: 0, chargedMilliseconds: null,
      events: [{ eventID: 'input-1', speaker: 'user', text: 'Good morning', source: 'live', createdAt: new Date().toISOString() }], results: [] });
    if (url.pathname === '/v1/live/sessions') return json({ sessionID, sdp: 'v=0\r\nbrowser-fixture-answer', deadline: new Date().toISOString(), reservedMilliseconds: 60_000, billingBasis: 'connected-conversation-time', experimental: true });
    if (url.pathname.endsWith('/events')) {
      if (body.eventID === 'input-1') await new Promise(resolve => setTimeout(resolve, 50));
      acceptedTranscriptEvents.push(body.eventID);
      return json({ accepted: true, duplicate: false });
    }
    if (url.pathname === '/v1/model-tasks') {
      if (body.kind === 'translation') return json({ kind: 'translation', text: '早上好。', sources: [], usage: {} });
      if (body.kind === 'assessment') return json({ kind: 'assessment', outcome: 'success', suggestedLevel: 2, nextGoal: 'Add one detail.', capability: 'Clear greeting.', words: [] });
      return json({ kind: body.kind, text: 'Nice greeting. What are you doing today?', sources: [], usage: {} });
    }
    if (url.pathname.endsWith('/close') || url.pathname === '/v1/auth/sign-out') return json({});
    return json({ error: { code: 'not_found' } }, 404);
  });

  await page.goto('/');
  await page.getByLabel('Development access token').fill('local-development-token');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('learner@example.test')).toBeVisible();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await expect(page.locator('.captions .user')).toContainText('Good morning');
  await page.getByPlaceholder('Type a message').fill('How are you?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Nice greeting. What are you doing today?')).toBeVisible();
  await page.getByRole('button', { name: 'Translate latest' }).click();
  await expect(page.getByText('早上好。')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByText('Good morning', { exact: true }).last().click();
  await expect(page.getByText('Conversation detail')).toBeVisible();
  expect(calls.some(call => call.path === `/v1/conversations/${sessionID}/events`)).toBe(true);
  expect(calls.some(call => call.path === '/v1/model-tasks' && call.body.kind === 'teachingReply')).toBe(true);
  expect(acceptedTranscriptEvents.slice(0, 2)).toEqual(['input-1', 'input-2']);
});
