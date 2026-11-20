import { expect, test } from '@playwright/test';
import { LANGS, htmlLang, langPath } from '../../src/i18n/lang';

test('F-I18N-02：本番のルートは日本語トップに転送される', async ({ request, baseURL }) => {
  const response = await request.get('/', { maxRedirects: 0 });

  expect(response.status()).toBe(301);
  expect(new URL(response.headers()['location'] ?? '', baseURL).href).toBe(new URL('/ja/', baseURL).href);
});

for (const lang of LANGS) {
  test(`F-I18N-01・4.11.4：${lang} のトップに利用可能な47都道府県が出る`, async ({ page }) => {
    const response = await page.goto(langPath(lang, 'home'));

    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', htmlLang(lang));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('path[data-pref]')).toHaveCount(47);
    await expect(page.locator('path[data-pref][data-pending]')).toHaveCount(0);
  });
}

test('5.5：本番のトップにセキュリティヘッダーと CSP が付く', async ({ page }) => {
  const response = await page.goto('/ja/');

  expect(response?.headers()).toMatchObject({
    'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), camera=(), microphone=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains'
  });
  const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(csp).toHaveAttribute('content', /(?:^|;\s*)script-src 'self' [^;]*'sha256-/u);
  await expect(csp).toHaveAttribute('content', /(?:^|;\s*)style-src 'self'(?:;|$)/u);
});

test('D21：本番のトップに Web Analytics の設定が1つ出る', async ({ page }) => {
  await page.goto('/ja/');

  const beacon = page.locator('script[data-cf-beacon]');
  await expect(beacon).toHaveCount(1);
  await expect(beacon).toHaveAttribute('src', 'https://static.cloudflareinsights.com/beacon.min.js');
  await expect(beacon).toHaveAttribute('data-cf-beacon', /^\{"token":"[a-f0-9]{32}"\}$/iu);
});
