import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';

// F-CARD-01・07、F-ZOOM-04、4.11.1〜4.11.3：ホバー・固定・最大化の結線（T2-05）。
// 県の要素を引く関数を引数に取る形にしてあり、T2-10 でさくいん（F-IDX-02）の要素でも同じテストを回す。
// ホバー・クリックの対象は、外接矩形の中心が自分の形の中にある県にする（Playwright は中心を操作する）。
// 東京都は島を含むので、中心が海になる。長野県（20）・岐阜県（21）は中心が県の中にある。

const prefectures = loadContent();
const NAGANO = '20';
const GIFU = '21';

/** 県の要素を引く関数（地図の `path[data-pref]`、さくいんの項目など） */
type PrefLocator = (page: Page, code: string) => Locator;

const nameOf = (code: string): string => plainText(prefectures.find(prefecture => prefecture.code === code)?.name.ja ?? '');

/** 地図の県のパス */
const mapPref: PrefLocator = (page, code) => page.locator(`path[data-pref="${code}"]`);

/** 操作の前に、ハイドレーションが終わるのを待つ（終わる前の操作は失われる） */
async function open(page: Page): Promise<void> {
  await page.goto('/ja/');
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

/** 海（日本海）の1点。viewBox の (370, 470)＝海域名の位置で、陸がなく、文字は pointer-events を受けない */
const SEA_POINT = { x: 370 / 1000, y: 470 / 1130 } as const;

/** 海の矩形の中の1点（矩形の左上からの位置）。Playwright が画面の外なら動かして（スクロールして）から操作する */
async function seaPosition(page: Page): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator('[data-map-sea]').boundingBox();
  if (!box) throw new Error('海の矩形が見つからない');
  return { x: box.width * SEA_POINT.x, y: box.height * SEA_POINT.y };
}

/** マウスを海へ動かす */
async function hoverSea(page: Page): Promise<void> {
  await page.locator('[data-map-sea]').hover({ position: await seaPosition(page) });
}

/** 海をクリックする */
async function clickSea(page: Page): Promise<void> {
  await page.locator('[data-map-sea]').click({ position: await seaPosition(page) });
}

/**
 * 画面への反映を待つ（requestAnimationFrame を2回）。「変わらない」ことを確かめる前に呼ぶ。
 * 待たないと、操作が反映される前の DOM を見て、実装が壊れていてもテストが通ってしまう
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** カードに表示されている県名（hidden でないもの）を確かめる。県がなければ案内文が見える */
async function expectCard(page: Page, code: string | null): Promise<void> {
  const shown = page.locator('[data-card-pref]:not([hidden])');
  if (code === null) {
    await expect(shown).toHaveCount(0);
    await expect(page.locator('[data-card-guide]')).toBeVisible();
    return;
  }
  await expect(shown).toHaveCount(1);
  // 県名のふりがな（<rt>）は本文に含めずに比べる
  await expect
    .poll(() =>
      shown.evaluate(element => {
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll('rt').forEach(rt => rt.remove());
        return copy.textContent;
      })
    )
    .toBe(nameOf(code));
  await expect(page.locator('[data-card-guide]')).toBeHidden();
}

/** 固定・最大化の状態を確かめる（属性は 4.11.2 の表のとおり） */
async function expectState(pref: Locator, state: 'pinned' | 'maximized' | null): Promise<void> {
  await expect(pref).toHaveAttribute('aria-pressed', state === null ? 'false' : 'true');
  if (state === null) await expect(pref).not.toHaveAttribute('data-state', /.*/u);
  else await expect(pref).toHaveAttribute('data-state', state);
}

