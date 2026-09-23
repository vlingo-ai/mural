import { useEffect, useMemo, useRef, useState } from 'react';
import { knownLanguages, providerLocale, type AccountProfile, type AvailableLanguage, type ConversationDetail,
  type ConversationSummary, type TranscriptEvent } from './api/contracts';
import { disableGoogleAutoSelect, signInWithGoogle } from './api/google';
import { MuralAPI, MuralAPIError } from './api/mural';
import { LiveConnection, type LiveState } from './live/LiveConnection';
import { AudioEnergyProbe, TimingRecorder, type TimingReport } from './live/timing-diagnostic';
import { historyCache } from './storage/history-cache';

type Caption = { id: string; speaker: 'user' | 'assistant'; text: string; source: 'live' | 'typed' };
type TextResult = { kind: string; text: string; sources?: Array<{ title: string; url: string }> };
type Assessment = { kind: 'assessment'; outcome: string; suggestedLevel: number; nextGoal: string; capability: string;
  words: Array<{ lemma: string; meaning: string; kind: string }> };

function safeMessage(error: unknown): string {
  if (error instanceof MuralAPIError) {
    const suffix = error.reference ? ` Reference ${error.reference}.` : '';
    if (error.code === 'sign_in_required') return `Sign in again or enter a valid development token.${suffix}`;
    if (error.code === 'insufficient_minutes' || error.code === 'insufficient_credit') return `This account has no available conversation balance.${suffix}`;
    if (error.code === 'hosted_voice_not_ready') return `Hosted voice is not configured on this Mural server.${suffix}`;
    if (error.code === 'account_model_tasks_not_ready') return `Topic search is not enabled on this Mural server.${suffix}`;
    return `Mural could not complete the request (${error.code}).${suffix}`;
  }
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Microphone permission was denied.' : error instanceof Error ? error.message : 'The request could not be completed.';
}

