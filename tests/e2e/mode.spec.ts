import { expect, test, type Page } from '@playwright/test';
import { getMessages } from '../../src/i18n/messages';
import { expandSheet, expectShown } from './helpers';

// F-MODE-01〜04、D23、4.11.5：モード（こども／おとな）とふりがなの切替（T3-05）。本番用のビルド。
// コンテンツは tests/fixtures/content/（北海道は名物3つ・名所3つ。全部 reviewed）。
// 既定値（D37）：ja＝こども・ふりがな ON、en・zh＝おとな。切替のボタンは <header> の [data-display-toggle]。

const HOKKAIDO = '01';
const NAGANO = '20';
const CARD = `[data-card-pref="${HOKKAIDO}"]`;
const ITEMS = `${CARD} [data-card-specialties] [data-card-item], ${CARD} [data-card-spots] [data-card-item]`;
const ja = getMessages('ja').display;

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, lang = 'ja'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
}

/** さくいんの北海道を固定して、カードを出す（card.spec.ts と同じ。768px 未満では、パネルを全部見える状態にする） */
async function pinHokkaido(page: Page): Promise<void> {
  const item = page.locator(`a[data-pref="${HOKKAIDO}"]`);
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(CARD)).toBeVisible();
  await expandSheet(page);
}

const header = (page: Page) => page.getByRole('banner');
const modeButton = (page: Page, label: string) => header(page).getByRole('button', { name: label, exact: true });
const rubyButton = (page: Page) => header(page).locator('[data-ruby-button]');

/** カードの最初の名物（じゃがいも）の、こども向け・おとな向けの解説文 */
const firstItem = (page: Page) => page.locator(`${CARD} [data-card-specialties] [data-card-item]`).first();

test.describe('F-MODE-01：モードの切替', () => {
  test('F-MODE-01：モードを切り替えると、こども向けとおとな向けの文が入れ替わる（案内文・カードの解説文）', async ({ page }) => {
    // Arrange：ja の既定はこども向け（D37）
    await open(page);
    const guide = page.locator('[data-card-guide]');
    await expect(modeButton(page, ja.kids)).toHaveAttribute('aria-pressed', 'true');
    await expectShown(page, guide.locator('.kids'), true);
    await expectShown(page, guide.locator('.adult'), false);

    // Act・Assert：おとなに切り替える
    await modeButton(page, ja.adult).click();
    await expect(modeButton(page, ja.adult)).toHaveAttribute('aria-pressed', 'true');
    await expect(modeButton(page, ja.kids)).toHaveAttribute('aria-pressed', 'false');
    await expectShown(page, guide.locator('.adult'), true);
    await expectShown(page, guide.locator('.kids'), false);
    await pinHokkaido(page);
    await expect(firstItem(page).locator('.adult')).toBeVisible();
    await expect(firstItem(page).locator('.kids')).toBeHidden();

    // Act・Assert：こどもに戻す
    await modeButton(page, ja.kids).click();
    await expect(firstItem(page).locator('.kids')).toBeVisible();
    await expect(firstItem(page).locator('.adult')).toBeHidden();
  });

  test('F-MODE-01：カードの解説文は、どちらのモードでも片方だけが見える（T3-03 の確認）', async ({ page }) => {
    // Arrange
    await open(page);
    await pinHokkaido(page);
    const items = page.locator(ITEMS);
    await expect(items).toHaveCount(6);

    // Act・Assert：項目ごとに、見えている解説文は1つだけ
    for (const label of [ja.kids, ja.adult]) {
      await modeButton(page, label).click();
      for (const item of await items.all()) {
        await expect(item.locator('.kids:visible, .adult:visible')).toHaveCount(1);
      }
    }
  });
});

