import { expect, test, type Page } from '@playwright/test';
import { MUNI_LABEL_FONT_SIZE } from '../../src/features/map/labels';
import { LABEL_FONT_SIZE } from '../../src/features/map/prefPaths';
import { LANGS, langPath } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { expandSheet, settledPoint } from './helpers';

// 5.5・R9・D23：CSP（T4-01）。ハッシュを書いた CSP は各 HTML の <meta>、frame-ancestors などは _headers。本番用のビルド（wrangler dev で dist/ を配信）。
// ここでは、主な操作（固定・最大化・市区町村・カードの JSON・ツールチップ・モードとふりがなの切替・言語の切替・404）の間に、
// CSP 違反（securitypolicyviolation イベント・コンソールのエラー）が1件も出ないことを確かめる。コンテンツは tests/fixtures/content/。

const HOKKAIDO = '01';
const SAPPORO_CHUO = '01101';
/**
 * 県境・沖縄の枠・海域名・市区町村の線の太さと文字の大きさ（viewBox の単位。倍率1のとき）。`JapanMap`・`MuniLayer` のクラスと同じ値
 * （県名ラベルの文字の大きさは `LABEL_FONT_SIZE`、市区町村のラベルは `MUNI_LABEL_FONT_SIZE`〔画面の上の px〕）
 */
const PREF_BORDER_WIDTH = 0.8;
const OKINAWA_FRAME_WIDTH = 1.5;
const SEA_LABEL_FONT_SIZE = 24;
const MUNI_BORDER_WIDTH = 0.5;
const MUNI_OUTLINE_WIDTH = 1.4;
/** 画面の上の大きさの許容の誤差（倍率 `data-zoom-scale` は丸めて書かれる） */
const RELATIVE_TOLERANCE = 0.02;

test('D21・5.5：有効な本番ビルドは外部の計測スクリプトを1つ読み込む', async ({ page }) => {
  const testSiteId = process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_ID;
  test.skip(!testSiteId, '計測用のテストサイト識別子を指定したビルドで検査する');
  const beaconUrl = 'https://static.cloudflareinsights.com/beacon.min.js';
  await page.route(beaconUrl, route =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: 'document.documentElement.setAttribute("data-test-beacon-loaded", "true");'
    })
  );
  const violations = await collectViolations(page);
  await page.goto('/ja/');

  const beacon = page.locator(`script[src="${beaconUrl}"]`);
  await expect(beacon).toHaveCount(1);
  await expect(beacon).toHaveAttribute('type', 'module');
  await expect(page.locator('html')).toHaveAttribute('data-test-beacon-loaded', 'true');
  expect(JSON.parse((await beacon.getAttribute('data-cf-beacon')) ?? '{}')).toEqual({ token: testSiteId });
  expect(violations).toEqual([]);
});

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
    if (/content[-\s]security[-\s]policy|refused to/iu.test(message.text())) found.push(`console：${message.text()}`);
  });
  page.on('pageerror', error => found.push(`pageerror：${error.message}`));
  return found;
}

/** `perScreenPx` が true なら、基準は画面の上の px で、さらに `--map-px`（地図の1単位の画面の px。地図の幅 ÷ 1000）で割る（#147） */
type SizeCheck = { readonly selector: string; readonly property: 'fontSize' | 'strokeWidth'; readonly base: number; readonly perScreenPx?: boolean };

/**
 * 画面の上の大きさが、基準 ÷ 倍率になっているのを待つ（style 属性をクラスにしても、CSP の下で `--zoom-k`・`--map-px` が効いている）。
 * `zoomed` が false なら倍率1（基準のまま）、true なら倍率が1より大きいとき。基準が 16px の文字はブラウザの既定と同じなので、zoomed でも確かめる
 */
