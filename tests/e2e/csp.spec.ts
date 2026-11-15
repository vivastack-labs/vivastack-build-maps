import { expect, test, type Page } from '@playwright/test';
import { LANGS, type Lang } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { expandSheet } from './helpers';

// 5.5・R9・D23：CSP（T4-01）。ハッシュを書いた CSP は各 HTML の <meta>、frame-ancestors などは _headers。本番用のビルド（wrangler dev で dist/ を配信）。
// ここでは、主な操作（固定・最大化・市区町村・カードの JSON・ツールチップ・モードとふりがなの切替・言語の切替・404）の間に、
// CSP 違反（securitypolicyviolation イベント・コンソールのエラー）が1件も出ないことを確かめる。コンテンツは tests/fixtures/content/。

const HOKKAIDO = '01';
const SAPPORO_CHUO = '01101';
/** ズーム 1 のときの県名ラベルの文字の大きさ（`LABEL_FONT_SIZE`）。style 属性をクラスにしても、CSP の下で効いていることを確かめる */
const LABEL_FONT_PX: Readonly<Record<Lang, string>> = { ja: '16px', en: '13px', zh: '16px' };

type Violation = { readonly directive: string; readonly blocked: string };

/** CSP 違反を集める。イベントはページの読み込みの前から（addInitScript）、コンソールのエラーとページのエラーも見る */
async function collectViolations(page: Page): Promise<string[]> {
  const found: string[] = [];
  await page.exposeFunction('__reportCsp', (violation: Violation) => {
    found.push(`securitypolicyviolation：${violation.directive}（${violation.blocked}）`);
  });
  await page.addInitScript(() => {
    document.addEventListener(
      'securitypolicyviolation',
      event => {
        (window as unknown as { __reportCsp: (violation: Violation) => void }).__reportCsp({ directive: event.violatedDirective, blocked: event.blockedURI });
      },
      true
    );
  });
  page.on('console', message => {
    if (/content security policy|refused to/iu.test(message.text())) found.push(`console：${message.text()}`);
  });
  page.on('pageerror', error => found.push(`pageerror：${error.message}`));
  return found;
}

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
}

test.describe('R9：CSP の下で、主な操作の間に CSP 違反が出ない', () => {
  for (const lang of LANGS) {
    test(`R9：${lang} のページで、地図の操作・カード・最大化・切替の間に CSP 違反が出ない`, async ({ page, hasTouch }) => {
      // Arrange
      const violations = await collectViolations(page);
      const display = getMessages(lang).display;
      await open(page, `/${lang}/`);

      // style 属性をクラスにした値が、CSP の下でも効いている（県名ラベルの文字の大きさ。倍率1）
      await expect(page.locator('[data-pref-labels]')).toHaveCSS('font-size', LABEL_FONT_PX[lang]);
      await expect(page.locator('[data-map-box]')).toHaveCSS('aspect-ratio', /^1000 \/ 1130$/u);

      // Act：さくいんで北海道を固定する（カードの JSON を読み込む）。マウスならホバーも
      const item = page.locator(`a[data-pref="${HOKKAIDO}"]`);
      if (!hasTouch) await item.hover();
      await item.click();
      await expect(item).toHaveAttribute('aria-pressed', 'true');
      const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
      await expect(card).toBeVisible();
      await expandSheet(page);
      await expect(card.locator('[data-card-specialties] [data-card-item]')).not.toHaveCount(0);

      // Act：最大化して、市区町村のデータを読み込んで描く
      await card.locator('[data-card-maximize]').click();
      await expect(page.locator(`[data-muni-layer][data-muni-pref="${HOKKAIDO}"]`)).toBeAttached();
      await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
      await expect(page.locator(`path[data-muni="${SAPPORO_CHUO}"]`)).toBeAttached();
      await expect(page.locator('[data-muni-labels]')).toHaveCSS('font-size', /^\d+(\.\d+)?px$/u);

      // Act：ツールチップ（マウスのとき）
      if (!hasTouch) {
        const box = await page.locator('[data-map-box]').boundingBox();
        if (!box) throw new Error('地図の箱の位置を取れません');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
      }

      // Act：モードとふりがなの切替（localStorage に保存する）
      const header = page.getByRole('banner');
      await header.getByRole('button', { name: display.adult, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', 'adult');
      await header.getByRole('button', { name: display.kids, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', 'kids');
      if (lang === 'ja') {
        await header.locator('[data-ruby-button]').click();
        await expect(page.locator('html')).toHaveAttribute('data-ruby', 'off');
      }

      // Act：言語の切替（全体の読み込み）。切り替えた先のページでも出ない
      const other = LANGS.find(candidate => candidate !== lang) ?? 'ja';
      await header.locator(`a[data-lang-link="${other}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${other}/`, 'u'));
      await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
      await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('aria-pressed', 'true');

      // Assert
      expect(violations).toEqual([]);
    });
  }

  test('R9：404 のページで CSP 違反が出ない', async ({ page }) => {
    // Arrange
    const violations = await collectViolations(page);

    // Act
    const response = await page.goto('/no-such-page/');
    await page.waitForLoadState('load');

    // Assert
    expect(response?.status()).toBe(404);
    expect(violations).toEqual([]);
  });

  test('5.5：CSP が効いている（知らないインラインスクリプトは動かず、違反が1件出る）', async ({ page }) => {
    // Arrange
    const violations = await collectViolations(page);
    await open(page, '/ja/');

    // Act：ハッシュにないインラインスクリプトを足す（攻撃者が注入したものに当たる）
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.body.append(script);
    });

    // Assert
    await expect.poll(() => violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('script-src');
    expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  });
});

test.describe('5.5：CSP の置き場所', () => {
  for (const path of ['/ja/', '/en/', '/zh/', '/no-such-page/']) {
    test(`5.5：${path} は CSP の meta が <meta charset> の直後で、すべての script・link より前にあり、_headers の CSP に frame-ancestors 'none' がある`, async ({ page }) => {
      // Act
      const response = await page.goto(path);

      // Assert：ヘッダー（_headers の /*）
      const csp = response?.headers()['content-security-policy'] ?? '';
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).not.toContain('script-src');

      // Assert：meta（HTML のソースの順。ブラウザの DOM の順と同じ）
      const order = await page.evaluate(() => {
        const children = [...document.head.children];
        const indexOf = (predicate: (element: Element) => boolean) => children.findIndex(predicate);
        const meta = indexOf(element => element.getAttribute('http-equiv') === 'Content-Security-Policy');
        const charset = indexOf(element => element.tagName === 'META' && element.hasAttribute('charset'));
        const firstActive = indexOf(element => element.tagName === 'SCRIPT' || element.tagName === 'LINK');
        return { meta, charset, firstActive, content: children[meta]?.getAttribute('content') ?? '' };
      });
      expect(order.charset).toBe(0);
      expect(order.meta).toBe(order.charset + 1);
      expect(order.firstActive).toBeGreaterThan(order.meta);
      expect(order.content).toMatch(/^default-src 'self'; script-src 'self' ('sha256-[A-Za-z0-9+/=]+' )*https:\/\/static\.cloudflareinsights\.com; style-src 'self';/u);
      expect(order.content).not.toContain('unsafe-inline');
      expect(order.content).not.toContain('frame-ancestors');
    });
  }
});
