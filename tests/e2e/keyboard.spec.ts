import { expect, test, type Page } from '@playwright/test';

// F-KB-01〜05、4.11.2・4.11.6、WCAG 2.1.1・2.4.7：地図のキーボード操作（T2-11）。キーボードだけで操作する。
// キーボードのある PC のプロジェクトだけで確かめる（タッチの端末には Tab のキーがない）。
// 操作の前に `data-map-ready` を待つ（ハイドレーションの前の操作は失われる）。倍率は層の `data-zoom-scale` で読む。

const LAYER = '[data-map-layer]';
/** 地図の外から Tab を押す回数の上限（地図の前にある操作できる要素の数より十分に多く） */
const MAX_TABS_TO_MAP = 20;

test.beforeEach(({ hasTouch }) => {
  test.skip(hasTouch, 'キーボードを使う PC のプロジェクトだけで確かめる');
});

/** ハイドレーションが終わるのを待ってから、ページを開く */
async function open(page: Page): Promise<void> {
  await page.goto('/ja/');
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

/** いまフォーカスしている地図の県の県コード（地図の県でなければ null） */
const focusedCode = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.closest('svg [data-pref]')?.getAttribute('data-pref') ?? null);

/** ページの先頭から Tab を押して、地図の県に入る。入った県の県コードを返す（入れなければ例外） */
async function tabIntoMap(page: Page): Promise<string> {
  for (let i = 0; i < MAX_TABS_TO_MAP; i += 1) {
    await page.keyboard.press('Tab');
    const code = await focusedCode(page);
    if (code !== null) return code;
  }
  throw new Error(`Tab を ${MAX_TABS_TO_MAP} 回押しても、地図の県に入れませんでした`);
}

const path = (page: Page, code: string) => page.locator(`svg path[data-pref="${code}"]`);
const scaleOf = async (page: Page): Promise<number> => Number(await page.locator(LAYER).getAttribute('data-zoom-scale'));
/** 倍率が目標の値になるのを待つ（動きの300msの途中を見ない） */
const expectScale = (page: Page, expected: number) => expect.poll(() => scaleOf(page)).toBeCloseTo(expected, 2);
const shownCard = (page: Page) => page.locator('[data-card-pref]:not([hidden])');
/** 停止位置（tabindex="0"）の県の県コード */
const tabStops = (page: Page): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll('svg path[data-pref][tabindex="0"]')].map(element => element.getAttribute('data-pref') ?? ''));

test.describe('F-KB-01：Tab の停止位置（roving tabindex）', () => {
  test('Tab で地図に入ると北海道にフォーカスし、カードに北海道が出る', async ({ page }) => {
    await open(page);

    const code = await tabIntoMap(page);

    expect(code).toBe('01');
    await expect(shownCard(page)).toHaveAttribute('data-card-pref', '01');
  });

  test('固定中の県があれば、地図の外から Shift + Tab で入ると、フォーカスしていた県ではなく固定中の県にフォーカスする', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();
    await page.keyboard.press('Enter');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'pinned');
    // 固定とは別の県（21）へフォーカスだけ移し、地図の外へ出る
    await page.keyboard.press('ArrowRight');
    expect(await focusedCode(page)).toBe('21');
    await page.keyboard.press('Tab');
    expect(await focusedCode(page)).toBeNull();
    await expect.poll(() => tabStops(page)).toEqual(['20']);

    await page.keyboard.press('Shift+Tab');

    expect(await focusedCode(page)).toBe('20');
  });

  test('固定がなければ、地図の外から戻ると北海道にフォーカスする（移った先ではなく）', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();
    await page.keyboard.press('Tab');
    expect(await focusedCode(page)).toBeNull();
    await expect.poll(() => tabStops(page)).toEqual(['01']);

    await page.keyboard.press('Shift+Tab');

    expect(await focusedCode(page)).toBe('01');
  });

  test('地図の中で Tab をもう1回押すと地図の外に出る（停止位置は1つ）', async ({ page }) => {
    await open(page);
    await tabIntoMap(page);
    expect(await tabStops(page)).toEqual(['01']);

    await page.keyboard.press('Tab');

    expect(await focusedCode(page)).toBeNull();
    await expect(page.locator('[data-zoom="in"]')).toBeFocused();
  });

  test('矢印で県を移っても、停止位置は1つで、フォーカス中の県にある', async ({ page }) => {
    await open(page);
    await tabIntoMap(page);

    await page.keyboard.press('ArrowRight');

    expect(await tabStops(page)).toEqual(['02']);
    // 停止位置が2つ（北海道と青森県）にならないので、Shift + Tab は地図の外へ出る（北海道に止まらない）
    await page.keyboard.press('Shift+Tab');
    expect(await focusedCode(page)).toBeNull();
  });
});