async function expectZoomInvariantSizes(page: Page, checks: readonly SizeCheck[], zoomed: boolean): Promise<void> {
  await expect
    .poll(async () => {
      const measured = await page.evaluate(
        (targets: readonly SizeCheck[]) => ({
          k: Number(document.querySelector('[data-map-layer]')?.getAttribute('data-zoom-scale')),
          mapPx: (document.querySelector('[data-map-box] svg')?.getBoundingClientRect().width ?? 0) / 1000,
          sizes: targets.map(({ selector, property }) => parseFloat(getComputedStyle(document.querySelector(selector) as Element)[property]))
        }),
        checks
      );
      const isZoomStateRight = zoomed ? measured.k > 1 : measured.k === 1;
      return (
        isZoomStateRight &&
        checks.every(({ base, perScreenPx }, index) => {
          const expected = base / measured.k / (perScreenPx === true ? measured.mapPx : 1);
          return Math.abs((measured.sizes[index] ?? 0) - expected) <= expected * RELATIVE_TOLERANCE;
        })
      );
    })
    .toBe(true);
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

      // style 属性をクラスにした値が、CSP の下でも効いている（倍率1：基準のまま）
      const prefChecks: readonly SizeCheck[] = [
        { selector: '[data-pref-labels]', property: 'fontSize', base: LABEL_FONT_SIZE[lang] },
        { selector: '[data-sea-label]', property: 'fontSize', base: SEA_LABEL_FONT_SIZE },
        { selector: '[data-map-layer] > g.stroke-map-border', property: 'strokeWidth', base: PREF_BORDER_WIDTH },
        { selector: '[data-okinawa-frame]', property: 'strokeWidth', base: OKINAWA_FRAME_WIDTH }
      ];
      await expectZoomInvariantSizes(page, prefChecks, false);
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

      // Assert：寄った後（倍率が1より大きい）は、基準 ÷ 倍率。県の層と市区町村の層の両方
      await expectZoomInvariantSizes(
        page,
        [
          ...prefChecks,
          { selector: '[data-muni-labels]', property: 'fontSize', base: MUNI_LABEL_FONT_SIZE, perScreenPx: true },
          { selector: '[data-muni-layer] > g.stroke-muni-border', property: 'strokeWidth', base: MUNI_BORDER_WIDTH },
          { selector: 'path[data-muni-outline]', property: 'strokeWidth', base: MUNI_OUTLINE_WIDTH }
        ],
        true
      );

      // Act・Assert：ツールチップ（マウスのとき）。札幌市中央区の形の内側にマウスを動かすと、市区町村のツールチップが見える
      if (!hasTouch) {
        const sapporo = page.locator(`path[data-muni="${SAPPORO_CHUO}"]`);
        await sapporo.scrollIntoViewIfNeeded();
        const point = await settledPoint(sapporo);
        await page.mouse.move(point.x, point.y);
        await expect(page.locator('[data-tip-muni]')).toBeVisible();
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

  for (const lang of LANGS) {
    test(`R9：${lang} の「このサイトについて」・プライバシーポリシーで、フッターのリンクで行き来しても CSP 違反が出ない（T4-05）`, async ({ page }) => {
      // Arrange
      const violations = await collectViolations(page);

      // Act：トップ → 「このサイトについて」→ プライバシーポリシー → ふりがな・モードの切替 → 言語の切替 → トップ
      await open(page, `/${lang}/`);
      const footer = page.getByRole('contentinfo');
      await footer.locator('a[data-footer-link="about"]').click();
      await expect(page).toHaveURL(new RegExp(`${langPath(lang, 'about')}$`, 'u'));
      await footer.locator('a[data-footer-link="privacy"]').click();
      await expect(page).toHaveURL(new RegExp(`${langPath(lang, 'privacy')}$`, 'u'));
      // ハイドレーションが終わってから、今のモードと逆のボタンを押す（終わる前の操作は失われる。en・zh の既定は adult なので、kids を押して変わったことを確かめる）
      await page.locator('[data-display-toggle][data-display-ready]').waitFor({ state: 'attached' });
      const current = await page.locator('html').getAttribute('data-mode');
      const opposite = current === 'kids' ? 'adult' : 'kids';
      await page.getByRole('banner').locator(`[data-mode-button="${opposite}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', opposite);
      const other = LANGS.find(candidate => candidate !== lang) ?? 'ja';
      await page.getByRole('banner').locator(`a[data-lang-link="${other}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${langPath(other, 'privacy')}$`, 'u'));
      await page.getByRole('banner').locator('a[data-site-name-link]').click();
      await expect(page).toHaveURL(new RegExp(`${langPath(other)}$`, 'u'));

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
  for (const path of ['/ja/', '/en/', '/zh/', '/ja/about/', '/en/privacy/', '/no-such-page/']) {
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
