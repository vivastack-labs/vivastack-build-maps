import { expect, test } from '@playwright/test';

// T0-03：dist/ を配信する wrangler dev で、本番の Workers と同じ動きを確かめる

test('F-I18N-02・D35：/ が 301 で /ja/ にリダイレクトされる', async ({ request, baseURL }) => {
  // Act
  const response = await request.get('/', { maxRedirects: 0 });

  // Assert
  expect(response.status()).toBe(301);
  const location = response.headers()['location'] ?? '';
  expect(new URL(location, baseURL).pathname).toBe('/ja/');
});

// CSP は T4-01 で加える（6.6 (4)）ので、ここでは確かめない
test('5.5：/ja/ に X-Content-Type-Options・Referrer-Policy・Permissions-Policy・HSTS が付く', async ({ request }) => {
  // Act
  const response = await request.get('/ja/');

  // Assert
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
});

test('11.4 (4)：/_next/static/ のファイルは1年間キャッシュされる', async ({ page, request }) => {
  // Arrange：ページが読み込むスクリプトの1つを使う（ファイル名はビルドごとに変わる）
  await page.goto('/ja/');
  const src = await page.locator('script[src*="/_next/static/"]').first().getAttribute('src');
  expect(src).toBeTruthy();

  // Act
  const response = await request.get(src ?? '');

  // Assert
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

// ふりがな付きの語の前後に、Playwright がアクセシブルな名前の空白を入れることがある
const BACK_TO_MAP_NAME = /^日本地図\s*へ\s*戻\s*る$/u;

for (const path of ['/no-such-page/', '/en/no-such-page/']) {
  test(`6.4・5.2：${path} は日本語の404画面を返す`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const main = page.getByRole('main');
    await expect(main.getByText('404', { exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { level: 1, name: /^ページが\s*見\s*つかりません$/u })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(main.getByText(/URLが.*ください。/u)).toBeVisible();
    await expect(main.getByRole('link', { name: BACK_TO_MAP_NAME })).toHaveAttribute('href', '/ja/');
  });
}

test('5.2：404画面からキーボードで日本地図へ戻れる', { tag: '@pc' }, async ({ page }) => {
  await page.goto('/no-such-page/');
  const link = page.getByRole('link', { name: BACK_TO_MAP_NAME });

  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL('/ja/');
});

test.describe('JavaScript 無効時の404', () => {
  test.use({ javaScriptEnabled: false });

  test('F-I18N-02・5.2：404画面のリンクから日本地図へ戻れる', async ({ page }) => {
    await page.goto('/no-such-page/');

    await page.getByRole('link', { name: BACK_TO_MAP_NAME }).click();

    await expect(page).toHaveURL('/ja/');
    await expect(page.getByRole('heading', { level: 1, name: /^ご\s*当地\s*めいぶつ\s*日本地図$/u })).toBeVisible();
  });
});
