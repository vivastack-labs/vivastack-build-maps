import { expect, test } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { plainText } from '../../src/lib/ruby';

// F-SRC-04・8.3：フッターの出典（T3-04）。本番用のビルド。

const N03_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html';

for (const lang of LANGS) {
  test(`F-SRC-04：フッターに国土数値情報の出典と AI の明記がある（${lang}）`, async ({ page }) => {
    // Arrange・Act
    await page.goto(`/${lang}/`);

    // Assert：文は「前 + URL + 後」で、URL はリンク
    const { mapSource, ai } = getMessages(lang).footer;
    const footer = page.getByRole('contentinfo');
    const source = footer.locator('[data-footer-map-source]');
    await expect(source).toBeVisible();
    await expect(source).toContainText(plainText(mapSource.before));
    await expect(source).toContainText(plainText(mapSource.after));
    await expect(source.getByRole('link', { name: N03_URL })).toHaveAttribute('href', N03_URL);
    await expect(footer.locator('[data-footer-ai]')).toHaveText(plainText(ai));
  });
}
