import { expect, test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';
import { settledPoint } from './helpers';

// 4.11.4・7.1・R1・R4：本番用のビルド（T3-02）。コンテンツは tests/fixtures/content/（playwright.config.ts の CONTENT_DIR。開発計画 1.1）。
// 北海道は全部 reviewed（内容を出す）、東京都は reviewed・verified・draft が混在、沖縄県は未作成。内容を出すのは北海道だけで、残りの46県は「準備中」。
// プレビュー用のビルドの確認は tests/e2e-preview/preview.spec.ts

const prefectures = loadContent('tests/fixtures/content');
const HOKKAIDO = '01';
const TOKYO = '13';
const OKINAWA = '47';

const prefOf = (code: string) => {
  const found = prefectures.find(prefecture => prefecture.code === code);
  if (!found) throw new Error(`フィクスチャに県 ${code} がありません`);
  return found;
};

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, lang = 'ja'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

const fillOf = (page: Page, code: string): Promise<string> => page.locator(`path[data-pref="${code}"]`).evaluate(element => getComputedStyle(element).fill);

test.describe('4.11.4：準備中の県の表示', () => {
  test('準備中の県（東京都・沖縄県）は斜線で塗られ、北海道は地方の色', async ({ page }) => {
    await page.goto('/ja/');

    // 斜線は fill: url(#pref-pending-hatch)、地方の色は rgb(...)
    expect(await fillOf(page, TOKYO)).toContain('url(');
    expect(await fillOf(page, OKINAWA)).toContain('url(');
    expect(await fillOf(page, HOKKAIDO)).not.toContain('url(');
    await expect(page.locator('path[data-pref][data-pending]')).toHaveCount(46);
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).not.toHaveAttribute('data-pending');
    await expect(page.locator('pattern#pref-pending-hatch')).toHaveCount(1);
  });

  for (const lang of LANGS) {
    test(`凡例に「準備中」が出る（${lang}）`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      const item = page.locator('[data-legend-pending]');
      await expect(item).toHaveCount(1);
      // ふりがな（<rt>）は本文に含めずに比べる
      const text = await item.evaluate(element => {
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll('rt').forEach(rt => rt.remove());
        return copy.textContent;
      });
      expect(text).toBe(plainText(getMessages(lang).comingSoon.label));
      await expect(page.locator('[data-legend-region]')).toHaveCount(8);
    });
  }

  test('さくいんの準備中の県に（準備中）が付き、北海道には付かない', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('[data-area="index"] [data-index-pending]')).toHaveCount(46);
    await expect(page.locator(`a[data-pref="${TOKYO}"] [data-index-pending]`)).toHaveCount(1);
    await expect(page.locator(`a[data-pref="${OKINAWA}"] [data-index-pending]`)).toHaveCount(1);
    await expect(page.locator(`a[data-pref="${HOKKAIDO}"] [data-index-pending]`)).toHaveCount(0);
    // ふりがな（<rt>）は本文に含めずに比べる
    const suffix = await page.locator(`a[data-pref="${TOKYO}"] [data-index-pending]`).evaluate(element => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('rt').forEach(rt => rt.remove());
      return copy.textContent;
    });
    expect(suffix).toBe('（準備中）');
  });

  test('準備中の県の形の aria-label に（準備中）が付く', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator(`path[data-pref="${TOKYO}"]`)).toHaveAttribute('aria-label', '東京都（準備中）');
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('aria-label', '北海道');
  });

  test('準備中の県のツールチップは、名物があるフィクスチャ（東京都）でも県名だけ', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'タッチの端末にはマウスのホバーがない（4.11.3）');
    await open(page);
    const path = page.locator(`path[data-pref="${TOKYO}"]`);
    await path.scrollIntoViewIfNeeded();
    const point = await settledPoint(path);

    await page.mouse.move(point.x, point.y);

    const tip = page.locator(`[data-tip-pref="${TOKYO}"]`);
    await expect(tip).toBeVisible();
    await expect(tip.locator('li')).toHaveCount(0);
    expect(await tip.evaluate(element => element.querySelectorAll('rt').length)).toBeGreaterThan(0);
    await expect(tip.locator('[data-tip-name]')).toContainText('東京都');
  });
});

test.describe('R1：本番用のビルドに、reviewed でない項目の文が含まれない', () => {
  for (const lang of LANGS) {
    test(`HTML に、東京都の名物・名所（verified・draft を含む）の名前・解説文が1つも出てこない（${lang}）`, async ({ request }) => {
      // Arrange：東京都は準備中なので、reviewed の項目も含めて、すべての文が出てはいけない
      const tokyo = prefOf(TOKYO);
      const items = [...tokyo.specialties, ...tokyo.spots];
      expect(items.map(item => item.status)).toContain('verified');
      expect(items.map(item => item.status)).toContain('draft');
      const forbidden = items.flatMap(item => [...Object.values(item.name), ...Object.values(item.description).flatMap(({ kids, adult }) => [kids, adult])]);

      // Act
      const html = await (await request.get(`/${lang}/`)).text();

      // Assert：記法のままの文と、ふりがなを除いた文のどちらも出てこない
      for (const text of forbidden) {
        expect(html).not.toContain(text);
        expect(html).not.toContain(plainText(text));
      }
      // 比較のため：reviewed の北海道の名物の名前は出てくる
      for (const specialty of prefOf(HOKKAIDO).specialties) {
        expect(html).toContain(plainText(specialty.name[lang]).slice(0, 4));
      }
      // 行き方（東京都は reviewed）も出ない
      expect(html).not.toContain(plainText(tokyo.access?.route.ja ?? '？'));
    });
  }
});

test.describe('R4：本番用のビルドには noindex が付かない', () => {
  for (const lang of LANGS) {
    test(`/${lang}/ に robots の noindex がない`, async ({ page, request }) => {
      await page.goto(`/${lang}/`);

      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      expect(await (await request.get(`/${lang}/`)).text()).not.toContain('noindex');
    });
  }
});
