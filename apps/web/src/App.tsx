import { useEffect, useMemo, useRef, useState } from 'react';
import { knownLanguages, type AvailableLanguage, type TranscriptEvent } from './api/contracts';
import { MuralAPI, MuralAPIError } from './api/mural';
import { LiveConnection, type LiveState } from './live/LiveConnection';

type Caption = { id: string; speaker: 'user' | 'assistant'; text: string };

function safeMessage(error: unknown): string {
  if (error instanceof MuralAPIError) {
    const suffix = error.reference ? ` Reference ${error.reference}.` : '';
    if (error.code === 'sign_in_required') return `Enter a valid development access token.${suffix}`;
    if (error.code === 'insufficient_minutes' || error.code === 'insufficient_credit') return `This account has no available conversation balance.${suffix}`;
    if (error.code === 'hosted_voice_not_ready') return `Hosted voice is not configured on this Mural server.${suffix}`;
    return `Mural could not start the conversation (${error.code}).${suffix}`;
  }
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Microphone permission was denied.' : 'The voice connection could not be established.';
}

export default function App() {
  const [token, setToken] = useState('');
  const [language, setLanguage] = useState<AvailableLanguage>('en');
  const [state, setState] = useState<LiveState>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDevice, setInputDevice] = useState('');
  const [outputDevice, setOutputDevice] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const origin = import.meta.env.VITE_MURAL_API_ORIGIN || 'http://127.0.0.1:8080';
  const api = useMemo(() => new MuralAPI(origin, () => tokenRef.current.trim() || undefined), [origin]);
  const connection = useMemo(() => new LiveConnection(api, setState, event => {
    const transcript = event as Partial<TranscriptEvent>;
    if (transcript.type === 'session.transcript.appended' && (transcript.speaker === 'user' || transcript.speaker === 'assistant') && typeof transcript.text === 'string') {
      setCaptions(current => [...current, { id: transcript.event_id || crypto.randomUUID(), speaker: transcript.speaker!, text: transcript.text! }].slice(-40));
    }
    if (event.type === 'session.closed') setState('idle');
  }, stream => { if (audio.current) audio.current.srcObject = stream; }), [api]);

  useEffect(() => () => connection.disconnect(), [connection]);
  useEffect(() => {
    if (!outputDevice || !audio.current || !('setSinkId' in audio.current)) return;
    void (audio.current as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(outputDevice);
  }, [outputDevice]);

  async function refreshDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all);
  }

  async function start() {
    setError(undefined);
    setCaptions([]);
    try {
      await connection.connect(language, inputDevice || undefined);
      await refreshDevices();
    } catch (cause) { setError(safeMessage(cause)); }
  }

  async function sendText() {
    const message = typed;
    setSending(true);
    setError(undefined);
    try {
      if (await connection.sendText(message)) setTyped('');
    } catch (cause) { setError(safeMessage(cause)); }
    finally { setSending(false); }
  }

  const active = state === 'active';
  const busy = !['idle', 'failed'].includes(state);
  return <main>
    <header>
      <div className="mark" aria-hidden="true">M</div>
      <div><p className="eyebrow">Mural Web</p><h1>Speak, notice, grow.</h1></div>
    </header>

    <section className="setup" aria-label="Conversation setup">
      <label>Language
        <select value={language} onChange={event => setLanguage(event.target.value as AvailableLanguage)} disabled={busy}>
          {knownLanguages.map(item => <option key={item.id} value={item.id} disabled={!item.available}>
            {item.name}{item.available ? '' : ' — coming later'}
          </option>)}
        </select>
      </label>
      <label>Development access token
        <input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)}
          placeholder="Held in memory only" disabled={busy} />
      </label>
      <label>Microphone
        <select value={inputDevice} onChange={event => setInputDevice(event.target.value)} disabled={busy}>
          <option value="">System default</option>
          {devices.filter(device => device.kind === 'audioinput').map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}
        </select>
      </label>
      <label>Speaker
        <select value={outputDevice} onChange={event => setOutputDevice(event.target.value)}>
          <option value="">System default</option>
          {devices.filter(device => device.kind === 'audiooutput').map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Speaker'}</option>)}
        </select>
      </label>
      <p className="privacy">The token is never written to localStorage or IndexedDB. Production sign-in will replace this development field.</p>
    </section>

    <section className="conversation" aria-live="polite">
      <div className={`orb ${active ? 'active' : ''}`} aria-hidden="true" />
      <p className="status">{state.replaceAll('-', ' ')}</p>
      <div className="captions">
        {captions.length === 0 ? <p className="empty">Your live captions will appear here.</p> : captions.map(caption =>
          <p key={caption.id} className={caption.speaker}><span>{caption.speaker === 'user' ? 'You' : 'Mural'}</span>{caption.text}</p>)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {!busy ? <button className="primary" onClick={start} disabled={!token.trim()}>Start conversation</button> :
          <button className="danger" onClick={() => connection.close()}>Stop</button>}
      </div>
      <div className="typed">
        <input value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !sending) void sendText(); }}
          placeholder="Type a message" disabled={!active || sending} maxLength={2_000} />
        <button onClick={() => void sendText()} disabled={!active || sending || !typed.trim()}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
      <audio ref={audio} autoPlay />
    </section>
  </main>;
}
