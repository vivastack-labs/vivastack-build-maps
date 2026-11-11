import { describe, expect, test } from 'vitest';
import { htmlLang, isLang, langStaticParams } from '@/i18n/lang';

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
