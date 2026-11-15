import { expect, test, type Page } from '@playwright/test';

// F-MAP-05、4.11.3・4.11.6・4.11.7：768px 未満の下から出るパネル（T3-06）。本番用のビルド。コンテンツは tests/fixtures/content/
// （北海道だけが内容を持つ。残りの46県は「準備中」）。長野県（20）は地図の上でタップできる（外接矩形の中心が県の中にある）。
// パネルはスマホ（iphone・pixel）で確かめる。768px 以上の配置・JavaScript なし・さくいんのホバーは chromium で幅を指定して確かめる。

const HOKKAIDO = '01';
const NAGANO = '20';
const PHONES = ['iphone', 'pixel'];

/** 海（日本海）の1点。viewBox の (370, 470)＝海域名の位置で、陸がなく、文字は pointer-events を受けない（interaction.spec.ts と同じ） */
const SEA_POINT = { x: 370 / 1000, y: 470 / 1130 } as const;

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, lang = 'en'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-area="card"][data-sheet]').waitFor({ state: 'attached' });
}

const panel = (page: Page) => page.locator('[data-area="card"]');
const indexItem = (page: Page, code: string) => page.locator(`a[data-pref="${code}"]`);
const mapPath = (page: Page, code: string) => page.locator(`path[data-pref="${code}"]`);

/** さくいんの項目をタップして固定する（北海道の形は中心が海なので、地図ではなくさくいんから押す） */
async function tapIndex(page: Page, code: string): Promise<void> {
  await indexItem(page, code).tap();
  await expect(indexItem(page, code)).toHaveAttribute('aria-pressed', 'true');
}

/** 海をタップする */
async function tapSea(page: Page): Promise<void> {
  const box = await page.locator('[data-map-sea]').boundingBox();
  if (!box) throw new Error('海の矩形が見つからない');
  await page.locator('[data-map-sea]').tap({ position: { x: box.width * SEA_POINT.x, y: box.height * SEA_POINT.y } });
}

/** フォーカスのある要素の `data-pref`（県の要素でなければ null） */
const focusedPref = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-pref') ?? null);

