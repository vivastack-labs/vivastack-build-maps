import { expect, test, type Locator, type Page } from '@playwright/test';
import { LANGS, type Lang } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { isSheetWidth } from './helpers';

// F-I18N-03、4.11.2、D8：言語の切替と、固定している県のハッシュ（#pref-NN）での引き継ぎ（T3-07）。本番用のビルド。
// コンテンツは tests/fixtures/content/。県名（さくいん）は ja の既定、地図の県のパスは `path[data-pref]`。

const NAGANO = '20';
const TOKYO = '13';
const HOKKAIDO = '01';
const SITE_URL = 'https://maps.vivastack-dev.workers.dev';
const ja = getMessages('ja').display;

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
}

const langLink = (page: Page, lang: Lang): Locator => page.getByRole('banner').locator(`a[data-lang-link="${lang}"]`);
const pinnedPaths = (page: Page): Locator => page.locator('path[data-pref][aria-pressed="true"]');
const pinnedItems = (page: Page): Locator => page.locator('a[data-pref][aria-pressed="true"]');
const cardOf = (page: Page, code: string): Locator => page.locator(`[data-card-pref="${code}"]`);

/** さくいんの項目で県を固定する（地図の上の県は形が小さいことがあり、さくいんは全幅で押せる） */
async function pinFromIndex(page: Page, code: string): Promise<void> {
  const item = page.locator(`a[data-pref="${code}"]`);
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
}

