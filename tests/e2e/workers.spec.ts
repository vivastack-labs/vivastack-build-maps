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

test('5.5：/maps/ja/ に X-Content-Type-Options・Referrer-Policy・Permissions-Policy が付く', async ({ request }) => {
  // Act
  const response = await request.get('/maps/ja/');

  // Assert
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
});

test('5.2：存在しないパスは 404 を返し、<html lang> が ja である', async ({ page }) => {
  // Act
  const response = await page.goto('/maps/no-such-page/');

  // Assert
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});
