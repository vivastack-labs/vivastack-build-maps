import { expect, test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';

// 4.11.4・7.1・R4・11.4 (5)：プレビュー用のビルド（pnpm build:preview。T3-02）。コンテンツは tests/fixtures/content/（playwright.preview.config.ts の CONTENT_DIR）。
// 本番用のビルドの確認は tests/e2e/pending.spec.ts

const prefectures = loadContent('tests/fixtures/content');
const TOKYO = '13';

const fillOf = (page: Page, code: string): Promise<string> => page.locator(`path[data-pref="${code}"]`).evaluate(element => getComputedStyle(element).fill);

test.describe('4.11.4：プレビューでは「準備中」を使わない', () => {
  test('すべての県が地方の色で塗られる（斜線の県がない）', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('path[data-pref]')).toHaveCount(47);
    await expect(page.locator('[data-pending]')).toHaveCount(0);
    const fills = await page.locator('path[data-pref]').evaluateAll(elements => elements.map(element => getComputedStyle(element).fill));
    expect(fills.filter(fill => fill.includes('url('))).toEqual([]);
    expect(await fillOf(page, TOKYO)).not.toContain('url(');
  });

  test('凡例に「準備中」がなく、さくいんに（準備中）が付かない', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('[data-legend-region]')).toHaveCount(8);
    await expect(page.locator('[data-legend-pending]')).toHaveCount(0);
    await expect(page.locator('[data-index-pending]')).toHaveCount(0);
    await expect(page.locator(`path[data-pref="${TOKYO}"]`)).toHaveAttribute('aria-label', '東京都');
  });
});

test.describe('7.1：プレビューには、reviewed でない項目も出る', () => {
  test('東京都のツールチップに、verified・draft の名物の名前も出る', async ({ page }) => {
    const tokyo = prefectures.find(prefecture => prefecture.code === TOKYO);
    const statuses = (tokyo?.specialties ?? []).map(specialty => specialty.status);
    expect(statuses).toContain('verified');
    expect(statuses).toContain('draft');

    await page.goto('/ja/');

    // ふりがな（<rt>）は本文に含めずに比べる（ツールチップは hidden なので、DOM の文字を読む）
    const names = await page.locator(`[data-tip-pref="${TOKYO}"] li`).evaluateAll(items =>
      items.map(item => {
        const copy = item.cloneNode(true) as Element;
        copy.querySelectorAll('rt').forEach(rt => rt.remove());
        return copy.textContent;
      })
    );
    expect(names).toEqual((tokyo?.specialties ?? []).map(specialty => plainText(specialty.name.ja)));
  });
});

test.describe('7.1：プレビューのカードの「下書き」の印', () => {
  test('東京都のカードで、reviewed でない項目（3つ）にだけ「下書き」の印が出る', async ({ page }) => {
    // Arrange：フィクスチャの東京都は、名物の2つ（verified・draft）と名所の1つ（verified）が reviewed でない
    const tokyo = prefectures.find(prefecture => prefecture.code === TOKYO);
    const items = [...(tokyo?.specialties ?? []), ...(tokyo?.spots ?? [])];
    const expected = items.filter(item => item.status !== 'reviewed').map(item => item.id);
    expect(expected).toHaveLength(3);
    await page.goto('/en/');
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
    await page.locator('[data-index-ready]').waitFor({ state: 'attached' });

    // Act
    await page.locator(`a[data-pref="${TOKYO}"]`).click();

    // Assert：準備中の県ではなく、内容を出す。印は、reviewed でない項目にだけ付く
    const card = page.locator(`[data-card-pref="${TOKYO}"]`);
    await expect(card.locator('[data-card-coming-soon]')).toHaveCount(0);
    await expect(card.locator('[data-card-item]')).toHaveCount(items.length);
    const marked = await card.locator('[data-card-item]').evaluateAll(elements => elements.filter(element => element.querySelector('[data-card-draft]') !== null).map(element => element.getAttribute('data-card-item')));
    expect(marked).toEqual(expected);
    await expect(card.locator('[data-card-draft]').first()).toHaveText('Draft');
  });
});

test.describe('R4・11.4 (5)：プレビューには noindex が付く', () => {
  for (const lang of LANGS) {
    test(`/${lang}/ に <meta name="robots" content="noindex"> がある`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    });
  }
});
