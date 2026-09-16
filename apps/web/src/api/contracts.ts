export const knownLanguages = [
  { id: 'en', providerLocale: 'en', name: 'English', available: true },
  { id: 'zh', providerLocale: 'zh-CN', name: '普通话', available: true },
  { id: 'yue', providerLocale: 'yue-Hant-HK', name: '香港粵語', available: false },
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
};

export type LiveSessionResult = {
  sessionID: string;
  sdp: string;
  deadline: string;
  reservedMilliseconds: number;
  billingBasis: string;
  experimental: true;
};
