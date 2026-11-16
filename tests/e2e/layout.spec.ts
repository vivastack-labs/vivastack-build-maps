import { expect, test, type Page } from '@playwright/test';
import { LANGS, PAGES, langPath, type SitePage } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { plainText } from '../../src/lib/ruby';
import { expandSheet } from './helpers';

// 4.11.7・F-MAP-05・5.3：画面の枠組み（T2-03）

const HOKKAIDO = '01';

/** 領域の位置と大きさ。ページを開いてからでないと取れないので、表示を待ってから測る */
async function box(page: Page, area: 'map' | 'card' | 'index') {
  const locator = page.locator(`[data-area="${area}"]`);
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  if (!rect) throw new Error(`${area} の領域が見つからない`);
  return rect;
}

/** 領域が横に並んでいる（カードの左端が地図の右端より右）か */
async function expectSideBySide(page: Page) {
  const map = await box(page, 'map');
  const card = await box(page, 'card');
  expect(card.x).toBeGreaterThanOrEqual(map.x + map.width);
  // 同じ行にある（カードが地図の下に回り込んでいない）
  expect(card.y).toBeLessThan(map.y + map.height);
}

/** 地図の下にカードがあり、その下にさくいんがある */
async function expectStacked(page: Page) {
  const map = await box(page, 'map');
  const card = await box(page, 'card');
  const index = await box(page, 'index');
  expect(card.y).toBeGreaterThanOrEqual(map.y + map.height);
  expect(index.y).toBeGreaterThanOrEqual(card.y + card.height);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// スマホ・タブレットのエミュレーション（isMobile）は meta viewport の扱いが PC と違うので、端末の幅での検査（下）に任せる
test.describe('幅を指定する（PC のプロジェクト）', { tag: '@pc' }, () => {
  test('4.11.7：幅1280pxで、地図とカードが同じ行で横に並び、地図が全体のおよそ2/3である', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ja/');

    // Act・Assert
    await expectSideBySide(page);
    const map = await box(page, 'map');
    const card = await box(page, 'card');
    const total = card.x + card.width - map.x;
    expect(map.width / total).toBeCloseTo(2 / 3, 1);
  });

  test('4.11.7：幅1024pxで、地図とカードが横に並ぶ（境界）', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/ja/');

    await expectSideBySide(page);
  });

  test('F-MAP-05：幅1023pxで、地図の下にカードがある（境界）', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 900 });
    await page.goto('/ja/');

    await expectStacked(page);
  });

  test('F-MAP-05：幅900pxで、地図の下にカードがある', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/ja/');

    await expectStacked(page);
  });

  test('4.11.7：幅1280pxで、一番下までスクロールしても、カードが画面の上に固定されている（sticky）', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/ja/');
    await box(page, 'card');

    // Act
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrollY = await page.evaluate(() => window.scrollY);

    // Assert：スクロールできていることを前提にして、カードの上端が lg:top-4（16px）にある
    expect(scrollY).toBeGreaterThan(0);
    const card = await box(page, 'card');
    expect(card.y).toBeCloseTo(16, 0);
  });
});

