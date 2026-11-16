import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';
import { settle, settledPoint, textWithoutRt } from './helpers';

// F-TIP-01・02、4.11.3、4.11.4：ツールチップ（T2-09）。コンテンツは tests/fixtures/content/（playwright.config.ts の CONTENT_DIR。開発計画 1.1）。
// 北海道は名物が3つ（reviewed）、沖縄県は名物がない（未作成）。マウスの位置は、形の内側の点（外接矩形の中心は、北海道・沖縄県では形の外になる）。

const prefectures = loadContent('tests/fixtures/content');
const HOKKAIDO = '01';
const OKINAWA = '47';
const TOOLTIP = '[data-tooltip]';
const PREF = (code: string) => `path[data-pref="${code}"]`;
/** 海（日本海）の1点。viewBox の (370, 470)＝海域名の位置で、陸がなく、文字は pointer-events を受けない */
const SEA_POINT = { x: 370 / 1000, y: 470 / 1130 } as const;

const prefOf = (code: string) => {
  const found = prefectures.find(prefecture => prefecture.code === code);
  if (!found) throw new Error(`フィクスチャに県 ${code} がありません`);
  return found;
};

/** 操作の前に、ハイドレーションが終わるのを待つ（終わる前の操作は失われる） */
async function open(page: Page, lang = 'ja'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

/** 形を画面に入れてから、形の内側の点を返す（動きが止まるのを待つ） */
async function pointOn(locator: Locator): Promise<{ readonly x: number; readonly y: number }> {
  await locator.scrollIntoViewIfNeeded();
  return settledPoint(locator);
}

/** 県の形の内側にマウスを動かす。マウスの位置を返す */
async function hoverPref(page: Page, code: string): Promise<{ readonly x: number; readonly y: number }> {
  const point = await pointOn(page.locator(PREF(code)));
  await page.mouse.move(point.x, point.y);
  return point;
}

/** マウスを海へ動かす */
async function hoverSea(page: Page): Promise<void> {
  const sea = page.locator('[data-map-sea]');
  const box = await sea.boundingBox();
  if (!box) throw new Error('海の矩形が見つからない');
  await page.mouse.move(box.x + box.width * SEA_POINT.x, box.y + box.height * SEA_POINT.y);
}

/** 県を最大化して、市区町村の読み込みが終わるのを待つ（北海道は外接矩形の中心が県の外なので、dblclick のイベントを直接送る） */
async function maximize(page: Page, code: string): Promise<void> {
  await page.locator(PREF(code)).dispatchEvent('dblclick');
  await expect(page.locator(PREF(code))).toHaveAttribute('data-state', 'maximized');
  await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
  await expect(page.locator(`[data-muni-layer][data-muni-pref="${code}"]`)).toBeAttached();
}

test.describe('PC（マウス）', { tag: '@pc' }, () => {
  test('F-TIP-01：名物のある県（北海道）にマウスをのせると、県名と名物3つの名前が出る', async ({ page }) => {
    await open(page);

    await hoverPref(page, HOKKAIDO);

    const tip = page.locator(`[data-tip-pref="${HOKKAIDO}"]`);
    await expect(tip).toBeVisible();
    const hokkaido = prefOf(HOKKAIDO);
    expect(await textWithoutRt(tip.locator('[data-tip-name]'))).toBe(plainText(hokkaido.name.ja));
    await expect(tip.locator('li')).toHaveCount(3);
    const names = await tip.locator('li').evaluateAll(items =>
      items.map(item => {
        const copy = item.cloneNode(true) as Element;
        copy.querySelectorAll('rt').forEach(rt => rt.remove());
        return copy.textContent;
      })
    );
    expect(names).toEqual(hokkaido.specialties.map(specialty => plainText(specialty.name.ja)));
    // 解説文は出さない（6.6 (2)）
    expect(await tip.textContent()).not.toContain(plainText(hokkaido.specialties[0]?.description.ja.adult ?? '').slice(0, 8));
  });

  test('4.11.4：名物がない県（沖縄県）では、県名だけが出る', async ({ page }) => {
    await open(page);

    await hoverPref(page, OKINAWA);

    const tip = page.locator(`[data-tip-pref="${OKINAWA}"]`);
    await expect(tip).toBeVisible();
    expect(await textWithoutRt(tip)).toBe(plainText(prefOf(OKINAWA).name.ja));
    await expect(tip.locator('li')).toHaveCount(0);
  });

  test('F-TIP-01：県から海にマウスを動かすと隠れる', async ({ page }) => {
    await open(page);
    await hoverPref(page, HOKKAIDO);
    await expect(page.locator(TOOLTIP)).toBeVisible();

    await hoverSea(page);

    await expect(page.locator(TOOLTIP)).toBeHidden();
  });

  test('F-TIP-01：ツールチップはマウスの右下にずれて出て、地図の箱の中に収まる', async ({ page }) => {
    await open(page);

    const mouse = await hoverPref(page, HOKKAIDO);

    const tooltip = await page.locator(TOOLTIP).boundingBox();
    const box = await page.locator('[data-map-box]').boundingBox();
    if (!tooltip || !box) throw new Error('位置を取れません');
    // 北海道の点は地図の箱の右上寄りで、右にも下にも収まるので、反転せずに右下に出る（ずらす距離は12px）
    expect(tooltip.x - mouse.x).toBeGreaterThanOrEqual(0);
    expect(tooltip.x - mouse.x).toBeLessThanOrEqual(24);
    expect(tooltip.y - mouse.y).toBeGreaterThanOrEqual(0);
    expect(tooltip.y - mouse.y).toBeLessThanOrEqual(24);
    expect(tooltip.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(tooltip.y).toBeGreaterThanOrEqual(box.y - 1);
    expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(tooltip.y + tooltip.height).toBeLessThanOrEqual(box.y + box.height + 1);
  });

  test('F-TIP-02：最大化中、札幌市中央区にマウスをのせると「札幌市中央区」と読みが出る', async ({ page }) => {
    await open(page);
    await maximize(page, HOKKAIDO);
    const { x, y } = await pointOn(page.locator('[data-muni="01101"]'));

    await page.mouse.move(x, y);

    const tip = page.locator('[data-tip-muni]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('札幌市中央区');
    await expect(tip.locator('[data-tip-reading]')).toHaveText('さっぽろしちゅうおうく');
    // 県のツールチップは出ない（4.11.2）
    await expect(page.locator(`[data-tip-pref]:visible`)).toHaveCount(0);
  });

  test('F-I18N-05：英語のページの市区町村のツールチップはローマ字だけ', async ({ page }) => {
    await open(page, 'en');
    await maximize(page, HOKKAIDO);
    const { x, y } = await pointOn(page.locator('[data-muni="01101"]'));

    await page.mouse.move(x, y);

    await expect(page.locator('[data-tip-muni]')).toHaveText('Chuo-ku, Sapporo-shi');
    await expect(page.locator('[data-tip-reading]')).toHaveCount(0);
  });
});

test.describe('スマホ・タブレット（タッチ）', { tag: '@touch' }, () => {
  test('4.11.3：県をタップしても、ツールチップは出ない', async ({ page }) => {
    await open(page);
    const { x, y } = await pointOn(page.locator(PREF(HOKKAIDO)));

    await page.touchscreen.tap(x, y);
    await settle(page);

    // タップで固定された（カードは変わる）が、ツールチップは出ない
    await expect(page.locator(`${PREF(HOKKAIDO)}[aria-pressed="true"]`)).toBeAttached();
    await expect(page.locator(TOOLTIP)).toBeHidden();
  });
});
