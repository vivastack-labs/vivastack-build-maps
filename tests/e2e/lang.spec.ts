import { expect, test } from '@playwright/test';

// F-I18N-01：3言語のページがある。6.2 D27：<html lang> は ja・en・zh-Hans
const CASES = [
  { lang: 'ja', htmlLang: 'ja' },
  { lang: 'en', htmlLang: 'en' },
  { lang: 'zh', htmlLang: 'zh-Hans' }
] as const;

for (const { lang, htmlLang } of CASES) {
  test(`F-I18N-01・D27：/${lang}/ が表示され、<html lang> が ${htmlLang} である`, async ({ page }) => {
    // Act
    const response = await page.goto(`/${lang}/`);

    // Assert
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', htmlLang);
  });
}

// 6.2 D27：システムフォントを言語ごとに指定する。Tailwind の @theme は使われない変数を出力から省くことがあり、
// :lang() の上書きが消えても単体テストでは気付けないので、計算後の font-family で確かめる
const FONT_CASES = [
  { lang: 'ja', first: 'Hiragino Sans' },
  { lang: 'en', first: 'system-ui' },
  { lang: 'zh', first: 'PingFang SC' }
] as const;

// 計算後の font-family の引用符の付け方はブラウザで違う（chromium は "Hiragino Sans"、Firefox・WebKit は付けないことがある）ので、外して比べる
const firstFamily = (fontFamily: string): string => (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');

for (const { lang, first } of FONT_CASES) {
  test(`D27：/${lang}/ の本文のフォントの並びが、その言語のものである（先頭は ${first}）`, async ({ page }) => {
    // Arrange
    await page.goto(`/${lang}/`);

    // Act
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);

    // Assert
    expect(firstFamily(fontFamily)).toBe(first);
  });
}
