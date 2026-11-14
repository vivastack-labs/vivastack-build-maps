import { expect, test, type Page } from '@playwright/test';
import { dblclickAtCenter, settle } from './helpers';

// F-ZOOM-01〜05、4.11.2・4.11.3：拡大・縮小・移動（T2-06）。
// 倍率は地図の層（<g data-map-layer>）の data-zoom-scale で読む。動き（300ms）の途中を見ないよう、
// 最終の値は expect.poll で待つ。動きを減らす設定（F-ZOOM-05）のテストだけは待たずに読む。
// ホバー・クリックの対象は interaction.spec.ts と同じ、外接矩形の中心が自分の形の中にある長野県（20）。

const NAGANO = '20';
const YAMANASHI = '19';
const LAYER = '[data-map-layer]';

/** 操作の前に、ハイドレーションが終わるのを待つ（終わる前の操作は失われる） */
async function open(page: Page): Promise<void> {
  await page.goto('/ja/');
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

const scaleOf = async (page: Page): Promise<number> => Number(await page.locator(LAYER).getAttribute('data-zoom-scale'));
const transformOf = (page: Page): Promise<string | null> => page.locator(LAYER).getAttribute('transform');
/** 要素の外接矩形の中心（表示の中の座標）。長野県は、中心が自分の形の中にある */
async function centerOf(page: Page, selector: string): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} が見つからない`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const zoomButton = (page: Page, kind: 'in' | 'out' | 'reset') => page.locator(`[data-zoom="${kind}"]`);

/** 倍率が目標の値になるのを待つ */
async function expectScale(page: Page, expected: number): Promise<void> {
  await expect.poll(() => scaleOf(page)).toBeCloseTo(expected, 2);
}

test.describe('ボタンでの拡大・縮小（全プロジェクト）', () => {
  test('F-ZOOM-01：「＋」で倍率が上がり、「−」で下がる', async ({ page }) => {
    await open(page);
    expect(await scaleOf(page)).toBe(1);

    await zoomButton(page, 'in').click();
    await expectScale(page, 1.5);
    await zoomButton(page, 'in').click();
    await expectScale(page, 2.25);
    await zoomButton(page, 'out').click();
    await expectScale(page, 1.5);
  });

  test('F-ZOOM-02：「全体」で倍率が1に戻る', async ({ page }) => {
    await open(page);
    await zoomButton(page, 'in').click();
    await expectScale(page, 1.5);

    await zoomButton(page, 'reset').click();

    await expectScale(page, 1);
    await expect.poll(() => transformOf(page)).toBe('translate(0,0) scale(1)');
  });

  test('F-ZOOM-05：動きを減らす設定では、操作の直後に最終の位置になっている', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    await zoomButton(page, 'in').click();

    // 待たずに読む（動きがあれば、まだ 1 に近い値が読めて失敗する）
    expect(await scaleOf(page)).toBe(1.5);
  });

  test('4.11.3：地図の <svg> は touch-action: none で、ブラウザのスクロール・拡大に取られない', async ({ page }) => {
    await open(page);

    const touchAction = await page.locator('[data-area="map"] svg').evaluate(element => getComputedStyle(element).touchAction);

    expect(touchAction).toBe('none');
  });
});

test.describe('PC のマウス操作', () => {
  test.beforeEach(({ hasTouch }) => {
    test.skip(hasTouch, 'ホイール・ドラッグ・ダブルクリックはマウスの操作（4.11.3）');
  });

  test('F-ZOOM-01：ホイールで倍率が変わる', async ({ page }) => {
    await open(page);
    await page.locator('[data-map-sea]').hover();

    await page.mouse.wheel(0, -300);
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(1.2);
    const zoomedIn = await scaleOf(page);
    await page.mouse.wheel(0, 300);

    await expect.poll(() => scaleOf(page)).toBeLessThan(zoomedIn);
  });

  test('F-ZOOM-03：拡大した後、ドラッグで表示位置が変わり、固定は変わらない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await zoomButton(page, 'in').click();
    await zoomButton(page, 'in').click();
    const before = await transformOf(page);

    // 県（長野県）の上から左上へドラッグする。県の上でも、ドラッグの後の click は県に届かない
    const { x, y } = await centerOf(page, `path[data-pref="${NAGANO}"]`);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y - 40, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => transformOf(page)).not.toBe(before);
    expect(await scaleOf(page)).toBeCloseTo(2.25, 2);
    // 固定が「変わらない」ことは、操作の反映を待ってから確かめる（待たないと、固定される前の DOM を見て通ってしまう）
    await settle(page);
    await expect(page.locator('[data-pref][aria-pressed="true"]')).toHaveCount(0);
  });

  test('F-CARD-07：ほんの少し（3px 以内）手がぶれたクリックは、ふつうのクリックとして県を固定する', async ({ page }) => {
    await open(page);
    const pref = page.locator(`path[data-pref="${NAGANO}"]`);
    const { x, y } = await centerOf(page, `path[data-pref="${NAGANO}"]`);
    await page.mouse.move(x, y);

    await page.mouse.down();
    await page.mouse.move(x + 1, y + 1);
    await page.mouse.up();

    await expect(pref).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-ZOOM-04：最大化すると、その県の範囲が表示領域いっぱいになる', async ({ page }) => {
    await open(page);

    await page.locator(`path[data-pref="${NAGANO}"]`).dblclick();

    await expect
      .poll(async () => {
        const pref = await page.locator(`path[data-pref="${NAGANO}"]`).boundingBox();
        const box = await page.locator('[data-map-box]').boundingBox();
        if (!pref || !box) return null;
        const isInside = pref.x >= box.x - 1 && pref.y >= box.y - 1 && pref.x + pref.width <= box.x + box.width + 1 && pref.y + pref.height <= box.y + box.height + 1;
        return isInside ? Math.max(pref.width / box.width, pref.height / box.height) : null;
      })
      .toBeGreaterThanOrEqual(0.85);
  });

  test('F-ZOOM-01：最大化しても、県名ラベルの画面の上の高さと県境の線の太さは全体表示のときとほぼ同じ', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', '見た目の大きさの検査は chromium だけで足りる');
    await open(page);
    // 最大化した県（長野県）の県名ラベルは、市区町村のラベルと重なるので隠す（T2-08）。隣の山梨県のラベルで確かめる
    const label = page.locator(`[data-pref-label="${YAMANASHI}"]`);
    const heightOf = async (): Promise<number> => (await label.boundingBox())?.height ?? 0;
    const before = await heightOf();
    expect(before).toBeGreaterThan(0);

    await page.locator(`path[data-pref="${NAGANO}"]`).dblclick();
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(5);

    // 文字の大きさは「基準 ÷ 倍率」なので、画面の上の高さは倍率によらない
    await expect.poll(async () => (await heightOf()) / before).toBeCloseTo(1, 1);
    // 線の太さも「基準 ÷ 倍率」。倍率をかけると、全体表示のときの太さ（0.8）に戻る
    const strokeWidth = await page.locator('[data-map-layer] > g.stroke-map-border').evaluate(element => Number.parseFloat(getComputedStyle(element).strokeWidth));
    expect(strokeWidth * (await scaleOf(page))).toBeCloseTo(0.8, 1);
  });

  test('F-ZOOM-04：最大化を解除すると全体表示に戻る', async ({ page }) => {
    await open(page);
    await page.locator(`path[data-pref="${NAGANO}"]`).dblclick();
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(2);

    // 最大化した県の上には市区町村の形が重なるので、座標でダブルクリックする（helpers.ts）
    await dblclickAtCenter(page, page.locator(`path[data-pref="${NAGANO}"]`));

    await expectScale(page, 1);
  });

  test('F-ZOOM-04：最大化した後の「全体」で全体表示に戻り、最大化が解ける', async ({ page }) => {
    await open(page);
    await page.locator(`path[data-pref="${NAGANO}"]`).dblclick();
    await expect(page.locator(`path[data-pref="${NAGANO}"]`)).toHaveAttribute('data-state', 'maximized');

    await zoomButton(page, 'reset').click();

    await expectScale(page, 1);
    await expect(page.locator(`path[data-pref="${NAGANO}"]`)).toHaveAttribute('data-state', 'pinned');
  });
});

test.describe('スマホのタッチ操作（pixel。Chromium の CDP）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel', 'CDP の Input.dispatchTouchEvent は Chromium だけ。iPhone は T4-06 の実機で確かめる');
  });

  /** 地図の中心の座標（表示の中で）。画面の外ならスクロールして出す */
  async function mapCenter(page: Page): Promise<{ readonly x: number; readonly y: number }> {
    await page.locator('[data-area="map"] svg').scrollIntoViewIfNeeded();
    const box = await page.locator('[data-area="map"] svg').boundingBox();
    if (!box) throw new Error('地図が見つからない');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test('F-ZOOM-01：ピンチで倍率が変わる', async ({ page, context }) => {
    await open(page);
    const { x, y } = await mapCenter(page);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', gap: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: x - gap, y, id: 1 },
                { x: x + gap, y, id: 2 }
              ]
      });

    // 2本指を 30px 離した位置から 100px まで広げる
    await touch('touchStart', 30);
    for (const gap of [40, 55, 70, 85, 100]) await touch('touchMove', gap);
    await touch('touchEnd', 100);

    await expect.poll(() => scaleOf(page)).toBeGreaterThan(1.5);
  });

  test('F-ZOOM-03：拡大した後、1本指のスワイプで表示位置が変わり、固定は変わらない', async ({ page, context }) => {
    await open(page);
    await zoomButton(page, 'in').click();
    await zoomButton(page, 'in').click();
    await expectScale(page, 2.25);
    const before = await transformOf(page);
    const { x, y } = await mapCenter(page);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', dx: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x + dx, y, id: 1 }] });

    await touch('touchStart', 0);
    for (const dx of [-20, -40, -60, -80]) await touch('touchMove', dx);
    await touch('touchEnd', -80);

    await expect.poll(() => transformOf(page)).not.toBe(before);
    // 固定が「変わらない」ことは、操作の反映を待ってから確かめる（待たないと、固定される前の DOM を見て通ってしまう）
    await settle(page);
    await expect(page.locator('[data-pref][aria-pressed="true"]')).toHaveCount(0);
  });
});
