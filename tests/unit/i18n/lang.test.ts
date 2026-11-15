import { describe, expect, test } from 'vitest';
import { htmlLang, isLang, LANG_LINK_ATTRIBUTE, LANG_NAMES, langPath, langStaticParams } from '@/i18n/lang';

describe('isLang（F-I18N-01）', () => {
  test.each(['ja', 'en', 'zh'])('F-I18N-01: 対応する言語 %s を受け付ける', value => {
    // Act
    const result = isLang(value);

    // Assert
    expect(result).toBe(true);
  });

  test.each(['fr', '', 'JA', 'zh-Hans'])('F-I18N-01: 対応しない値 "%s" を受け付けない', value => {
    // Act
    const result = isLang(value);

    // Assert
    expect(result).toBe(false);
  });
});

describe('htmlLang（6.2 D27）', () => {
  test.each([
    ['ja', 'ja'],
    ['en', 'en'],
    ['zh', 'zh-Hans']
  ] as const)('D27: %s のページの <html lang> は %s', (lang, expected) => {
    // Act
    const result = htmlLang(lang);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('langStaticParams（F-I18N-01）', () => {
  test('F-I18N-01: ja・en・zh の3言語のページを生成する', () => {
    // Act
    const params = langStaticParams();

    // Assert
    expect(params).toEqual([{ lang: 'ja' }, { lang: 'en' }, { lang: 'zh' }]);
  });
});

describe('LANG_NAMES（F-I18N-03）', () => {
  test('F-I18N-03: 言語の名前は、その言語で書く（どのページでも同じ）', () => {
    // Assert
    expect(LANG_NAMES).toEqual({ ja: '日本語', en: 'English', zh: '中文' });
  });
});

describe('langPath・LANG_LINK_ATTRIBUTE（F-I18N-03）', () => {
  test.each(['ja', 'en', 'zh'] as const)('F-I18N-03: %s のページのパスは /%s/', lang => {
    // Assert
    expect(langPath(lang)).toBe(`/${lang}/`);
  });

  test('F-I18N-03: 言語切替のリンクの属性名は data-lang-link', () => {
    expect(LANG_LINK_ATTRIBUTE).toBe('data-lang-link');
  });
});
