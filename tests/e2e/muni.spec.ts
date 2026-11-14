import { expect, test, type Page, type Route } from '@playwright/test';
import { dblclickAtCenter, settle } from './helpers';

// F-MUNI-05、4.11.5：市区町村データの読み込み（T2-07）。応答は page.route で変える。
// 読み込みの状態は、地図の箱の中の [data-muni-status]（loading・slow・loaded・failed・offline）と、
// aria-live の領域（role="status"）の文言で確かめる。形が描かれることの確認は T2-08 の E2E に任せる。
// 最大化は zoom.spec.ts と同じ、ダブルクリック（マウスの操作。タッチの端末のプロジェクトではスキップ）。
// ホバー・クリックの対象は、外接矩形の中心が自分の形の中にある長野県（20）。

const NAGANO = '20';
const MUNI_URL = '**/geo/muni/*.topo.json';
const PREF = `path[data-pref="${NAGANO}"]`;
const LAYER = '[data-map-layer]';
const STATUS_ROOT = '[data-muni-root]';
const LIVE = `${STATUS_ROOT} [role="status"]`;
const SLOW_DELAY_MS = 1500;
/** 遅い応答を待つ上限（SLOW_DELAY_MS より十分長く） */
const LOADED_TIMEOUT_MS = 8000;

test.beforeEach(({ hasTouch }) => {
  test.skip(hasTouch, '最大化のダブルクリックはマウスの操作（4.11.3）');
});

/** 操作の前に、ハイドレーションが終わるのを待つ（終わる前の操作は失われる） */
async function open(page: Page): Promise<void> {
  await page.goto('/ja/');
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

/** 市区町村データへのリクエストの URL を記録する。応答は `respond` で決める（省略すれば本物を返す） */
async function watchMuni(page: Page, respond: (route: Route, count: number) => Promise<void> | void = route => route.continue()): Promise<string[]> {
  const urls: string[] = [];
  await page.route(MUNI_URL, route => {
    urls.push(route.request().url());
    return respond(route, urls.length);
  });
  return urls;
}

const maximize = (page: Page) => page.locator(PREF).dblclick();
const scaleOf = async (page: Page): Promise<number> => Number(await page.locator(LAYER).getAttribute('data-zoom-scale'));
const muniStatus = (page: Page, status: string) => page.locator(`[data-muni-status="${status}"]`);

test('F-MUNI-05：最大化するまで市区町村データを読み込まない。最大化すると、その県の分を1回読み込む', async ({ page }) => {
  const urls = await watchMuni(page);

  await open(page);
  await settle(page);
  expect(urls).toEqual([]);

  await maximize(page);
  await expect(muniStatus(page, 'loaded')).toBeAttached();

  expect(urls).toHaveLength(1);
  expect(new URL(urls[0] as string).pathname).toBe(`/geo/muni/${NAGANO}.topo.json`);
});

test('F-MUNI-05：最大化は読み込みの完了を待たない（4.11.5）', async ({ page }) => {
  // 応答を止めたままにする（テストの最後に流す）
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => (release = resolve));
  await watchMuni(page, async route => {
    await held;
    await route.continue();
  });
  await open(page);

  await maximize(page);

  await expect(page.locator(PREF)).toHaveAttribute('data-state', 'maximized');
  await expect.poll(() => scaleOf(page)).toBeGreaterThan(2);
  await expect(page.locator(STATUS_ROOT)).toHaveAttribute('data-muni-status', /^(loading|slow)$/u);
  release();
  await expect(muniStatus(page, 'loaded')).toBeAttached({ timeout: LOADED_TIMEOUT_MS });
});

test('4.11.5：応答が遅いと「読み込み中」が aria-live の領域に出て、応答の後に消える', async ({ page }) => {
  await watchMuni(page, async route => {
    await new Promise(resolve => setTimeout(resolve, SLOW_DELAY_MS));
    await route.continue();
  });
  await open(page);

  await maximize(page);

  await expect(muniStatus(page, 'slow')).toBeAttached();
  await expect(page.locator(LIVE)).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator(LIVE)).toContainText('読');
  await expect(muniStatus(page, 'loaded')).toBeAttached({ timeout: LOADED_TIMEOUT_MS });
  await expect(page.locator(LIVE)).toHaveText('');
});

test('4.11.5：404 のとき最大化したまま失敗の文言と「再試行」が出て、再試行で成功する', async ({ page }) => {
  const urls = await watchMuni(page, (route, count) => (count === 1 ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await open(page);

  await maximize(page);

  await expect(muniStatus(page, 'failed')).toBeAttached();
  await expect(page.locator(LIVE)).toContainText('市区町村');
  // 県の形で最大化したまま
  await expect(page.locator(PREF)).toHaveAttribute('data-state', 'maximized');
  await expect.poll(() => scaleOf(page)).toBeGreaterThan(2);

  await page.locator('[data-muni-retry]').click();

  await expect(muniStatus(page, 'loaded')).toBeAttached();
  await expect(page.locator(LIVE)).toHaveText('');
  await expect(page.locator('[data-muni-retry]')).toHaveCount(0);
  await expect(page.locator(PREF)).toHaveAttribute('data-state', 'maximized');
  // 自動では再試行せず、押した1回だけ読み直した
  expect(urls).toHaveLength(2);
});

test('4.11.5：オフラインで最大化すると「オフラインのため表示できません」と「再試行」が出る', async ({ page, context }) => {
  await open(page);
  await context.setOffline(true);

  await maximize(page);

  await expect(muniStatus(page, 'offline')).toBeAttached();
  await expect(page.locator(LIVE)).toContainText('オフライン');
  await expect(page.locator('[data-muni-retry]')).toBeVisible();
  await expect(page.locator(PREF)).toHaveAttribute('data-state', 'maximized');

  await context.setOffline(false);
  await page.locator('[data-muni-retry]').click();

  await expect(muniStatus(page, 'loaded')).toBeAttached();
});

test('F-MUNI-05：同じ県をもう一度最大化しても読み込み直さない', async ({ page }) => {
  const urls = await watchMuni(page);
  await open(page);
  await maximize(page);
  await expect(muniStatus(page, 'loaded')).toBeAttached();

  // 解除して、もう一度最大化する（最大化した県の上には市区町村の形が重なるので、解除は座標でダブルクリックする）
  await dblclickAtCenter(page, page.locator(PREF));
  await expect(page.locator(PREF)).not.toHaveAttribute('data-state', 'maximized');
  await expect.poll(() => scaleOf(page)).toBe(1);
  await maximize(page);

  await expect(page.locator(PREF)).toHaveAttribute('data-state', 'maximized');
  await expect(muniStatus(page, 'loaded')).toBeAttached();
  await settle(page);
  expect(urls).toHaveLength(1);
});
