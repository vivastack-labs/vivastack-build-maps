import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dblclickAtCenter, settledPoint } from './helpers';

// F-MUNI-01〜04、4.11.6、F-I18N-05：市区町村の描画（T2-08）。
// PC はダブルクリック、タッチ端末はカードのボタンから最大化する。読み込みが終わるのは [data-muni-status="loaded"] で待つ。
// 最大化の対象は、外接矩形の中心が自分の形の中にある長野県（20）。北海道（01）は中心が県の外になることがあるので、dblclick イベントを直接送る。
// 市区町村の件数・名前の期待値は、コミットされた public/geo/muni/NN.topo.json から読む。

const NAGANO = '20';
const YAMANASHI = '19';
const HOKKAIDO = '01';
const PREF = (code: string) => `path[data-pref="${code}"]`;
const LAYER = '[data-map-layer]';

type Muni = { readonly code: string; readonly ja: string; readonly en: string };

/** コミットされたデータから、県の市区町村（code の順）を読む */
function muniOf(pref: string): readonly Muni[] {
  const json = JSON.parse(readFileSync(join(process.cwd(), 'public', 'geo', 'muni', `${pref}.topo.json`), 'utf8')) as {
    objects: { municipalities: { geometries: { properties: { code: string; name: { ja: string; en: string } } }[] } };
  };
  return json.objects.municipalities.geometries.map(({ properties }) => ({ code: properties.code, ja: properties.name.ja, en: properties.name.en })).sort((a, b) => a.code.localeCompare(b.code));
}

