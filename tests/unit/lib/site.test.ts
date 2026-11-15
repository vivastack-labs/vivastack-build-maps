import { describe, expect, test } from 'vitest';

import { alternateUrls, SITE_URL } from '@/lib/site';

// F-I18N-03・D8・D35：hreflang と canonical は、サイトの絶対 URL
describe('alternateUrls', () => {
  test('F-I18N-03：alternateUrls は ja・en・zh-Hans・x-default の4つと canonical を返す', () => {
    // Act
    const result = alternateUrls('en');

    // Assert
    expect(result).toEqual({
      canonical: 'https://maps.vivastack-dev.workers.dev/en/',
      languages: {
        ja: 'https://maps.vivastack-dev.workers.dev/ja/',
        en: 'https://maps.vivastack-dev.workers.dev/en/',
        'zh-Hans': 'https://maps.vivastack-dev.workers.dev/zh/',
        'x-default': 'https://maps.vivastack-dev.workers.dev/ja/'
      }
    });
  });

  test.each(['ja', 'en', 'zh'] as const)('F-I18N-03：%s の canonical はそのページの URL（languages は言語によらず同じ）', lang => {
    // Act
    const result = alternateUrls(lang);

    // Assert
    expect(result.canonical).toBe(`${SITE_URL}/${lang}/`);
    expect(result.languages).toEqual(alternateUrls('ja').languages);
  });

  test('D35：SITE_URL は末尾にスラッシュを付けない', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});
