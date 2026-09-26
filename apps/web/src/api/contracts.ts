export const knownLanguages = [
  { id: 'en', providerLocale: 'en', name: 'English', available: true },
  { id: 'zh', providerLocale: 'zh-CN', name: '普通话', available: false },
  { id: 'yue', providerLocale: 'yue-Hant-HK', name: '粤语', available: false },
] as const;

export type AvailableLanguage = 'en' | 'zh';
export type ProviderLocale = 'en' | 'zh-CN';

export function providerLocale(language: AvailableLanguage): ProviderLocale {
  return language === 'zh' ? 'zh-CN' : 'en';
}

export type TranscriptEvent = {
  type: 'session.transcript.appended';
  event_id?: string;
  speaker: 'user' | 'assistant';
  text: string;
  source?: 'live' | 'typed';
};

export type LiveSessionResult = {
  sessionID: string;
  transport: { type: 'webrtc'; sdp: string } | { type: 'livekit-room'; url: string; token: string };
  deadline: string;
  reservedMilliseconds: number;
  billingBasis: string;
  experimental: true;
};

export type LiveCapabilities = { hostedMinutes: boolean; transport?: 'webrtc' | 'livekit-room'; experimental?: true };

export type AuthChallenge = { challengeID: string; nonce: string; expiresInSeconds: number };
export type AuthExchange = { accountID: string; accessToken: string; expiresInSeconds: number };
export type AccountProfile = { accountID: string; email: string | null; providers: Array<'google' | 'apple'>; createdAt: string };
export type ConversationSummary = { id: string; language: string | null; state: string; createdAt: string;
  deadline: string; preview: string | null; eventCount: number; resultCount: number };
export type ConversationDetail = { id: string; language: string | null; state: string; createdAt: string; deadline: string;
  observedMilliseconds: number; chargedMilliseconds: number | null;
  events: Array<{ eventID: string; speaker: 'user' | 'assistant'; text: string; source: 'live' | 'typed'; createdAt: string }>;
  results: Array<{ kind: string; result: unknown; createdAt: string }> };

export type HistoryPage = { events: ConversationDetail['events']; nextCursor: string; hasMore: boolean };