/** PC（マウス）の操作。`hasTouch` のプロジェクトでは動かさない */
function definePointerTests(prefOf: PrefLocator): void {
  test.describe('PC のマウス操作', () => {
    test.beforeEach(({ hasTouch }) => {
      test.skip(hasTouch, 'タッチの端末にはマウスのホバーがない（4.11.3）');
    });

    test('F-CARD-01：県にホバーすると、カードの県名が変わる', async ({ page }) => {
      await open(page);
      await expectCard(page, null);

      await prefOf(page, NAGANO).hover();
      await expectCard(page, NAGANO);

      await prefOf(page, GIFU).hover();
      await expectCard(page, GIFU);
    });

    test('4.11.1：県から海へマウスを動かしても、カードは残る', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).hover();
      await expectCard(page, NAGANO);

      await hoverSea(page);
      await settle(page);

      await expectCard(page, NAGANO);
    });

    test('F-CARD-07：クリックで固定し、別の県にホバーしてもカードが変わらない', async ({ page }) => {
      await open(page);

      await prefOf(page, NAGANO).click();
      await expectState(mapPref(page, NAGANO), 'pinned');
      await prefOf(page, GIFU).hover();
      await settle(page);

      await expectCard(page, NAGANO);
      await expectState(mapPref(page, GIFU), null);
    });

    test('4.11.2：同じ県のクリックで固定を解除する', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).click();
      await expectState(mapPref(page, NAGANO), 'pinned');

      await prefOf(page, NAGANO).click();

      await expectState(mapPref(page, NAGANO), null);
    });

    test('4.11.2：海のクリックで固定を解除する', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).click();
      await expectState(mapPref(page, NAGANO), 'pinned');

      await clickSea(page);

      // 海のクリックなら、別の県が固定されることもない
      await expectState(mapPref(page, NAGANO), null);
      await expect(page.locator('[data-pref][aria-pressed="true"]')).toHaveCount(0);
    });

    test('F-ZOOM-04：ダブルクリックで最大化と固定になる', async ({ page }) => {
      await open(page);

      await prefOf(page, NAGANO).dblclick();

      await expectState(mapPref(page, NAGANO), 'maximized');
      await expectCard(page, NAGANO);
    });

    test('4.11.2：最大化中のクリックでは何も変わらない', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).dblclick();
      await expectState(mapPref(page, NAGANO), 'maximized');

      await prefOf(page, NAGANO).click();
      await prefOf(page, GIFU).click();
      // 最大化すると県が動いて海の矩形の上を覆う（T2-06）ので、海の矩形へ直接 click を送る（海の1点を押すのではなく）
      await page.locator('[data-map-sea]').dispatchEvent('click');
      await settle(page);

      await expectState(mapPref(page, NAGANO), 'maximized');
      await expectState(mapPref(page, GIFU), null);
      await expectCard(page, NAGANO);
    });

    test('4.11.2：固定中に別の県をクリックすると、固定がその県に移る', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).click();
      await expectState(mapPref(page, NAGANO), 'pinned');

      await prefOf(page, GIFU).click();

      await expectState(mapPref(page, GIFU), 'pinned');
      await expectState(mapPref(page, NAGANO), null);
      await expectCard(page, GIFU);
    });

    test('4.11.2：最大化中に同じ県をダブルクリックすると最大化だけが解け、固定は残る', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).dblclick();
      await expectState(mapPref(page, NAGANO), 'maximized');

      await prefOf(page, NAGANO).dblclick();

      // 最大化が解けるので data-state は maximized でなくなり、固定中（pinned・aria-pressed="true"）が残る
      await expectState(mapPref(page, NAGANO), 'pinned');
      await expectCard(page, NAGANO);
    });

    test('4.11.2：最大化中に別の県をダブルクリックすると、その県に切り替わる', async ({ page }) => {
      await open(page);
      await prefOf(page, NAGANO).dblclick();
      await expectState(mapPref(page, NAGANO), 'maximized');

      await prefOf(page, GIFU).dblclick();

      await expectState(mapPref(page, GIFU), 'maximized');
      await expectState(mapPref(page, NAGANO), null);
      await expectCard(page, GIFU);
    });
  });
}

/** スマホ・タブレット（タッチ）の操作。`hasTouch` のプロジェクトだけで動かす */
function defineTouchTests(prefOf: PrefLocator): void {
  test.describe('タッチ操作', () => {
    test.beforeEach(({ hasTouch }) => {
      test.skip(!hasTouch, 'タッチの端末のプロジェクトだけで確かめる');
    });

    test('4.11.3：タップで固定する', async ({ page }) => {
      await open(page);
      await expectCard(page, null);

      await prefOf(page, NAGANO).tap();

      await expectState(mapPref(page, NAGANO), 'pinned');
      await expectCard(page, NAGANO);
    });

    test('4.11.3：同じ県を続けて2回タップしても最大化しない', async ({ page }) => {
      await open(page);

      await prefOf(page, NAGANO).tap();
      await prefOf(page, NAGANO).tap();

      // 1回目で固定、2回目のタップ（クリック）で固定を解除する。最大化にはならない。
      // tap() を2回続けても dblclick が出るとは限らない（端末による）ので、このテストはクリックの結果だけを確かめる。
      // タッチの dblclick を無視すること（4.11.3）は、MapInteraction.test.tsx で dblclick を直接起こして確かめている
      await expectState(mapPref(page, NAGANO), null);
      await expect(page.locator('[data-state="maximized"]')).toHaveCount(0);
    });
  });
}

// 今は地図の県のパスで回す。T2-10 でさくいんの項目を引く関数を足して、同じテストを回す
for (const [name, prefOf] of [['地図', mapPref]] as const satisfies readonly (readonly [string, PrefLocator])[]) {
  test.describe(`${name}の県`, () => {
    definePointerTests(prefOf);
    defineTouchTests(prefOf);
  });
}
