import { expect, test, type Page } from '@playwright/test';
import { REGIONS } from '../../src/features/map/regions';
import { LANGS, type Lang } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { publish } from '../../src/lib/publish';
import { plainText } from '../../src/lib/ruby';

// F-MAP-01〜04・06・D24：都道府県の地図（T2-04）。県の基本情報は、E2E のサーバーがビルドで読むのと同じ tests/fixtures/content/（`CONTENT_DIR`）

// E2E のビルドは本番用でフィクスチャのコンテンツ。北海道だけが内容を出し、残りの46県は「準備中」（4.11.4）
const published = publish(loadContent('tests/fixtures/content'), 'production');

/** 要素の外接矩形（viewBox の単位）。getBBox は SVG の座標なので、画面の幅に左右されない */
type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

async function boxesOf(page: Page, selector: string): Promise<readonly Rect[]> {
  return page.locator(selector).evaluateAll(elements =>
    elements.map(element => {
      const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
      return { x, y, width, height };
    })
  );
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('県の形', () => {
  for (const lang of LANGS) {
    test(`F-MAP-01・5.2：県の形が47個あり、aria-label が県名である（準備中の県は「（準備中）」が付く。${lang}）`, async ({ page }) => {
      // Arrange・Act
      await page.goto(`/${lang}/`);

      // Assert
      const paths = page.locator('path[data-pref]');
      await expect(paths).toHaveCount(47);
      const labels = await paths.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
      const suffix = plainText(getMessages(lang).comingSoon.indexSuffix);
      expect(labels).toEqual(published.map(prefecture => `${plainText(prefecture.name[lang])}${prefecture.pending ? suffix : ''}`));
      expect(published.filter(prefecture => !prefecture.pending).map(prefecture => prefecture.code)).toEqual(['01']);
      await expect(paths.first()).toHaveAttribute('role', 'button');
    });
  }

  test('F-MAP-02：沖縄県の形が点線枠の中にある', async ({ page }) => {
    await page.goto('/ja/');

    const [okinawa] = await boxesOf(page, 'path[data-pref="47"]');
    const [frame] = await boxesOf(page, '[data-okinawa-frame]');
    if (!okinawa || !frame) throw new Error('沖縄県の形か点線枠が見つからない');
    expect(okinawa.x).toBeGreaterThanOrEqual(frame.x);
    expect(okinawa.y).toBeGreaterThanOrEqual(frame.y);
    expect(okinawa.x + okinawa.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(okinawa.y + okinawa.height).toBeLessThanOrEqual(frame.y + frame.height);
  });

  test('F-MAP-04：colorScheme が dark のとき、県の塗りと海の色がライトのときと変わる', async ({ page }) => {
    await page.goto('/ja/');
    const fillOf = (selector: string) => page.locator(selector).evaluate(element => getComputedStyle(element).fill);

    await page.emulateMedia({ colorScheme: 'light' });
    // 東京都は準備中（斜線）なので、地方の色で塗られる北海道で比べる（4.11.4）
    const light = { hokkaido: await fillOf('path[data-pref="01"]'), sea: await fillOf('[data-map-sea]') };
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = { hokkaido: await fillOf('path[data-pref="01"]'), sea: await fillOf('[data-map-sea]') };

    expect(dark.hokkaido).not.toBe(light.hokkaido);
    expect(dark.sea).not.toBe(light.sea);
  });
});

test.describe('県名ラベル', () => {
  test('F-MAP-01：幅820pxでは県名ラベルが見えず、幅821pxでは見える', async ({ page, isMobile }) => {
    // スマホ・タブレットのエミュレーション（isMobile）は meta viewport の扱いが PC と違うので、PC のプロジェクトだけで幅を指定する
    test.skip(isMobile, 'isMobile のプロジェクトでは幅を指定しない');
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto('/ja/');
    const labels = page.locator('[data-pref-labels]');

    await expect(labels).toBeHidden();

    await page.setViewportSize({ width: 821, height: 900 });
    await expect(labels).toBeVisible();
    await expect(page.locator('[data-pref-label="13"]')).toBeVisible();
  });

  for (const lang of LANGS) {
    test(`F-MAP-01：県名ラベルどうしが重ならない（${lang}）`, async ({ page, browserName, isMobile }) => {
      // 文字の幅はフォントで変わる。重ならない配置は、chromium（既定のフォント）で確かめる。
      // getBBox() は文字の外接矩形（ascent＋descent。字の見た目より縦に大きい）で測るので、runner のフォントが変わると結果が変わる。
      // 落ちたら、まずフォントの違いを疑う（ずらしは `prefPaths.ts` の LABEL_OFFSETS。文字の大きさは LABEL_FONT_SIZE）
      test.skip(browserName !== 'chromium' || isMobile, 'フォントで幅が変わるので、PC の chromium だけで確かめる');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${lang}/`);

      const boxes = await boxesOf(page, '[data-pref-label]');
      const codes = await page.locator('[data-pref-label]').evaluateAll(elements => elements.map(element => element.getAttribute('data-pref-label')));
      const overlapping = boxes.flatMap((a, i) => boxes.slice(i + 1).flatMap((b, j) => (overlaps(a, b) ? [`${codes[i]}-${codes[i + 1 + j]}`] : [])));
      expect(overlapping).toEqual([]);
    });
  }
});

test.describe('凡例・海域名', () => {
  for (const lang of LANGS satisfies readonly Lang[]) {
    test(`F-MAP-03：凡例に8地方がある（${lang}）`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      const items = page.locator('li[data-legend-region]');
      await expect(items).toHaveCount(8);
      const regions = getMessages(lang).regions;
      // 地方名のふりがな（<rt>）は本文に含めずに比べる
      const names = await items.evaluateAll(elements =>
        elements.map(element => {
          const copy = element.cloneNode(true) as Element;
          copy.querySelectorAll('rt').forEach(rt => rt.remove());
          return { region: element.getAttribute('data-legend-region'), name: copy.textContent };
        })
      );
      expect(names).toEqual(REGIONS.map(region => ({ region, name: plainText(regions[region]) })));
    });

    test(`F-MAP-06：海域名が2つ表示される（${lang}）`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      const seas = page.locator('[data-sea-label]');
      await expect(seas).toHaveCount(2);
      await expect(seas.nth(0)).toBeVisible();
      await expect(seas.nth(1)).toBeVisible();
      await expect(seas.nth(0)).toHaveText(plainText(getMessages(lang).seas.japanSea));
      await expect(seas.nth(1)).toHaveText(plainText(getMessages(lang).seas.pacific));
    });
  }
});

test.describe('JavaScript を無効にする', () => {
  test.use({ javaScriptEnabled: false });

  test('D24：JavaScriptを無効にしても、県の形が47個ある', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('path[data-pref]')).toHaveCount(47);
    await expect(page.locator('path[data-pref="13"]')).toBeVisible();
  });
});
