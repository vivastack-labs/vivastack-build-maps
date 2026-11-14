import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { settledPoint } from '../e2e/helpers';

// PRに載せるスクリーンショットの画面（playwright.screenshots.config.ts）。今の作業ツリーだけを撮る（before は撮らない）。
// 画面が変わるタスクでは、変わった状態（例：県を選んでパネルを開いた状態）を SCENES に足す
type Scene = {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
};

/** ハイドレーションが終わってから県をクリックして固定し、マウスを地図から外す（ホバーの見た目を写さない） */
async function pinPref(page: Page): Promise<void> {
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('path[data-pref="20"]').click();
  await page.locator('path[data-pref="20"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

/** 動きを止めてから（最終の位置で撮るため）、県（コード）をダブルクリックして最大化し、マウスを地図から外す */
async function maximizeOnly(page: Page, code: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  // 東京都・北海道は外接矩形の中心が県の外になることがあるので、ダブルクリックのイベントを県のパスに直接送る
  await page.locator(`path[data-pref="${code}"]`).dispatchEvent('dblclick');
  await page.locator(`path[data-pref="${code}"][data-state="maximized"]`).waitFor();
  // 寄る動きが終わる（倍率が1でなくなる）のを待つ
  await page.locator('[data-map-layer]:not([data-zoom-scale="1"])').waitFor();
  await page.mouse.move(0, 0);
}

/** 県を最大化し、市区町村の形が描かれる（T2-08）のを待つ */
function maximizePref(code: string): (page: Page) => Promise<void> {
  return async page => {
    await maximizeOnly(page, code);
    await page.locator('[data-muni-status="loaded"]').waitFor({ state: 'attached' });
    await page.locator(`[data-muni-layer][data-muni-pref="${code}"]`).waitFor({ state: 'attached' });
  };
}

/** 長野県を最大化し、カードの「市区町村の一覧」を開く（4.11.6） */
async function maximizeWithList(page: Page): Promise<void> {
  await maximizePref('20')(page);
  await page.locator('details[data-muni-list] summary').click();
  await page.locator('details[data-muni-list][open]').waitFor();
}

/** 市区町村データが 404 になるようにしてから、長野県を最大化する。失敗の文言と「再試行」が出るのを待つ（T2-07） */
async function maximizeWithMuniFailure(page: Page): Promise<void> {
  await page.route('**/geo/muni/*.topo.json', route => route.fulfill({ status: 404, body: 'not found' }));
  await maximizeOnly(page, '20');
  await page.locator('[data-muni-status="failed"] [data-muni-retry]').waitFor();
}

/** 要素（県・市区町村の形）の内側にマウスをのせ、ツールチップが出るのを待つ（T2-09。外接矩形の中心は、北海道などでは形の外になる） */
async function hoverShape(page: Page, selector: string): Promise<void> {
  const shape = page.locator(selector);
  await shape.scrollIntoViewIfNeeded();
  const { x, y } = await settledPoint(page, shape);
  await page.mouse.move(x, y);
  await page.locator('[data-tooltip]:not([hidden])').waitFor();
}

/** 北海道（名物3つ）にマウスをのせる（T2-09、F-TIP-01） */
async function hoverHokkaido(page: Page): Promise<void> {
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await hoverShape(page, 'path[data-pref="01"]');
}

/** 北海道を最大化して、札幌市中央区にマウスをのせる（T2-09、F-TIP-02） */
async function hoverSapporoWard(page: Page): Promise<void> {
  await maximizePref('01')(page);
  await hoverShape(page, '[data-muni="01101"]');
}

const SCENES: readonly Scene[] = [
  ...LANGS.map(lang => ({ name: `${lang}-top`, path: `/${lang}/` })),
  // F-MAP-04：端末の設定がダークのときの色
  { name: 'ja-top-dark', path: '/ja/', prepare: page => page.emulateMedia({ colorScheme: 'dark' }) },
  // T2-05：県（長野県）をクリックして固定した状態。固定した県の塗りと、カードの県名が変わる。最大化は ja-maximized で撮る
  { name: 'ja-pinned', path: '/ja/', prepare: pinPref },
  // T2-06：県を最大化して寄った状態。長野県（県全体が収まる）と東京都（父島を除いて、本土と伊豆諸島に寄る。U16・D36）
  { name: 'ja-maximized', path: '/ja/', prepare: maximizePref('20') },
  { name: 'ja-maximized-tokyo', path: '/ja/', prepare: maximizePref('13') },
  // T2-08：市区町村を描いた状態。北海道（政令指定都市の札幌市が区に分かれる。D16）、英語（ローマ字のラベルと一覧を開いた状態）、中国語（日本語の漢字表記。F-I18N-05）
  { name: 'ja-maximized-hokkaido', path: '/ja/', prepare: maximizePref('01') },
  { name: 'en-maximized-list', path: '/en/', prepare: maximizeWithList },
  { name: 'zh-maximized', path: '/zh/', prepare: maximizePref('20') },
  // T2-09：ツールチップ。名物のある県（北海道。県名と名物3つの名前）と、最大化中の市区町村（札幌市中央区。名前と読み）
  { name: 'ja-tooltip-pref', path: '/ja/', prepare: hoverHokkaido },
  { name: 'ja-tooltip-muni', path: '/ja/', prepare: hoverSapporoWard },
  // T2-07：市区町村データの読み込みに失敗した状態。県の形で最大化したまま、地図の左上に文言と「再試行」が出る
  { name: 'ja-maximized-muni-failed', path: '/ja/', prepare: maximizeWithMuniFailure },
  // 存在しないパスの404（app/global-not-found.tsx）。404のステータスでも、page.goto は例外にならずに撮れる
  { name: 'ja-not-found', path: '/ja/no-such-page/' }
];

const OUT_DIR = process.env.SCREENSHOT_OUT ?? '';

for (const scene of SCENES) {
  test(scene.name, async ({ page }, testInfo) => {
    await page.goto(scene.path);
    // フォントの読み込みが終わる前に撮ると、文字が別のフォントで写る
    await page.evaluate(() => document.fonts.ready);
    await scene.prepare?.(page);
    await page.screenshot({
      path: join(OUT_DIR, `${scene.name}-${testInfo.project.name}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}
