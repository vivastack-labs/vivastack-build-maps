import { expect, test } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';

for (const lang of LANGS) {
  test(`F-SRC-04：トップのフッターから説明ページに移動して出典と AI の説明を確認できる（${lang}）`, async ({ page }) => {
    await page.goto(`/${lang}/`);

    const footer = page.getByRole('contentinfo');
    await expect(footer.locator('[data-footer-map-source], [data-footer-ai]')).toHaveCount(0);
    await footer.locator('[data-footer-link="about"]').click();
    await expect(page).toHaveURL(`/${lang}/about/`);
    await expect(footer.locator('[data-footer-map-source]')).toBeVisible();
    await expect(footer.locator('[data-footer-ai]')).toBeVisible();
  });
}