export default function App() {
  const [token, setToken] = useState('');
  const [account, setAccount] = useState<AccountProfile>();
  const [language, setLanguage] = useState<AvailableLanguage>('en');
  const [state, setState] = useState<LiveState>('idle');
  const [sessionID, setSessionID] = useState<string>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDevice, setInputDevice] = useState('');
  const [outputDevice, setOutputDevice] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<TextResult | Assessment>();
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [detail, setDetail] = useState<ConversationDetail>();
  const [error, setError] = useState<string>();
  const [timingReport, setTimingReport] = useState<TimingReport>();
  const audio = useRef<HTMLAudioElement>(null);
  const tokenRef = useRef(token); tokenRef.current = token;
  const accountRef = useRef(account); accountRef.current = account;
  const origin = import.meta.env.VITE_MURAL_API_ORIGIN || 'http://127.0.0.1:8080';
  const googleClientID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const api = useMemo(() => new MuralAPI(origin, () => tokenRef.current.trim() || undefined), [origin]);
  const timingEnabled = new URLSearchParams(window.location.search).get('timing') === '1' &&
    (import.meta.env.DEV || window.location.hostname === 'speaking-live-staging.vlingo.ai');
  const timing = useMemo(() => timingEnabled ? new TimingRecorder(() => performance.now(), setTimingReport) : undefined,
    [timingEnabled]);
  const audioProbe = useMemo(() => timing ? new AudioEnergyProbe(timing) : undefined, [timing]);
  const connection = useMemo(() => new LiveConnection(api, setState, event => {
    const transcript = event as Partial<TranscriptEvent>;
    if (transcript.type === 'session.transcript.appended' && (transcript.speaker === 'user' || transcript.speaker === 'assistant') && typeof transcript.text === 'string') {
      const source = transcript.source === 'typed' ? 'typed' : 'live';
      setCaptions(current => {
        const next = [...current], previous = next.at(-1);
        if (source === 'live' && previous && previous.speaker === transcript.speaker && previous.source === 'live')
          next[next.length - 1] = { ...previous, text: previous.text + transcript.text };
        else next.push({ id: transcript.event_id || crypto.randomUUID(), speaker: transcript.speaker!, text: transcript.text!, source });
        return next.slice(-40);
      });
    }
    if (event.type === 'mural.history.sync_failed') setError('The live conversation continues, but history sync needs a retry.');
    if (event.type === 'mural.live.agent_lost') setError('The voice service stopped unexpectedly. Start a new conversation to reconnect.');
    if (event.type === 'mural.live.reconnect_failed') setError('The connection could not be restored. Start a new conversation.');
    if (event.type === 'session.closed') {
      timing?.mark('closed'); audioProbe?.stop(); setState('idle'); void refreshHistory(accountRef.current?.accountID);
    }
  }, stream => { if (audio.current) audio.current.srcObject = stream; audioProbe?.attachRemote(stream); },
  setSessionID, kind => { timing?.mark(kind); if (kind === 'failed' || kind === 'stop-requested') audioProbe?.stop(); },
  stream => audioProbe?.attachLocal(stream)), [api, timing, audioProbe]);

  useEffect(() => () => { connection.disconnect(); audioProbe?.stop(); }, [connection, audioProbe]);
  useEffect(() => {
    if (!outputDevice || !audio.current || !('setSinkId' in audio.current)) return;
    void (audio.current as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(outputDevice);
  }, [outputDevice]);

  async function refreshDevices() { setDevices(await navigator.mediaDevices.enumerateDevices()); }
  async function refreshHistory(accountID = account?.accountID) {
    if (!tokenRef.current.trim()) return;
    try { const loaded = (await api.conversations()).conversations; setHistory(loaded); if (accountID) await historyCache.writeList(accountID, loaded); }
    catch (cause) { setError(safeMessage(cause)); }
  }
  async function verifyDevelopmentToken() {
    setError(undefined);
    try { const profile = await api.account(); setAccount(profile); const cached = await historyCache.readList(profile.accountID);
      if (cached) setHistory(cached); await refreshHistory(profile.accountID); }
    catch (cause) { setAccount(undefined); setError(safeMessage(cause)); }
  }
  async function googleSignIn() {
    if (!googleClientID) return;
    setError(undefined);
    try {
      const exchanged = await signInWithGoogle(api, googleClientID);
      tokenRef.current = exchanged.accessToken; setToken(exchanged.accessToken);
      const profile = await api.account(); setAccount(profile); const cached = await historyCache.readList(profile.accountID);
      if (cached) setHistory(cached); await refreshHistory(profile.accountID);
    } catch (cause) { setError(safeMessage(cause)); }
  }
  async function signOut() {
    try { await api.signOut(); } catch { /* Local credential disposal still signs the browser out. */ }
    connection.disconnect(); disableGoogleAutoSelect(); if (account) await historyCache.clear(account.accountID);
    audioProbe?.stop();
    tokenRef.current = ''; setToken(''); setAccount(undefined);
    setHistory([]); setDetail(undefined); setCaptions([]); setResult(undefined);
  }
  async function start() {
    setError(undefined); setCaptions([]); setResult(undefined);
    timing?.start(); audioProbe?.start(audio.current);
    try { await connection.connect(language, inputDevice || undefined); await refreshDevices(); }
    catch (cause) { setError(safeMessage(cause)); }
  }
  async function sendText() {
    const message = typed; setSending(true); setError(undefined);
    try { if (await connection.sendText(message)) setTyped(''); }
    catch (cause) { setError(safeMessage(cause)); } finally { setSending(false); }
  }
  async function runLiveTask(kind: 'translation' | 'assessment') {
    const latest = [...captions].reverse().find(item => item.speaker === 'user');
    if (!latest || !sessionID) return;
    setToolBusy(true); setError(undefined);
    try {
      if (kind === 'translation') {
        setResult(await api.createModelTask<TextResult>({ kind, funding: { type: 'liveSession', sessionID }, text: latest.text,
          sourceLanguage: providerLocale(language), targetLanguage: language === 'zh' ? 'English' : 'Chinese (Simplified)' }, crypto.randomUUID()));
      } else {
        setResult(await api.createModelTask<Assessment>({ kind, funding: { type: 'liveSession', sessionID }, language: providerLocale(language),
          context: captions.slice(-10).map(item => ({ speaker: item.speaker, text: item.text })),
          passage: { id: crypto.randomUUID(), fragments: [{ id: crypto.randomUUID(), text: latest.text,
            meaningVisible: false, typed: latest.source === 'typed' }] } }, crypto.randomUUID()));
      }
      await refreshHistory();
    } catch (cause) { setError(safeMessage(cause)); } finally { setToolBusy(false); }
  }
  async function searchTopic() {
    if (!topic.trim()) return;
    setToolBusy(true); setError(undefined);
    try { setResult(await api.createModelTask<TextResult>({ kind: 'topicSearch', funding: sessionID ? { type: 'liveSession', sessionID } : { type: 'account' },
      language: providerLocale(language), query: topic.trim() }, crypto.randomUUID())); }
    catch (cause) { setError(safeMessage(cause)); } finally { setToolBusy(false); }
  }
  async function openHistory(id: string) {
    setError(undefined);
    try { setDetail(await api.conversation(id)); }
    catch (cause) { setError(safeMessage(cause)); }
  }

  const active = state === 'active', busy = !['idle', 'failed'].includes(state), latestUser = captions.some(item => item.speaker === 'user');
  return <main>
    <header><div className="mark" aria-hidden="true">M</div><div><p className="eyebrow">Mural Web</p><h1>Speak, notice, grow.</h1></div></header>
    <section className="identity" aria-label="Account"><div><p className="eyebrow">Account</p><strong>{account?.email || (token ? 'Development session' : 'Signed out')}</strong>
      <p>{account ? 'Your Mural account is the authority for balance and conversation history.' : 'Sign in for production use, or use a short-lived Mural token locally.'}</p></div>
      <div className="identity-actions">{googleClientID && !account && <button className="secondary" onClick={() => void googleSignIn()}>Continue with Google</button>}
        {token && <button className="secondary" onClick={() => void signOut()}>Sign out</button>}</div></section>
    <section className="setup" aria-label="Conversation setup">
      <label>Language<select value={language} onChange={event => setLanguage(event.target.value as AvailableLanguage)} disabled={busy}>
        {knownLanguages.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.name}{item.available ? '' : ' — coming later'}</option>)}</select></label>
      <label>Development access token<div className="inline-field"><input type="password" autoComplete="off" value={token}
        onChange={event => { setToken(event.target.value); setAccount(undefined); }} placeholder="Held in memory only" disabled={busy || Boolean(account)} />
        <button className="secondary" onClick={() => void verifyDevelopmentToken()} disabled={!token.trim() || busy || Boolean(account)}>Verify</button></div></label>
      <label>Microphone<select value={inputDevice} onChange={event => setInputDevice(event.target.value)} disabled={busy}><option value="">System default</option>
        {devices.filter(device => device.kind === 'audioinput').map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>
      <label>Speaker<select value={outputDevice} onChange={event => setOutputDevice(event.target.value)}><option value="">System default</option>
        {devices.filter(device => device.kind === 'audiooutput').map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Speaker'}</option>)}</select></label>
      <p className="privacy">Mural and provider credentials are never bundled. The browser token stays in memory; IndexedDB contains only a disposable history cache.</p>
    </section>
    <section className="conversation" aria-live="polite">
      <div className={`orb ${active ? 'active' : ''}`} aria-hidden="true" /><p className="status">{state.replaceAll('-', ' ')}</p>
      <div className="captions">{captions.length === 0 ? <p className="empty">Your live captions will appear here.</p> : captions.map(caption =>
        <p key={caption.id} className={caption.speaker}><span>{caption.speaker === 'user' ? 'You' : 'Mural'}</span>{caption.text}</p>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">{!busy ? <button className="primary" onClick={() => void start()} disabled={!token.trim()}>Start conversation</button> :
        <button className="danger" onClick={() => connection.close()}>Stop</button>}</div>
      <div className="typed"><input value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !sending) void sendText(); }}
        placeholder="Type a message" disabled={!active || sending} maxLength={2_000} /><button onClick={() => void sendText()} disabled={!active || sending || !typed.trim()}>{sending ? 'Sending…' : 'Send'}</button></div>
      <div className="learning-actions"><button onClick={() => void runLiveTask('translation')} disabled={!active || !latestUser || toolBusy}>Translate latest</button>
        <button onClick={() => void runLiveTask('assessment')} disabled={!active || !latestUser || toolBusy}>Learning feedback</button></div><audio ref={audio} autoPlay />
    </section>
    {timing && <details className="panel timing-diagnostic"><summary>Staging timing diagnostic</summary>
      <p>Opt-in browser measurements only. No audio or transcript is stored or uploaded; speech-onset timings are candidates requiring manual validation.</p>
      <pre>{JSON.stringify(timingReport ?? timing.report(), null, 2)}</pre></details>}
    <section className="workspace" aria-label="Learning tools and history">
      <div className="panel"><p className="eyebrow">Current topic</p><div className="typed"><input value={topic} onChange={event => setTopic(event.target.value)}
        placeholder="Find a current conversation topic" maxLength={500} disabled={!token || toolBusy} /><button onClick={() => void searchTopic()} disabled={!token || !topic.trim() || toolBusy}>Explore</button></div>
        {result && <div className="result">{'text' in result ? <><p>{result.text}</p>{result.sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</> :
          <><strong>{result.outcome} · level {result.suggestedLevel}</strong><p>{result.capability}</p><p>Next: {result.nextGoal}</p>
            {result.words.map(word => <span className="word" key={`${word.lemma}:${word.kind}`}>{word.lemma} — {word.meaning}</span>)}</>}</div>}</div>
      <div className="panel"><div className="panel-heading"><p className="eyebrow">Server history</p><button className="secondary" onClick={() => void refreshHistory()} disabled={!token}>Refresh</button></div>
        {history.length === 0 ? <p className="muted">No synced conversations yet.</p> : <ul className="history">{history.map(item => <li key={item.id}>
          <button onClick={() => void openHistory(item.id)}><strong>{item.language === 'zh-CN' ? '普通话' : item.language === 'en' ? 'English' : item.language || 'Historical session'}</strong><span>{item.preview || item.state}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button></li>)}</ul>}
        {detail && <div className="history-detail"><strong>Conversation detail</strong>{detail.events.map(event => <p key={event.eventID}><span>{event.speaker === 'user' ? 'You' : 'Mural'}</span>{event.text}</p>)}</div>}</div>
    </section>
  </main>;
}
