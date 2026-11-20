import { expect, test } from '@playwright/test';

test('D21：サイト識別子を渡してもプレビューにはビーコンが出ない', async ({ page }) => {
  await page.route('https://static.cloudflareinsights.com/**', route => route.abort());
  await page.goto('/ja/');

  await expect(page.locator('script[data-cf-beacon]')).toHaveCount(0);
});
