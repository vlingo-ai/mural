import { describe, expect, it } from 'vitest';
import { knownLanguages, providerLocale } from './contracts';

describe('language availability', () => {
  it('offers English while marking Mandarin and Cantonese as coming later', () => {
    expect(knownLanguages.filter(item => item.available).map(item => item.id)).toEqual(['en']);
    expect(knownLanguages.find(item => item.id === 'zh')).toMatchObject({ name: '普通话', providerLocale: 'zh-CN', available: false });
    expect(knownLanguages.find(item => item.id === 'yue')).toMatchObject({ name: '粤语', providerLocale: 'yue-Hant-HK', available: false });
    expect(providerLocale('en')).toBe('en');
    expect(providerLocale('zh')).toBe('zh-CN');
  });
});
