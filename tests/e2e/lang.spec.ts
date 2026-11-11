import { expect, test } from '@playwright/test';

// F-I18N-01：3言語のページがある。6.2 D27：<html lang> は ja・en・zh-Hans
const CASES = [
  { lang: 'ja', htmlLang: 'ja' },
  { lang: 'en', htmlLang: 'en' },
  { lang: 'zh', htmlLang: 'zh-Hans' }
] as const;

for (const { lang, htmlLang } of CASES) {
  test(`F-I18N-01・D27：/maps/${lang}/ が表示され、<html lang> が ${htmlLang} である`, async ({ page }) => {
    // Act
    const response = await page.goto(`/maps/${lang}/`);

    // Assert
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', htmlLang);
  });
}