/** 操作の前に、ハイドレーションが終わるのを待つ（終わる前の操作は失われる） */
async function open(page: Page, lang = 'ja'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

/** 県を最大化して、市区町村の読み込みが終わるのを待つ */
async function maximize(page: Page, pref: string): Promise<void> {
  await page.locator(PREF(pref)).dispatchEvent('dblclick');
  await expect(page.locator(PREF(pref))).toHaveAttribute('data-state', 'maximized');
  await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
  await expect(page.locator(`[data-muni-layer][data-muni-pref="${pref}"]`)).toBeAttached();
}

const scaleOf = async (page: Page): Promise<number> => Number(await page.locator(LAYER).getAttribute('data-zoom-scale'));

const fillOf = (locator: Locator): Promise<string> => locator.evaluate(element => getComputedStyle(element).fill);
const opacityOf = (locator: Locator): Promise<string> => locator.evaluate(element => getComputedStyle(element).opacity);

test.describe('F-MUNI：市区町村の描画（PC のプロジェクト）', { tag: '@pc' }, () => {
  test('F-MUNI-01：最大化すると、市区町村の形の数がデータの件数と同じになる', async ({ page }) => {
    await open(page);

    await maximize(page, NAGANO);

    await expect(page.locator('[data-muni]')).toHaveCount(muniOf(NAGANO).length);
    await expect(page.locator('[data-muni-outline]')).toHaveCount(1);
    // 隣り合う市区町村が見分けられるように、濃淡が2種類以上ある
    const shades = await page.locator('[data-muni]').evaluateAll(elements => new Set(elements.map(element => element.getAttribute('data-shade'))).size);
    expect(shades).toBeGreaterThanOrEqual(2);
  });

  test('F-MUNI-01、D16：北海道を最大化すると、札幌市が区に分かれている', async ({ page }) => {
    await open(page);

    await maximize(page, HOKKAIDO);

    await expect(page.locator('[data-muni]')).toHaveCount(muniOf(HOKKAIDO).length);
    await expect(page.locator('[data-muni="01101"]')).toBeAttached();
    await expect(page.locator('[data-muni="01100"]')).toHaveCount(0);
  });

  test('F-MUNI-03：市区町村にマウスをのせると強調される', async ({ page }) => {
    await open(page);
    await maximize(page, NAGANO);
    const city = page.locator('[data-muni="20201"]');
    const { x, y } = await settledPoint(city);
    await page.mouse.move(0, 0);
    const before = await fillOf(city);

    await page.mouse.move(x, y);

    await expect.poll(() => fillOf(city)).not.toBe(before);
  });

  test('F-MUNI-04：ほかの県が薄く表示され、別の県をダブルクリックするとその県の表示に切り替わる', async ({ page }) => {
    await open(page);
    expect(await opacityOf(page.locator(PREF(YAMANASHI)))).toBe('1');

    await maximize(page, NAGANO);

    await expect.poll(() => opacityOf(page.locator(PREF(YAMANASHI)))).toBe('0.4');
    await expect.poll(() => opacityOf(page.locator(PREF(NAGANO)))).toBe('1');
    // 最大化した県の県名ラベルは、市区町村のラベルと重なるので隠す。ほかの県名ラベルは残す
    await expect(page.locator(`[data-pref-label="${NAGANO}"]`)).toBeHidden();
    await expect(page.locator(`[data-pref-label="${YAMANASHI}"]`)).toBeVisible();

    await page.locator(PREF(YAMANASHI)).dblclick();

    await expect(page.locator(PREF(YAMANASHI))).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator(`[data-muni-layer][data-muni-pref="${YAMANASHI}"]`)).toBeAttached();
    await expect(page.locator(`[data-muni-layer][data-muni-pref="${NAGANO}"]`)).toHaveCount(0);
  });

  test('F-MUNI-04：市区町村の上でダブルクリックすると元に戻る（4.11.2）', async ({ page }) => {
    await open(page);
    await maximize(page, NAGANO);
    const { x, y } = await settledPoint(page.locator('[data-muni="20201"]'));

    await page.mouse.dblclick(x, y);

    await expect(page.locator(PREF(NAGANO))).not.toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('[data-muni-layer]')).toHaveCount(0);
    await expect.poll(() => scaleOf(page)).toBe(1);
  });

  test('F-MUNI-04：最大化した県をダブルクリックすると元に戻り、市区町村の形は消える', async ({ page }) => {
    await open(page);
    await maximize(page, NAGANO);

    await dblclickAtCenter(page, page.locator(PREF(NAGANO)));

    await expect(page.locator('[data-muni-layer]')).toHaveCount(0);
  });

  test('F-MUNI-02：拡大するとラベルが増える', async ({ page }) => {
    await open(page);
    await maximize(page, NAGANO);
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(2);
    const visibleCount = (): Promise<number> => page.locator('[data-muni-label]').evaluateAll(elements => elements.filter(element => getComputedStyle(element).visibility !== 'hidden').length);
    // 最大化の動きが終わって、倍率が止まるのを待つ
    await expect
      .poll(async () => {
        const first = await scaleOf(page);
        await page.waitForTimeout(100);
        return first === (await scaleOf(page));
      })
      .toBe(true);
    const scaleBefore = await scaleOf(page);
    const before = await visibleCount();
    expect(before).toBeGreaterThan(0);

    await page.locator('[data-zoom="in"]').click();
    await page.locator('[data-zoom="in"]').click();

    await expect.poll(() => scaleOf(page)).toBeGreaterThan(scaleBefore * 1.5);
    await expect.poll(visibleCount).toBeGreaterThan(before);
  });

  test.describe('市区町村の一覧（4.11.6、F-I18N-05）', () => {
    test('4.11.6：最大化するまで「市区町村の一覧」はなく、最大化すると、すべての市区町村が code の順にある', async ({ page }) => {
      await open(page);
      await expect(page.locator('[data-muni-list]')).toHaveCount(0);

      await maximize(page, NAGANO);

      const list = page.locator('details[data-muni-list]');
      await expect(list).toBeVisible();
      await expect(list.locator('summary')).toContainText(String(muniOf(NAGANO).length));
      await list.locator('summary').click();
      await expect(list.locator('[data-muni-item]')).toHaveText(muniOf(NAGANO).map(muni => muni.ja));
    });

    test('F-I18N-05：英語のページの一覧はローマ字', async ({ page }) => {
      await open(page, 'en');

      await maximize(page, NAGANO);

      const list = page.locator('details[data-muni-list]');
      await list.locator('summary').click();
      await expect(list.locator('[data-muni-item]')).toHaveText(muniOf(NAGANO).map(muni => muni.en));
    });

    test('F-I18N-05：中国語のページの一覧は日本語の漢字表記で、lang="ja" と日本語のフォントが付く', async ({ page }) => {
      await open(page, 'zh');

      await maximize(page, NAGANO);

      const list = page.locator('details[data-muni-list]');
      await list.locator('summary').click();
      await expect(list.locator('[data-muni-item]')).toHaveText(muniOf(NAGANO).map(muni => muni.ja));
      await expect(list.locator('[data-muni-item]').first()).toHaveAttribute('lang', 'ja');
      const isJapaneseFont = await list
        .locator('[data-muni-item]')
        .first()
        .evaluate(element => getComputedStyle(element).fontFamily.includes('Noto Sans JP'));
      expect(isJapaneseFont).toBe(true);
    });
  });
});

for (const [code, name] of [
  ['13', '東京都'],
  ['14', '神奈川県']
] as const) {
  test(`F-MUNI-02 / #145：カードから${name}を最大化すると市区町村名が地図に表示される`, { tag: '@touch' }, async ({ page }) => {
    await open(page);
    await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
    await page.locator(`a[data-pref="${code}"]`).tap();

    await page.locator(`[data-card-maximize="${code}"]`).tap();

    await expect(page.locator(PREF(code))).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
    const map = page.locator('[data-map-box]');
    const labels = map.locator(`[data-muni-pref="${code}"] [data-muni-label]:visible`);
    await expect
      .poll(async () => {
        const box = await map.boundingBox();
        if (!box) return 0;
        return labels.evaluateAll(
          (elements, bounds) =>
            elements.filter(element => {
              const { left, top, right, bottom } = element.getBoundingClientRect();
              return left >= bounds.x && top >= bounds.y && right <= bounds.x + bounds.width && bottom <= bounds.y + bounds.height;
            }).length,
          box
        );
      })
      .toBeGreaterThan(0);
  });
}