test.describe('F-MODE-02：ふりがなの切替', () => {
  test('F-MODE-02：ふりがなを OFF にすると rt が見えなくなる（こども・おとなの両方）', async ({ page }) => {
    // Arrange
    await open(page);
    await pinHokkaido(page);
    // 見えている解説文の中の rt と、見出しの中の rt
    const visibleRt = firstItem(page).locator('.kids:visible rt, .adult:visible rt').first();
    const headingRt = header(page).locator('h1 rt').first();

    for (const mode of [ja.kids, ja.adult]) {
      // Act・Assert：ON ならふりがなが見える
      await modeButton(page, mode).click();
      await expect(rubyButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(visibleRt).toBeVisible();
      await expect(headingRt).toBeVisible();

      // Act・Assert：OFF にすると rt が見えなくなる（本文は見える）
      await rubyButton(page).click();
      await expect(rubyButton(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(visibleRt).toBeHidden();
      await expect(headingRt).toBeHidden();
      await expect(header(page).locator('h1')).toBeVisible();

      // 次の周回のために ON に戻す
      await rubyButton(page).click();
    }
  });

  for (const lang of ['en', 'zh']) {
    test(`F-MODE-02：${lang} のページには、ふりがなの切替がない（モードの切替はある）`, async ({ page }) => {
      // Arrange・Act
      await open(page, lang);

      // Assert
      await expect(page.locator('[data-ruby-button]')).toHaveCount(0);
      await expect(page.locator('[data-mode-button]')).toHaveCount(2);
      // 既定はおとな向け（D37）
      await expect(page.locator('[data-mode-button="adult"]')).toHaveAttribute('aria-pressed', 'true');
      await expectShown(page, page.locator('[data-card-guide] .adult'), true);
      await expectShown(page, page.locator('[data-card-guide] .kids'), false);
    });
  }
});

test.describe('F-MODE-03・D23：設定の保存', () => {
  test('F-MODE-03・D23：再読み込みしても設定が残り、最初の描画から保存した値になっている', async ({ page }) => {
    // Arrange：<body> が DOM に入った時点（最初の描画の前）の <html> の属性を記録する
    await page.addInitScript(() => {
      const record = () => {
        const { dataset } = document.documentElement;
        (window as unknown as { __atBody: unknown }).__atBody = { mode: dataset.mode, ruby: dataset.ruby };
      };
      new MutationObserver((_records, observer) => {
        if (!document.body) return;
        record();
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await open(page);
    await modeButton(page, ja.adult).click();
    await rubyButton(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'adult');
    await expect(page.locator('html')).toHaveAttribute('data-ruby', 'off');

    // Act
    await page.reload();
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });

    // Assert：<body> が現れた時点で、すでに保存した値（ビルド時の既定値の kids・on ではない）
    expect(await page.evaluate(() => (window as unknown as { __atBody: unknown }).__atBody)).toEqual({ mode: 'adult', ruby: 'off' });
    await expect(modeButton(page, ja.adult)).toHaveAttribute('aria-pressed', 'true');
    await expect(rubyButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expectShown(page, page.locator('[data-card-guide] .adult'), true);
    await expect(header(page).locator('h1 rt').first()).toBeHidden();
  });

  test('D23：保存した設定は言語をまたいで使われる（モードは読む人の好み）', async ({ page }) => {
    // Arrange：ja の既定はこども向け、en の既定はおとな向け。ja で「こども」を押して保存する（en の既定と違う値）
    await open(page);
    await modeButton(page, ja.adult).click();
    await modeButton(page, ja.kids).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');

    // Act
    await open(page, 'en');

    // Assert：en の既定（adult）ではなく、保存した kids になる
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');
    await expect(page.locator('[data-mode-button="kids"]')).toHaveAttribute('aria-pressed', 'true');
    await expectShown(page, page.locator('[data-card-guide] .kids'), true);
    await expectShown(page, page.locator('[data-card-guide] .adult'), false);
  });

  test('D23：保存した値が正しくなければ、既定値のままにする', async ({ page }) => {
    // Arrange・Act：手で書き換えた値を入れてから開く
    await page.addInitScript(() => {
      window.localStorage.setItem('maps.mode', 'baby');
      window.localStorage.setItem('maps.ruby', 'maybe');
    });
    await open(page);

    // Assert
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');
    await expect(page.locator('html')).toHaveAttribute('data-ruby', 'on');
  });
});

test.describe('F-MODE-04：JavaScript がないとき', () => {
  test.use({ javaScriptEnabled: false });

  test('F-MODE-04：JavaScript を無効にすると、ja はこども向け、en はおとな向けだけが見える（カードの内容の代わりの文も）。切替のボタンは見えない', async ({ page }) => {
    // Arrange・Act・Assert：北海道のカードは :target で開く。内容は JSON から描くので、JavaScript がないときは「JavaScript を有効に」の文（T3-09）
    const needsScript = page.locator(`${CARD} [data-card-needs-script]`);
    await page.goto(`/ja/#pref-${HOKKAIDO}`);
    await expect(page.locator(CARD)).toBeVisible();
    await expect(needsScript.locator('.kids')).toBeVisible();
    await expect(needsScript.locator('.adult')).toBeHidden();
    await expect(page.locator('[data-display-toggle]')).toBeHidden();

    await page.goto(`/en/#pref-${HOKKAIDO}`);
    await expect(page.locator(CARD)).toBeVisible();
    await expect(needsScript.locator('.adult')).toBeVisible();
    await expect(needsScript.locator('.kids')).toBeHidden();
    await expect(page.locator('[data-display-toggle]')).toBeHidden();
  });
});

test.describe('4.11.5：localStorage が使えないとき', () => {
  test('4.11.5：localStorage を使えなくても、エラーなく既定値で表示され、切替はそのページの中で効く', async ({ page }) => {
    // Arrange：localStorage を読むだけで SecurityError になる環境
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }
      });
    });

    // Act
    await open(page);

    // Assert：既定値（こども向け）で表示される
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');
    await expectShown(page, page.locator('[data-card-guide] .kids'), true);

    // Act・Assert：切り替えると、保存はできなくても、そのページの中では効く
    await modeButton(page, ja.adult).click();
    await expectShown(page, page.locator('[data-card-guide] .adult'), true);
    await expectShown(page, page.locator('[data-card-guide] .kids'), false);
    await rubyButton(page).click();
    await expect(header(page).locator('h1 rt').first()).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('4.11.5：ModeText のボタンの名前', () => {
  // 最大化はマウスのダブルクリック（4.11.3）なので PC のプロジェクトだけ
  test('4.11.5：「再試行」のボタンの名前は、今のモードの文だけ', { tag: '@pc' }, async ({ page }) => {
    // Arrange：市区町村データを 404 にして、長野県を最大化する
    await page.route('**/geo/muni/*.topo.json', route => route.fulfill({ status: 404, body: 'not found' }));
    await open(page);

    // Act
    await page.locator(`path[data-pref="${NAGANO}"]`).dblclick();
    const retry = page.locator('[data-muni-retry]');
    await expect(retry).toBeVisible();

    // Assert：こどもは「もう一度」（ふりがなの読みは名前に入る）、おとなは「再試行」。もう片方の文は名前に入らない
    await expect(retry).toHaveAccessibleName(/^もう\s*一度/u);
    await expect(retry).not.toHaveAccessibleName(/再試行/u);
    await modeButton(page, ja.adult).click();
    await expect(retry).toHaveAccessibleName(/^再試行/u);
    await expect(retry).not.toHaveAccessibleName(/もう/u);
  });
});
