import { expect, test } from '@playwright/test';

// T0-03：dist/ を配信する wrangler dev で、本番の Workers と同じ動きを確かめる

for (const path of ['/maps', '/maps/']) {
  test(`F-I18N-02：${path} が 301 で /maps/ja/ にリダイレクトされる`, async ({ request, baseURL }) => {
    // Act
    const response = await request.get(path, { maxRedirects: 0 });

    // Assert
    expect(response.status()).toBe(301);
    const location = response.headers()['location'] ?? '';
    expect(new URL(location, baseURL).pathname).toBe('/maps/ja/');
  });
}

// CSP は T4-01 で加える（6.6 (4)）ので、ここでは確かめない
test('5.5：/maps/ja/ に X-Content-Type-Options・Referrer-Policy・Permissions-Policy・HSTS が付く', async ({ request }) => {
  // Act
  const response = await request.get('/maps/ja/');

  // Assert
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
});

test('11.4 (4)：/maps/_next/static/ のファイルは1年間キャッシュされる', async ({ page, request }) => {
  // Arrange：ページが読み込むスクリプトの1つを使う（ファイル名はビルドごとに変わる）
  await page.goto('/maps/ja/');
  const src = await page.locator('script[src*="/maps/_next/static/"]').first().getAttribute('src');
  expect(src).toBeTruthy();

  // Act
  const response = await request.get(src ?? '');

  // Assert
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('5.2：存在しないパスは 404 を返し、<html lang> が ja である', async ({ page }) => {
  // Act
  const response = await page.goto('/maps/no-such-page/');

  // Assert
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});