// 端末の既定の幅（スマホ・タブレットを含む全プロジェクト）。幅は変えない
test('4.11.7・F-MAP-05：端末の幅が1024px以上なら横に並び、768px以上なら地図の下にカードがあり、768px 未満なら下から出るパネルで閉じている', async ({ page }) => {
  await page.goto('/ja/');
  await page.locator('[data-area="card"][data-sheet]').waitFor({ state: 'attached' });

  const width = await page.evaluate(() => window.innerWidth);
  if (width >= 1024) {
    await expectSideBySide(page);
  } else if (width >= 768) {
    await expectStacked(page);
  } else {
    // T3-06：カードは画面の下に固定のパネルで、固定するまで閉じている（見えない）。地図とさくいんは流れの中に並ぶ
    const card = page.locator('[data-area="card"]');
    await expect(card).toHaveAttribute('data-sheet', 'closed');
    await expect(card).toBeHidden();
    expect(await card.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
    const map = await box(page, 'map');
    const index = await box(page, 'index');
    expect(index.y).toBeGreaterThanOrEqual(map.y + map.height);
  }
});

/** 横スクロールの検査の対象のパス。言語ごとの全ページ（`PAGES` から作る。ページを足すと自動で入る） */
const SITE_PATHS = LANGS.flatMap(lang => PAGES.map(page => ({ lang, page, path: langPath(lang, page) })));
const NOT_FOUND_PATH = '/no-such-page/';

/** ページを開いたあとに待つ要素。トップはハイドレーション（地図とカード）が終わるのを、ほかのページと 404 は本文（`<main>`）が描かれるのを待つ */
const READY_SELECTORS = { home: ['[data-map-ready]', '[data-card-ready]'], about: ['main'], privacy: ['main'] } as const satisfies Record<SitePage, readonly string[]>;

/** ページを開いて、待つ要素（`ready`）が描かれるのを待つ */
async function openAndSettle(page: Page, path: string, ready: readonly string[]): Promise<void> {
  await page.goto(path);
  for (const selector of ready) await page.locator(selector).waitFor({ state: 'attached' });
  await page.waitForLoadState('load');
}

// 端末の幅のまま確かめる。pixel が、実際の幅360pxのスマホにあたる（5.3）
for (const { lang, page: sitePage, path } of SITE_PATHS) {
  test(`5.3：端末の幅で、/${lang}/${sitePage === 'home' ? '' : `${sitePage}/`} に横スクロールが出ない`, async ({ page }) => {
    await openAndSettle(page, path, READY_SELECTORS[sitePage]);

    await expectNoHorizontalScroll(page);
  });
}

test('5.3：端末の幅で、404 のページに横スクロールが出ない', async ({ page }) => {
  await openAndSettle(page, NOT_FOUND_PATH, ['main']);

  await expectNoHorizontalScroll(page);
});

// 幅360pxを指定して確かめる（PC のプロジェクト。スマホのエミュレーションは meta viewport の扱いが PC と違うので指定しない）
test.describe('幅360pxを指定する（PC のプロジェクト）', { tag: '@pc' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
  });

  for (const { lang, page: sitePage, path } of SITE_PATHS) {
    test(`5.3：幅360pxで、/${lang}/${sitePage === 'home' ? '' : `${sitePage}/`} に横スクロールが出ない`, async ({ page }) => {
      await openAndSettle(page, path, READY_SELECTORS[sitePage]);

      await expectNoHorizontalScroll(page);
    });
  }

  test('5.3：幅360pxで、404 のページに横スクロールが出ない', async ({ page }) => {
    await openAndSettle(page, NOT_FOUND_PATH, ['main']);

    await expectNoHorizontalScroll(page);
  });

  test('5.3：幅360pxで、カード・出典・市区町村の一覧を開いても、パネルと文書に横スクロールが出ない', async ({ page }) => {
    await expectNoHorizontalScrollWhenExpanded(page);
  });
});

// カードがページの流れの中にある配置（768〜1023px）。パネル（fixed）ではないので、文書全体の検査が効く
test('5.3：幅800pxで、カード・出典・市区町村の一覧を開いても、カードと文書に横スクロールが出ない', { tag: '@pc' }, async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });

  await expectNoHorizontalScrollWhenExpanded(page);
});

// 2列の配置の下限（1024px）。カードは横幅がいちばん狭く（約286px）、市区町村の一覧は1列が約137px
test('5.3：幅1024pxで、カード・出典・市区町村の一覧を開いても、カードと文書に横スクロールが出ない', { tag: '@pc' }, async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });

  await expectNoHorizontalScrollWhenExpanded(page);
});

test('5.3：幅360pxのスマホ（pixel）で、カード・出典・市区町村の一覧を開いても、パネルと文書に横スクロールが出ない', { tag: '@touch' }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', '実際の幅360pxの端末は pixel だけ');

  await expectNoHorizontalScrollWhenExpanded(page);
});

/** 出典の URL の文字（長い1語。空白がなく、`validateCardData` を通る http(s) の URL） */
const LONG_URL = `https://example.com/${'a1b2c3d4'.repeat(25)}`;
/** 名物の名前（長い1語。空白がない） */
const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat(3);

/** 市区町村の名前（英語。長い1語。空白がなく、ハイフンで折り返せない） */
const LONG_MUNI_NAME = 'Higashimatsushimashimashimashimashimashi';

type CardJson = { access?: { sources: { url: string }[] }; specialties: { name: string; sources: { url: string }[] }[]; spots: { sources: { url: string }[] }[] };

/**
 * 英語の北海道のカードの JSON を、はみ出しやすい内容に書き換える（フィクスチャは変えない）。
 * 出典の URL をすべて長い1語の URL に、名物の名前の1つを長い1語にする
 */
