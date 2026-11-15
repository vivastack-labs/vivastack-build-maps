import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { expandSheet, settledPoint } from '../e2e/helpers';

// PRに載せるスクリーンショットの画面（playwright.screenshots.config.ts）。今の作業ツリーだけを撮る（before は撮らない）。
// 画面が変わるタスクでは、変わった状態（例：県を選んでパネルを開いた状態）を SCENES に足す
type Scene = {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
  /** PC だけで撮る（マウスの操作で出る画面。スマホ（タッチ）では出ないので撮らない） */
  readonly pcOnly?: boolean;
  /** スマホ（sp。幅360px）だけで撮る（768px 未満の下から出るパネル。T3-06） */
  readonly spOnly?: boolean;
};

/** ハイドレーションが終わってから県をクリックして固定し、マウスを地図から外す（ホバーの見た目を写さない） */
async function pinPref(page: Page): Promise<void> {
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('path[data-pref="20"]').click();
  await page.locator('path[data-pref="20"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

/** ハイドレーションが終わってから、さくいんの長野県の項目をクリックして固定し、マウスを外す（固定した項目と、地図の県の塗りが同じになる） */
async function pinFromIndex(page: Page): Promise<void> {
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('a[data-pref="20"]').click();
  await page.locator('a[data-pref="20"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

/** ハイドレーションが終わってから、さくいんの「準備中」の県（沖縄県）の項目をクリックして固定し、マウスを外す（T3-02。斜線の県の固定中の色。地図の沖縄県は小さいのでさくいんから押す） */
async function pinPendingFromIndex(page: Page): Promise<void> {
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('a[data-pref="47"]').click();
  await page.locator('a[data-pref="47"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

/** ハイドレーションが終わってから、さくいんの北海道（フィクスチャで内容のある県）の項目をクリックして固定し、マウスを外す（T3-03。本物のカード） */
async function pinHokkaidoFromIndex(page: Page): Promise<void> {
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('a[data-pref="01"]').click();
  await page.locator('a[data-pref="01"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

/** 北海道を固定して、パネルを全部見える状態にする（T3-06。768px 未満の下から出るパネル。「くわしく」を押す） */
async function expandSheetAfterPin(page: Page): Promise<void> {
  await pinHokkaidoFromIndex(page);
  await page.locator('[data-sheet-toggle]').click();
  await page.locator('[data-area="card"][data-sheet="full"]').waitFor();
  await page.mouse.move(0, 0);
}

/** 北海道のカードを出し、モードを「おとな」、ふりがなを OFF にする（T3-05。ヘッダーの切替のボタンの押した状態も写る） */
async function pinHokkaidoAdultRubyOff(page: Page): Promise<void> {
  await pinHokkaidoFromIndex(page);
  await page.getByRole('banner').locator('[data-mode-button="adult"]').click();
  await page.getByRole('banner').locator('[data-ruby-button]').click();
  await page.locator('html[data-mode="adult"][data-ruby="off"]').waitFor();
  await page.mouse.move(0, 0);
}

/** 北海道のカードを出し、その「出典」欄を開く（T3-04。出典のある項目〔行き方・じゃがいも〕と「出典なし」の項目が見える） */
async function openHokkaidoSources(page: Page): Promise<void> {
  await pinHokkaidoFromIndex(page);
  // 768px 未満（スマホ）では、一部だけ見えるパネルに出典欄がないので、全部見える状態にしてから開く（T3-06）
  await expandSheet(page);
  await page.locator('[data-card-pref="01"] [data-card-sources] summary').click();
  await page.locator('[data-card-pref="01"] details[data-card-sources][open]').waitFor();
  // summary のクリックでページとカードの中が途中までスクロールするので、ページは先頭に戻し、
  // カードの中（1024px以上で高さが画面までのスクロール領域）は最後までスクロールして、開いた出典欄を写す
  await page.evaluate(() => {
    const card = document.querySelector('[data-area="card"]');
    if (card) card.scrollTop = card.scrollHeight;
    window.scrollTo(0, 0);
  });
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
  // 768px 未満（スマホ）では、一部だけ見えるパネルに市区町村の一覧がないので、全部見える状態にしてから開く（T3-06）
  await expandSheet(page);
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
  const { x, y } = await settledPoint(shape);
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

/** Tab の回数の上限（地図の前にある操作できる要素より十分に多く） */
const MAX_TABS_TO_MAP = 20;

/** キーボードだけで、Tab で地図の北海道に入り、→ で青森県へ移る（T2-11、F-KB-01。県のフォーカスの枠と、カードの連動） */
async function focusPrefByKeyboard(page: Page): Promise<void> {
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  for (let i = 0; i < MAX_TABS_TO_MAP; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.matches('svg path[data-pref]') ?? false)) break;
  }
  await page.keyboard.press('ArrowRight');
  await page.locator('path[data-pref="02"]:focus-visible').waitFor();
}

const SCENES: readonly Scene[] = [
  ...LANGS.map(lang => ({ name: `${lang}-top`, path: `/${lang}/` })),
  // F-MAP-04：端末の設定がダークのときの色
  { name: 'ja-top-dark', path: '/ja/', prepare: page => page.emulateMedia({ colorScheme: 'dark' }) },
  // T2-05：県（長野県）をクリックして固定した状態。固定した県の塗りと、カードの県名が変わる。最大化は ja-maximized で撮る
  { name: 'ja-pinned', path: '/ja/', prepare: pinPref },
  // T3-01：東京からの距離。固定した県（長野県）のカードに「東京から約 … km」が出る。en・zh で、3言語の文言を確かめる（桁区切りは単体テストで確かめる）
  { name: 'en-pinned', path: '/en/', prepare: pinPref },
  { name: 'zh-pinned', path: '/zh/', prepare: pinPref },
  // T2-10：県名さくいん。さくいんの長野県を固定した状態（8地方の県名の一覧は、各言語の top の全体の画像に入る）（項目の固定中の色と、地図・カードが連動する）
  { name: 'ja-index-pinned', path: '/ja/', prepare: pinFromIndex },
  // T3-02：準備中の県（沖縄県）を固定した状態。トップの画面にも、斜線の県・凡例の「準備中」・さくいんの「（準備中）」が出る（フィクスチャは北海道だけが内容を出す）
  { name: 'ja-pending-pinned', path: '/ja/', prepare: pinPendingFromIndex },
  // T3-03：県のカード。内容のある県（北海道。見出し・距離・行き方・名物3つ・名所3つ・最大化ボタン）を3言語で。解説文は既定のモードの1つ（ja はこども向け、en・zh はおとな向け。T3-05）。準備中の県のカードは ja-pending-pinned
  ...LANGS.map(lang => ({ name: `${lang}-card`, path: `/${lang}/`, prepare: pinHokkaidoFromIndex })),
  // T3-06：スマホの下から出るパネル。北海道を固定した「一部だけ見える」状態（見出しと最大化ボタン）と、「くわしく」を押した「全部見える」状態（画面の高さの約85%）
  { name: 'ja-sheet-peek', path: '/ja/', prepare: pinHokkaidoFromIndex, spOnly: true },
  { name: 'ja-sheet-full', path: '/ja/', prepare: expandSheetAfterPin, spOnly: true },
  // T3-05：モードを「おとな」、ふりがなを OFF にした状態（解説文がおとな向けになり、ふりがなが消える。切替のボタンの押した状態）
  { name: 'ja-card-adult-ruby-off', path: '/ja/', prepare: pinHokkaidoAdultRubyOff },
  // T3-04：カードの「出典」欄を開いた状態（北海道。出典のある項目と「出典なし」の項目）。フッターの出典は、各言語の top の全体の画像に入る
  { name: 'ja-card-sources', path: '/ja/', prepare: openHokkaidoSources },
  // T2-06：県を最大化して寄った状態。長野県（県全体が収まる）と東京都（父島を除いて、本土と伊豆諸島に寄る。U16・D36）
  { name: 'ja-maximized', path: '/ja/', prepare: maximizePref('20') },
  { name: 'ja-maximized-tokyo', path: '/ja/', prepare: maximizePref('13') },
  // T2-08：市区町村を描いた状態。北海道（政令指定都市の札幌市が区に分かれる。D16）、英語（ローマ字のラベルと一覧を開いた状態）、中国語（日本語の漢字表記。F-I18N-05）
  { name: 'ja-maximized-hokkaido', path: '/ja/', prepare: maximizePref('01') },
  { name: 'en-maximized-list', path: '/en/', prepare: maximizeWithList },
  { name: 'zh-maximized', path: '/zh/', prepare: maximizePref('20') },
  // T2-09：ツールチップ。名物のある県（北海道。県名と名物3つの名前）と、最大化中の市区町村（札幌市中央区。名前と読み）
  { name: 'ja-tooltip-pref', path: '/ja/', prepare: hoverHokkaido, pcOnly: true },
  { name: 'ja-tooltip-muni', path: '/ja/', prepare: hoverSapporoWard, pcOnly: true },
  // T2-07：市区町村データの読み込みに失敗した状態。県の形で最大化したまま、地図の左上に文言と「再試行」が出る
  { name: 'ja-maximized-muni-failed', path: '/ja/', prepare: maximizeWithMuniFailure },
  // T2-11：キーボードで地図の県（青森県）にフォーカスした状態。フォーカスの枠が見え、カードが青森県になる
  { name: 'ja-keyboard-focus', path: '/ja/', prepare: focusPrefByKeyboard, pcOnly: true },
  // 存在しないパスの404（app/global-not-found.tsx）。404のステータスでも、page.goto は例外にならずに撮れる
  { name: 'ja-not-found', path: '/ja/no-such-page/' }
];

const OUT_DIR = process.env.SCREENSHOT_OUT ?? '';

for (const scene of SCENES) {
  test(scene.name, async ({ page }, testInfo) => {
    test.skip(scene.pcOnly === true && testInfo.project.name !== 'pc', 'マウスの操作で出る画面は PC だけで撮る');
    test.skip(scene.spOnly === true && testInfo.project.name !== 'sp', '下から出るパネルはスマホだけで撮る');
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