test.describe('F-I18N-03・4.11.2：言語を切り替えても、固定している県が残る', () => {
  test('F-I18N-03・4.11.2：県を固定して英語に切り替えると、英語のページで同じ県が固定されている', async ({ page }) => {
    // Arrange：ja で長野県を固定する
    await open(page, '/ja/');
    await pinFromIndex(page, NAGANO);
    await expect(page).toHaveURL(new RegExp(`/ja/#pref-${NAGANO}$`));
    await expect(langLink(page, 'en')).toHaveAttribute('href', `/en/#pref-${NAGANO}`);

    // Act
    await langLink(page, 'en').click();

    // Assert：地図・さくいんの県と、カードが長野県
    await expect(page).toHaveURL(new RegExp(`/en/#pref-${NAGANO}$`));
    await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
    await expect(page.locator(`path[data-pref="${NAGANO}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(pinnedPaths(page)).toHaveCount(1);
    await expect(pinnedItems(page)).toHaveCount(1);
    await expect(cardOf(page, NAGANO)).toBeVisible();
    await expect(cardOf(page, NAGANO).locator('[data-card-name]')).toHaveText('Nagano');
  });

  test('D38：ハッシュから復元した県のカードの内容（JSON）が出る。言語を切り替えると、その言語の内容になる', async ({ page }) => {
    // Act：ハッシュつきで開く
    await open(page, `/ja/#pref-${HOKKAIDO}`);

    // Assert：固定した県の JSON を読み込んで、名物・名所・出典が出る
    const loaded = cardOf(page, HOKKAIDO).locator('[data-card-details="loaded"]');
    await expect(loaded).toBeAttached();
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-specialties] [data-card-item]')).toHaveCount(3);
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-sources-slot] [data-card-sources]')).toBeAttached();
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-specialties] [data-card-item]').first().locator('strong')).toContainText('じゃがいも');

    // Act：英語に切り替える
    await langLink(page, 'en').click();
    await expect(page).toHaveURL(new RegExp(`/en/#pref-${HOKKAIDO}$`));
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });

    // Assert：英語の内容（移ったあとの、英語の名物の名前。ふりがなの <ruby> がない）
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-specialties] [data-card-item]').first().locator('strong')).toHaveText('Potatoes');
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-details="loaded"]')).toBeAttached();
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-specialties] [data-card-item]')).toHaveCount(3);
    await expect(cardOf(page, HOKKAIDO).locator('[data-card-specialties] ruby')).toHaveCount(0);
  });

  test('4.11.2：/en/#pref-13 を開くと、東京都が固定されている（最大化はしない）', async ({ page }) => {
    // Act
    await open(page, `/en/#pref-${TOKYO}`);

    // Assert
    await expect(page.locator(`path[data-pref="${TOKYO}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(pinnedPaths(page)).toHaveCount(1);
    await expect(cardOf(page, TOKYO)).toBeVisible();
    await expect(page.locator('[data-map-maximized]')).toHaveCount(0);
    await expect(page.locator('[data-muni-status]')).toHaveCount(0);
  });

  test.describe('正しくないハッシュ', () => {
    for (const hash of ['#pref-99', '#pref-1', '#foo']) {
      test(`4.11.2：${hash} で開いても、エラーにならず、何も固定されない`, async ({ page }) => {
        // Arrange
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') errors.push(message.text());
        });

        // Act
        await open(page, `/en/${hash}`);

        // Assert
        await expect(pinnedPaths(page)).toHaveCount(0);
        await expect(pinnedItems(page)).toHaveCount(0);
        await expect(langLink(page, 'ja')).toHaveAttribute('href', '/ja/');
        // 正しくないハッシュは、開いたときに消さない
        expect(new URL(page.url()).hash).toBe(hash);
        expect(errors).toEqual([]);
      });
    }
  });

  test('4.11.2：固定を外すと、URL のハッシュが消える（履歴は増えない）', async ({ page }) => {
    // Arrange
    await open(page, '/ja/');
    const historyLength = await page.evaluate(() => window.history.length);
    await pinFromIndex(page, NAGANO);
    await expect(page).toHaveURL(new RegExp(`#pref-${NAGANO}$`));
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

    // Act：同じ県をもう一度押して固定を外す
    await page.locator(`a[data-pref="${NAGANO}"]`).click();

    // Assert
    await expect(pinnedItems(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    await expect(langLink(page, 'en')).toHaveAttribute('href', '/en/');
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  });
});

test.describe('F-I18N-03：リンクと <head>', () => {
  for (const lang of LANGS) {
    test(`F-I18N-03：${lang} のページの <head> に hreflang が4つあり、canonical はそのページの URL`, async ({ page }) => {
      // Act
      await page.goto(`/${lang}/`);

      // Assert：hreflang は ja・en・zh-Hans・x-default（→ ja）、URL はサイトの絶対 URL
      const alternates = await page.locator('head link[rel="alternate"][hreflang]').evaluateAll(links => links.map(link => [link.getAttribute('hreflang'), link.getAttribute('href')]));
      expect(alternates).toEqual([
        ['ja', `${SITE_URL}/ja/`],
        ['en', `${SITE_URL}/en/`],
        ['zh-Hans', `${SITE_URL}/zh/`],
        ['x-default', `${SITE_URL}/ja/`]
      ]);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/${lang}/`);
    });

    test(`F-I18N-03：${lang} のページでは、今の言語のリンクだけに aria-current="page" が付いている`, async ({ page }) => {
      // Act
      await page.goto(`/${lang}/`);

      // Assert
      const current = page.getByRole('banner').locator('a[data-lang-link][aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('data-lang-link', lang);
      await expect(page.getByRole('banner').locator('a[data-lang-link]')).toHaveCount(3);
    });
  }

  for (const from of LANGS) {
    for (const to of LANGS.filter(code => code !== from)) {
      test(`完了条件：${from} のページから ${to} のページに移れる`, async ({ page }) => {
        // Arrange
        await page.goto(`/${from}/`);

        // Act
        await langLink(page, to).click();

        // Assert
        await expect(page).toHaveURL(new RegExp(`/${to}/$`));
        await expect(page.locator('html')).toHaveAttribute('lang', to === 'zh' ? 'zh-Hans' : to);
        await expect(langLink(page, to)).toHaveAttribute('aria-current', 'page');
      });
    }
  }
});

test('T3-05：言語を切り替えても、保存したモード・ふりがなが残る', async ({ page }) => {
  // Arrange：ja で「こども」（en の既定はおとななので、保存した値が残ったかが分かる）とふりがな OFF を保存する
  await open(page, '/ja/');
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: ja.adult, exact: true }).click();
  await header.getByRole('button', { name: ja.kids, exact: true }).click();
  await header.locator('[data-ruby-button]').click();
  await expect(page.locator('html')).toHaveAttribute('data-ruby', 'off');

  // Act・Assert：英語へ（保存したモードが残る。en の既定はおとな）
  await langLink(page, 'en').click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');

  // Act・Assert：日本語に戻る（ふりがな OFF が残る。ja の既定は ON）
  await langLink(page, 'ja').click();
  await expect(page).toHaveURL(/\/ja\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-ruby', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');
});

/**
 * 開く前から、描画のたびに東京都のカードが見えているかを記録する（`requestAnimationFrame` と `MutationObserver`）。
 * `[data-card-ready]`（ハイドレーションが終わった印）が付いたあとに、見えない時点があれば失敗にする
 */
const RECORD_CARD_VISIBILITY = `
  window.__samples = [];
  const record = () => {
    const card = document.querySelector('[data-card-pref="${TOKYO}"]');
    if (!card) return;
    const isVisible = !card.hidden && getComputedStyle(card).display !== 'none';
    window.__samples.push({ ready: document.querySelector('[data-card-ready]') !== null, isVisible });
  };
  new MutationObserver(record).observe(document, { subtree: true, childList: true, attributes: true });
  const loop = () => { record(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
`;

test('T3-03：ハッシュつきで開いたとき、ハイドレーションの前後でカードが消えない（案内文にならない）', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC の幅で確かめる（パネルの幅は下のテスト）');
  // Arrange
  await page.addInitScript(RECORD_CARD_VISIBILITY);

  // Act
  await page.goto(`/en/#pref-${TOKYO}`);
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
  await expect(cardOf(page, TOKYO)).toBeVisible();
  const sampleCount = () => page.evaluate(() => (window as unknown as { __samples: unknown[] }).__samples.length);
  const countBefore = await sampleCount();
  await expect.poll(sampleCount).toBeGreaterThan(countBefore);

  // Assert：ハイドレーションが終わったあとの記録が、すべて見えている。案内文も出ていない
  const samples = await page.evaluate(() => (window as unknown as { __samples: { ready: boolean; isVisible: boolean }[] }).__samples);
  const afterReady = samples.filter(sample => sample.ready);
  expect(afterReady.length).toBeGreaterThan(0);
  expect(afterReady.filter(sample => !sample.isVisible)).toEqual([]);
  await expect(page.locator('[data-card-guide]')).toBeHidden();
});

test('T3-06：768px 未満でハッシュつきで開くと、パネルが全部見える状態で開き、フォーカスは動かない', async ({ page }) => {
  // Arrange
  await page.goto(`/en/#pref-${HOKKAIDO}`);
  test.skip(!(await isSheetWidth(page)), '下から出るパネルになる幅（768px 未満）だけ');

  // Act
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-sheet-bar]:not([hidden])').waitFor();

  // Assert：パネルは full で開き（JavaScript の前の :target の見た目と同じ）、県名の見出しにフォーカスしていない
  await expect(page.locator('[data-area="card"]')).toHaveAttribute('data-sheet', 'full');
  await expect(cardOf(page, HOKKAIDO)).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

  // 利用者が「たたむ」を押すと、一部だけ見える状態になる
  await page.locator('[data-sheet-toggle]').click();
  await expect(page.locator('[data-area="card"]')).toHaveAttribute('data-sheet', 'peek');
});

test.describe('JavaScript がないとき', () => {
  test.use({ javaScriptEnabled: false });

  test('F-I18N-03：言語切替のリンクで移れる（ハッシュは引き継がない）', async ({ page }) => {
    // Arrange
    await page.goto('/ja/');

    // Act
    await langLink(page, 'zh').click();

    // Assert
    await expect(page).toHaveURL(/\/zh\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  });
});