async function routeLongCard(page: Page): Promise<void> {
  await page.route(`**/cards/en/${HOKKAIDO}.json`, async route => {
    const response = await route.fetch();
    const json = (await response.json()) as CardJson;
    const longUrl = (sources: { url: string }[]) => sources.map(source => ({ ...source, url: LONG_URL }));
    const [first, ...rest] = json.specialties;
    const body: CardJson = {
      ...json,
      ...(json.access === undefined ? {} : { access: { ...json.access, sources: longUrl(json.access.sources) } }),
      specialties: first === undefined ? [] : [{ ...first, name: LONG_WORD, sources: longUrl(first.sources) }, ...rest.map(item => ({ ...item, sources: longUrl(item.sources) }))],
      spots: json.spots.map(item => ({ ...item, sources: longUrl(item.sources) }))
    };
    await route.fulfill({ response, json: body });
  });
}

/** 書き換えた市区町村の `code`（応答を書き換えたときに入る） */
type RewrittenMuni = { code?: string };

type MuniJson = { objects: { municipalities: { geometries: { properties: { code: string; name: { en: string } } }[] } } };

/**
 * 北海道の市区町村データの1件の `name.en` を、長い1語に書き換える（元の応答を取ってから。データの形は変えない）。
 * 書き換えた市区町村の `code` を返す入れ物に書く
 */
async function routeLongMuni(page: Page): Promise<RewrittenMuni> {
  const rewritten: RewrittenMuni = {};
  await page.route(`**/geo/muni/${HOKKAIDO}.topo.json`, async route => {
    const response = await route.fetch();
    const json = (await response.json()) as MuniJson;
    const [first] = json.objects.municipalities.geometries;
    if (first) {
      first.properties.name.en = LONG_MUNI_NAME;
      rewritten.code = first.properties.code;
    }
    await route.fulfill({ response, json });
  });
  return rewritten;
}

/**
 * 文書と、カードの領域の両方に、横スクロールが出ない。
 * 768px 未満は fixed のパネル、1024px 以上（2列の配置）も `lg:overflow-y-auto` の箱で、はみ出しはカードの中でスクロールになり、文書の検査では見えない
 */
async function expectNoHorizontalScrollInCard(page: Page): Promise<void> {
  await expectNoHorizontalScroll(page);
  const overflow = await page.locator('[data-area="card"]').evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow, 'カードの領域（パネル）の中の横スクロール').toBeLessThanOrEqual(0);
}

/**
 * 内容がいちばん広がる状態で、横スクロールが出ない。
 * 英語（単語が長い）の北海道のカードを、長い URL・長い名前に書き換えて開き、出典と、最大化した県の市区町村の一覧を開く
 */
async function expectNoHorizontalScrollWhenExpanded(page: Page): Promise<void> {
  await routeLongCard(page);
  const muni = await routeLongMuni(page);
  await page.goto(`/en/#pref-${HOKKAIDO}`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
  await card.locator('[data-card-details="loaded"]').waitFor();
  await expandSheet(page);
  await expect(card.locator('[data-card-specialties] [data-card-item]').first()).toContainText(LONG_WORD);
  await expectNoHorizontalScrollInCard(page);

  await card.locator('[data-card-sources] summary').click();
  await expect(card.locator('[data-card-sources]')).toHaveJSProperty('open', true);
  await expect(card.locator('[data-source-url]').first()).toHaveText(LONG_URL);
  await expectNoHorizontalScrollInCard(page);

  await card.locator(`[data-card-maximize="${HOKKAIDO}"]`).click();
  await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
  const list = page.locator('details[data-muni-list]');
  await list.locator('summary').click();
  await expect(list).toHaveJSProperty('open', true);
  // 書き換えが描かれたことを確かめてから測る
  await expect(list.locator(`[data-muni-item="${muni.code}"]`)).toHaveText(LONG_MUNI_NAME);
  await expectNoHorizontalScrollInCard(page);
}

for (const lang of LANGS) {
  test(`5.2：/${lang}/ に header・main・footer がそれぞれ1つある`, async ({ page }) => {
    await page.goto(`/${lang}/`);

    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
  });

  test(`5.2：/${lang}/ の <title> が、その言語のサイト名である`, async ({ page }) => {
    await page.goto(`/${lang}/`);

    await expect(page).toHaveTitle(plainText(getMessages(lang).siteName));
  });
}
