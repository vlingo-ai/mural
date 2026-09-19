import { describe, expect, it } from 'vitest';
import { knownLanguages, providerLocale } from './contracts';

describe('language availability', () => {
  it('exposes only English and Mandarin while retaining the future Cantonese identity', () => {
    expect(knownLanguages.filter(item => item.available).map(item => item.id)).toEqual(['en', 'zh']);
    expect(knownLanguages.find(item => item.id === 'yue')).toMatchObject({ providerLocale: 'yue-Hant-HK', available: false });
    expect(providerLocale('en')).toBe('en');
    expect(providerLocale('zh')).toBe('zh-CN');
  });
});