test.describe('4.11.6：県を移る', () => {
  test('→ で青森県、← で北海道、End で沖縄県、Home で北海道に移る。端では止まる', async ({ page }) => {
    await open(page);
    await tabIntoMap(page);

    await page.keyboard.press('ArrowRight');
    expect(await focusedCode(page)).toBe('02');
    await expect(shownCard(page)).toHaveAttribute('data-card-pref', '02');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedCode(page)).toBe('01');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedCode(page)).toBe('01');
    await page.keyboard.press('End');
    expect(await focusedCode(page)).toBe('47');
    await page.keyboard.press('ArrowDown');
    expect(await focusedCode(page)).toBe('47');
    await page.keyboard.press('ArrowUp');
    expect(await focusedCode(page)).toBe('46');
    await page.keyboard.press('Home');
    expect(await focusedCode(page)).toBe('01');
  });
});

test.describe('F-KB-02・03・05：固定・最大化・解除', () => {
  test('F-KB-02：Enter と Space で固定し、もう1回で解除する', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();

    await page.keyboard.press('Enter');
    await expect(path(page, '20')).toHaveAttribute('aria-pressed', 'true');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'pinned');
    await page.keyboard.press('Space');
    await expect(path(page, '20')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'pinned');
  });

  test('F-KB-03：Shift + Enter で最大化する', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();

    await page.keyboard.press('Shift+Enter');

    await expect(path(page, '20')).toHaveAttribute('data-state', 'maximized');
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(1);
  });

  test('F-KB-05：Esc で最大化を解除し、もう1回で固定を解除する', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();
    await page.keyboard.press('Shift+Enter');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'maximized');

    await page.keyboard.press('Escape');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'pinned');

    await page.keyboard.press('Escape');
    await expect(path(page, '20')).not.toHaveAttribute('data-state');
    await expect(path(page, '20')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('F-KB-04：拡大・縮小・全体表示', () => {
  test('+ - 0 で拡大・縮小・全体表示になる', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();

    await page.keyboard.press('+');
    await expectScale(page, 1.5);
    await page.keyboard.press('+');
    await expectScale(page, 2.25);
    await page.keyboard.press('-');
    await expectScale(page, 1.5);
    await page.keyboard.press('0');
    await expectScale(page, 1);
  });

  test('0 で最大化も解除して全体表示に戻る', async ({ page }) => {
    await open(page);
    await path(page, '20').focus();
    await page.keyboard.press('Shift+Enter');
    await expect(path(page, '20')).toHaveAttribute('data-state', 'maximized');

    await page.keyboard.press('0');

    await expect(path(page, '20')).not.toHaveAttribute('data-state', 'maximized');
    await expectScale(page, 1);
  });
});

test.describe('2.4.7：フォーカスの枠', () => {
  test('フォーカス中の県の outline が none でない', async ({ page }) => {
    await open(page);
    await tabIntoMap(page);

    const outline = await path(page, '01').evaluate(element => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });

    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  // overflow-clip の防御の検査。overflow-hidden のままでも通る（<svg> が箱と同じ大きさで、層のはみ出しは <svg> で切られ、箱にスクロールできる範囲がないため）
  test('拡大中に画面の外の県へフォーカスしても、地図の箱もページもスクロールしない（overflow-clip の防御。overflow-hidden でも通る）', async ({ page }) => {
    // 動きを同期にして、拡大の途中を見ないようにする
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await path(page, '20').focus();
    for (const expected of [1.5, 2.25, 3.375]) {
      await page.keyboard.press('+');
      await expectScale(page, expected);
    }
    const scrollOf = () => page.evaluate(() => ({ page: window.scrollY, top: document.querySelector('[data-map-box]')?.scrollTop, left: document.querySelector('[data-map-box]')?.scrollLeft }));
    const before = await scrollOf();

    await page.keyboard.press('End');

    expect(await focusedCode(page)).toBe('47');
    const after = await scrollOf();
    expect(after).toEqual({ ...before, top: 0, left: 0 });
    expect(after.page).toBe(before.page);
  });
});
