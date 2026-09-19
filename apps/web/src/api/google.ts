import type { AuthExchange } from './contracts';
import type { MuralAPI } from './mural';

type CredentialResponse = { credential?: string };
type GoogleAccounts = { id: {
  initialize(options: { client_id: string; nonce: string; callback(response: CredentialResponse): void; cancel_on_tap_outside: boolean }): void;
  prompt(callback: (notification: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void;
  disableAutoSelect(): void;
} };
declare global { interface Window { google?: { accounts: GoogleAccounts } } }

let loading: Promise<GoogleAccounts> | undefined;
function googleAccounts(): Promise<GoogleAccounts> {
  if (window.google?.accounts) return Promise.resolve(window.google.accounts);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true;
    script.onload = () => window.google?.accounts ? resolve(window.google.accounts) : reject(new Error('Google sign-in did not load.'));
    script.onerror = () => reject(new Error('Google sign-in did not load.'));
    document.head.append(script);
  });
  return loading;
}

export async function signInWithGoogle(api: MuralAPI, clientID: string): Promise<AuthExchange> {
  const challenge = await api.createAuthChallenge(), accounts = await googleAccounts();
  return new Promise<AuthExchange>((resolve, reject) => {
    let settled = false;
    accounts.id.initialize({ client_id: clientID, nonce: challenge.nonce, cancel_on_tap_outside: true,
      callback: response => {
        if (!response.credential) { reject(new Error('Google did not return an identity token.')); return; }
        settled = true; void api.exchangeIdentity('google', response.credential, challenge.challengeID).then(resolve, reject);
      } });
    accounts.id.prompt(notification => {
      if (!settled && (notification.isNotDisplayed() || notification.isSkippedMoment())) reject(new Error('Google sign-in was unavailable or cancelled.'));
    });
  });
}

export function disableGoogleAutoSelect(): void { window.google?.accounts.id.disableAutoSelect(); }
