import { expect, test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';

// F-IDX-01〜03、6.6 (2)：県名さくいん（T2-10）。ホバー・クリック・ダブルクリックは interaction.spec.ts で、地図と同じテストを回す。

const prefectures = loadContent();
const CODES = prefectures.map(prefecture => prefecture.code);

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page): Promise<void> {
  await page.goto('/ja/');
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
}

/** いまフォーカスしている県名の項目の県コード（項目でなければ null） */
const focusedCode = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('data-pref') ?? null);

test.describe('F-IDX-01：8地方の見出しと、47の県名', () => {
  for (const lang of LANGS) {
    test(`${lang}：8地方の見出し（h3）が地方の順にあり、47の県名がある`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      const regions = getMessages(lang).regions;
      const headings = page.locator('[data-area="index"] h3');
      await expect(headings).toHaveCount(8);
      const expected = Object.values(regions).map(plainText);
      // ふりがな（<rt>）は本文に含めずに比べる
      const texts = await headings.evaluateAll(elements =>
        elements.map(element => {
          const copy = element.cloneNode(true) as Element;
          copy.querySelectorAll('rt').forEach(rt => rt.remove());
          return copy.textContent;
        })
      );
      expect(texts).toEqual(expected);
      await expect(page.locator('[data-area="index"] a[data-pref]')).toHaveCount(47);
    });
  }

  test('見出しの h3 は、さくいんの見出し h2 の下にある', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('[data-area="index"] h2')).toHaveCount(1);
    await expect(page.locator('[data-area="index"] h2 ~ div h3')).toHaveCount(8);
  });
});

test.describe('F-IDX-03：キーボード', () => {
  test.beforeEach(({ hasTouch }) => {
    test.skip(hasTouch, 'キーボードを使う PC のプロジェクトだけで確かめる');
  });

  test('Tab キーで47の県名を県コードの順にたどれる', async ({ page }) => {
    await open(page);
    await page.locator('a[data-pref="01"]').focus();
    const visited = [await focusedCode(page)];

    for (let i = 1; i < CODES.length; i += 1) {
      await page.keyboard.press('Tab');
      visited.push(await focusedCode(page));
    }

    expect(visited).toEqual(CODES);
  });

  test('4.11.2：Tab で項目にフォーカスすると、カードの県が変わる（フォーカス＝ホバー）', async ({ page }) => {
    await open(page);
    await page.locator('a[data-pref="01"]').focus();

    await page.keyboard.press('Tab');

    await expect(page.locator('[data-card-pref]:not([hidden])')).toHaveAttribute('data-card-pref', '02');
  });

  test('4.11.2：Enter・Space で固定と解除、Shift + Enter で最大化する', async ({ page }) => {
    await open(page);
    const item = page.locator('a[data-pref="20"]');
    await item.focus();

    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect(item).toHaveAttribute('data-state', 'pinned');
    await page.keyboard.press('Space');
    await expect(item).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Shift+Enter');
    await expect(item).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('path[data-pref="20"]')).toHaveAttribute('data-state', 'maximized');
    // Enter でリンクが移動していない（ハッシュが付かない）
    expect(new URL(page.url()).hash).toBe('');
  });
});

test.describe('6.6 (2)：JavaScript を無効にしたとき', () => {
  test.use({ javaScriptEnabled: false });

  test('県名のクリックで、URL のハッシュが #pref-NN になる', async ({ page }) => {
    await page.goto('/ja/');

    await page.locator('a[data-pref="20"]').click();

    await expect.poll(() => new URL(page.url()).hash).toBe('#pref-20');
  });
});