test.describe('スマホ（768px 未満）の下から出るパネル', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!PHONES.includes(testInfo.project.name), 'スマホ（iphone・pixel）のプロジェクトだけで確かめる');
  });

  test('4.11.7：県をタップするまで、パネルは閉じていて見えない', async ({ page }) => {
    await open(page);

    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(panel(page)).toBeHidden();
  });

  test('4.11.7：県をタップすると、パネルが一部だけ見える状態で開き、見出しと最大化ボタンが見える（名物は見えない）', async ({ page }) => {
    // Arrange
    await open(page);

    // Act
    await tapIndex(page, HOKKAIDO);

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');
    const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
    await expect(card.locator('h2[data-card-name]')).toBeVisible();
    await expect(card.locator('[data-card-capital]')).toBeVisible();
    await expect(card.locator('[data-card-maximize]')).toBeVisible();
    await expect(card.locator('[data-card-specialties]')).toBeHidden();
    await expect(card.locator('[data-card-access]')).toBeHidden();
    // 一部だけ見える状態は画面の下に固定され、画面の半分より低い
    // （開く動きの途中の位置を測らないよう、位置が落ち着くのを待つ）
    const height = await page.evaluate(() => window.innerHeight);
    const bottom = async () => {
      const box = await panel(page).boundingBox();
      return (box?.y ?? 0) + (box?.height ?? 0);
    };
    await expect.poll(bottom).toBeCloseTo(height, 0);
    expect(((await panel(page).boundingBox())?.height ?? height) / height).toBeLessThan(0.5);
  });

  test('4.11.7：全部見える状態にすると、パネルの高さが画面の約85%（±5%）で、名物が見える。「たたむ」で一部だけに戻る', async ({ page }) => {
    // Arrange
    await open(page);
    await tapIndex(page, HOKKAIDO);

    // Act
    await page.locator('[data-sheet-toggle]').tap();

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'full');
    await expect(page.locator('[data-sheet-toggle]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties]`)).toBeVisible();
    const height = await page.evaluate(() => window.innerHeight);
    await expect.poll(async () => ((await panel(page).boundingBox())?.height ?? 0) / height).toBeGreaterThanOrEqual(0.8);
    await expect.poll(async () => ((await panel(page).boundingBox())?.height ?? 0) / height).toBeLessThanOrEqual(0.9);

    // Act・Assert：「たたむ」
    await page.locator('[data-sheet-toggle]').tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties]`)).toBeHidden();
  });

  test('4.11.3：パネルを閉じると、固定も解除される', async ({ page }) => {
    // Arrange
    await open(page);
    await tapIndex(page, HOKKAIDO);

    // Act
    await page.locator('[data-sheet-close]').tap();

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(indexItem(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'false');
    await expect(mapPath(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'false');
    await expect(panel(page)).toBeHidden();
  });

  test('4.11.3：最大化中に閉じると、最大化も固定も解除される', async ({ page }) => {
    // Arrange：北海道を最大化する（一部だけ見える状態でも、最大化ボタンは見える）
    await open(page);
    await tapIndex(page, HOKKAIDO);
    await page.locator(`[data-card-maximize="${HOKKAIDO}"]`).tap();
    await expect(mapPath(page, HOKKAIDO)).toHaveAttribute('data-state', 'maximized');

    // Act
    await page.locator('[data-sheet-close]').tap();

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(mapPath(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-state="maximized"]')).toHaveCount(0);
  });

  test('4.11.3：海をタップすると、パネルが閉じる', async ({ page }) => {
    // Arrange：地図の長野県をタップして固定する
    await open(page);
    await mapPath(page, NAGANO).tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');

    // Act
    await tapSea(page);

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(mapPath(page, NAGANO)).toHaveAttribute('aria-pressed', 'false');
  });

  test('4.11.3：同じ県をもう一度タップすると、パネルが閉じる', async ({ page }) => {
    await open(page);
    await mapPath(page, NAGANO).tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');

    await mapPath(page, NAGANO).tap();

    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
  });

  test('4.11.6：さくいんから開くと、フォーカスがパネルの県名に移り、閉じるとさくいんの項目に戻る', async ({ page }) => {
    // Arrange
    await open(page);
    await indexItem(page, HOKKAIDO).focus();

    // Act・Assert：開く
    await indexItem(page, HOKKAIDO).tap();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] h2[data-card-name]`)).toBeFocused();

    // Act・Assert：閉じる（フォーカスがパネルの中にあるので、元の県の要素へ戻る）
    await page.locator('[data-sheet-close]').tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(indexItem(page, HOKKAIDO)).toBeFocused();
  });

  test('4.11.6：地図から開くと、フォーカスがパネルの県名に移り、閉じると地図の県のパスに戻る', async ({ page }) => {
    // Arrange
    await open(page);
    await mapPath(page, NAGANO).focus();

    // Act・Assert：開く
    await mapPath(page, NAGANO).tap();
    await expect(page.locator(`[data-card-pref="${NAGANO}"] h2[data-card-name]`)).toBeFocused();

    // Act・Assert：閉じる
    await page.locator('[data-sheet-close]').tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect.poll(() => focusedPref(page)).toBe(NAGANO);
  });

  test('4.11.6：海のタップで閉じたときは、フォーカスを地図の県に戻さない（フォーカスはパネルの外に出ている）', async ({ page }) => {
    // Arrange
    await open(page);
    await mapPath(page, NAGANO).tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');

    // Act：海のタップで、フォーカスはパネルの見出しから外れる
    await tapSea(page);

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    expect(await focusedPref(page)).toBeNull();
  });

  test('4.11.3：パネルの見出しにフォーカスがある状態で Esc を押すと、パネルが閉じ、フォーカスが元の県に戻る', async ({ page }) => {
    // Arrange
    await open(page);
    await indexItem(page, HOKKAIDO).focus();
    await indexItem(page, HOKKAIDO).tap();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] h2[data-card-name]`)).toBeFocused();

    // Act
    await page.keyboard.press('Escape');

    // Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'closed');
    await expect(indexItem(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'false');
    await expect(indexItem(page, HOKKAIDO)).toBeFocused();
  });

  for (const state of ['peek', 'full'] as const) {
    test(`4.11.7：パネルが${state === 'peek' ? '一部だけ見える' : '全部見える'}状態でも、フッターまでスクロールすると、フッターがパネルと重ならない`, async ({ page }) => {
      // Arrange
      await open(page);
      await tapIndex(page, HOKKAIDO);
      if (state === 'full') await page.locator('[data-sheet-toggle]').tap();
      await expect(panel(page)).toHaveAttribute('data-sheet', state);

      // Act
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      // Assert：フッターの下端が、パネルの上端より上にある（動きが止まるのを待つ）
      const gap = async () => {
        const footer = await page.locator('footer').boundingBox();
        const sheet = await panel(page).boundingBox();
        return (sheet?.y ?? 0) - ((footer?.y ?? 0) + (footer?.height ?? 0));
      };
      await expect.poll(gap).toBeGreaterThanOrEqual(-1);
    });
  }

  test('4.11.1・4.11.7：パネルが閉じている間は地図の下に案内文が見え、県をタップすると消える。閉じると、また見える', async ({ page }) => {
    // Arrange・Assert：閉じている間は、地図のすぐ下に出る
    await open(page);
    const guide = page.locator('[data-sheet-guide]');
    await expect(guide).toBeVisible();
    const map = await page.locator('[data-area="map"]').boundingBox();
    const guideBox = await guide.boundingBox();
    expect(guideBox?.y).toBeGreaterThanOrEqual((map?.y ?? 0) + (map?.height ?? 0) - 1);
    // 見えている案内文はこども向け・おとな向けの片方だけ（モードの既定）
    await expect(guide.locator('.kids:visible, .adult:visible')).toHaveCount(1);

    // Act・Assert：県をタップすると消える
    await mapPath(page, NAGANO).tap();
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');
    await expect(guide).toBeHidden();

    // Act・Assert：閉じると、また見える
    await page.locator('[data-sheet-close]').tap();
    await expect(guide).toBeVisible();
  });

  test('F-MAP-05（CLS）：JavaScript を読み込む前の HTML でも、さくいんの位置がハイドレーションの後と同じで、パネルはすでに画面の下に固定されている', async ({ page, context }) => {
    // Arrange：JavaScript の読み込みを止めたページ（scripting は有効。ハイドレーションしない）と、ふつうのページ
    const before = await context.newPage();
    await before.route('**/*.js', route => route.abort());
    await before.goto('/en/');
    await open(page);

    // Act
    const indexBefore = await before.locator('[data-area="index"]').boundingBox();
    const indexAfter = await page.locator('[data-area="index"]').boundingBox();

    // Assert
    expect(indexBefore?.y).toBeDefined();
    expect(Math.round(indexBefore?.y ?? -1)).toBe(Math.round(indexAfter?.y ?? -2));
    expect(await before.locator('[data-area="card"]').evaluate(element => getComputedStyle(element).position)).toBe('fixed');
    await expect(before.locator('[data-area="card"]')).toHaveAttribute('data-sheet', 'closed');
    await before.close();
  });

  test('F-MAP-05（CLS）：読み込みの間に、レイアウトのずれ（layout-shift）が出ない', async ({ page }) => {
    // Arrange：ページを開く前に、layout-shift を記録する
    await page.addInitScript(() => {
      (window as unknown as { __shift: number }).__shift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!entry.hadRecentInput) (window as unknown as { __shift: number }).__shift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    // Act
    await open(page);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    // Assert：カードが流れから消えることによるずれがない（0.01 は余裕。CLS の「良好」は 0.1 以下）
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBeLessThan(0.01);
  });

  test('F-MAP-05：JavaScript が有効なのに読み込めなかったときも、:target の県があれば、パネルが全部見える状態になってカードが読める', async ({ page }) => {
    // Arrange・Act：JavaScript の読み込みを止めて、ハッシュつきで開く
    await page.route('**/*.js', route => route.abort());
    await page.goto(`/en/#pref-${HOKKAIDO}`);

    // Assert：ハイドレーションしていない（data-card-ready がない）が、カードが見え、パネルの高さは画面の約85%
    await expect(page.locator('[data-card-ready]')).toHaveCount(0);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties]`)).toBeVisible();
    const height = await page.evaluate(() => window.innerHeight);
    expect(((await panel(page).boundingBox())?.height ?? 0) / height).toBeGreaterThanOrEqual(0.8);
    await expect(page.locator('[data-sheet-guide]')).toBeHidden();
  });

  for (const width of [360, 320]) {
    test(`5.3：幅${width}pxで、パネルが閉じていても開いていても横スクロールが出ない`, async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

      // Act・Assert：閉じている
      expect(await overflow()).toBeLessThanOrEqual(0);

      // Act・Assert：一部だけ見える・全部見える
      await tapIndex(page, HOKKAIDO);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.locator('[data-sheet-toggle]').tap();
      await expect(panel(page)).toHaveAttribute('data-sheet', 'full');
      expect(await overflow()).toBeLessThanOrEqual(0);
      const box = await panel(page).boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    });
  }

  test('F-ZOOM-05 と同じ扱い：動きを減らす設定では、パネルの transition がない', async ({ page }) => {
    // Arrange
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    // 動きを有効にする属性が付いてから測る（付く前は、設定に関係なく transition がなく、素通りしてしまう）
    await expect(panel(page)).toHaveAttribute('data-sheet-motion', '');
    await tapIndex(page, HOKKAIDO);

    // Act・Assert
    await expect(panel(page)).toHaveAttribute('data-sheet', 'peek');
    expect(await panel(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  });

  test('動きを減らさない設定では、パネルの開閉に translate の transition がある（最初の配置の切り替えは動かさない）', async ({ page }) => {
    // Arrange
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);

    // Act・Assert：マウントの数フレーム後に data-sheet-motion が付いて、動きが有効になる
    await expect(panel(page)).toHaveAttribute('data-sheet-motion', '');
    expect(await panel(page).evaluate(element => getComputedStyle(element).transitionProperty)).toContain('translate');
  });
});

test.describe('768px 以上・JavaScript なし・1024px 未満のさくいん', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '幅を指定して確かめるので、PC の chromium だけで確かめる');
  });

  test('F-MAP-05：幅800pxではパネルにならない（カードは流れの中にあり、バーは見えない。固定してもそのまま）', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 800, height: 900 });
    await open(page);

    // Assert：パネルの見た目（fixed）にならない。バーは見えない
    await expect(panel(page)).toBeVisible();
    expect(await panel(page).evaluate(element => getComputedStyle(element).position)).toBe('static');
    await expect(page.locator('[data-sheet-bar]')).toBeHidden();
    await expect(page.locator('[data-sheet-guide]')).toBeHidden();

    // Act：固定しても、カードは流れの中にあり、一部だけ隠さない
    await indexItem(page, HOKKAIDO).click();
    await expect(indexItem(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'true');

    // Assert
    expect(await panel(page).evaluate(element => getComputedStyle(element).position)).toBe('static');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties]`)).toBeVisible();
  });

  test('F-MAP-05：幅767pxはパネル、幅768pxはパネルにならない（境界）', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await open(page);
    expect(await panel(page).evaluate(element => getComputedStyle(element).position)).toBe('fixed');

    await page.setViewportSize({ width: 768, height: 900 });
    expect(await panel(page).evaluate(element => getComputedStyle(element).position)).toBe('static');
  });

  test('F-MAP-05：JavaScript がないときは、768px 未満でもパネルにならず、:target でカードが読める', async ({ browser }) => {
    // Arrange
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 800 } });
    const page = await context.newPage();

    // Act
    await page.goto(`/en/#pref-${HOKKAIDO}`);

    // Assert
    expect(await panel(page).evaluate(element => getComputedStyle(element).position)).toBe('static');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties]`)).toBeVisible();
    await expect(page.locator('[data-sheet-bar]')).toBeHidden();
    // 地図の下の案内文も出さない（カードの案内文と重複させない）
    await expect(page.locator('[data-sheet-guide]')).toBeHidden();
    await context.close();
  });

  test('4.11.2：1024px 未満では、さくいんのホバーでカードが変わらない（クリックで固定される）', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 900, height: 900 });
    await open(page);

    // Act：マウスをのせる
    await indexItem(page, HOKKAIDO).hover();
    // 反映を待ってから、変わらないことを確かめる
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    // Assert
    await expect(page.locator('[data-card-guide]')).toBeVisible();
    await expect(page.locator('[data-card-pref]:not([hidden])')).toHaveCount(0);

    // Act・Assert：クリックで固定され、カードが変わる
    await indexItem(page, HOKKAIDO).click();
    await expect(indexItem(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
  });

  test('4.11.2：1024px 以上では、さくいんのホバーでカードが変わる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);

    await indexItem(page, HOKKAIDO).hover();

    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
  });
});
