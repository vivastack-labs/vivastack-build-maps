import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { plainText } from '../../src/lib/ruby';
import { dblclickAtCenter } from './helpers';

// T4-02、5.4、4.11.5、5.5：PWA（Web App Manifest・Service Worker）。本番用のビルド（wrangler dev で dist/ を配信）。
// ほかの E2E は playwright.config.ts の `serviceWorkers: 'block'`（page.route を使うテストが SW に邪魔されない）で動かすので、ここだけ許可する。
// Chromium だけ（タスクのテスト条件。Service Worker とオフラインの扱いはブラウザごとに違う）。コンテンツは tests/fixtures/content/（北海道だけ内容がある）。

test.use({ serviceWorkers: 'allow' });

test.beforeEach(({ browserName, hasTouch }) => {
  test.skip(browserName !== 'chromium' || hasTouch, 'Chromium のデスクトップだけ（最大化はダブルクリック）');
});

const HOKKAIDO = '01';
const NAGANO = '20';
const GIFU = '21';
const prefPath = (page: Page, code: string) => page.locator(`path[data-pref="${code}"]`);

/** ページを開き、ハイドレーションと、Service Worker のインストール・有効化（プリキャッシュの完了。clientsClaim で今のページも通る）を待つ */
async function openControlled(page: Page, path = '/ja/'): Promise<void> {
  await page.goto(path);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** 実行時のキャッシュに、そのパスの応答が入るのを待つ（応答を返した後に、Service Worker が非同期で書くため） */
async function expectCached(page: Page, cacheName: string, pathname: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (name: string) => {
        const cache = await caches.open(name);
        return (await cache.keys()).map(request => new URL(request.url).pathname);
      }, cacheName)
    )
    .toContain(pathname);
}

/** オフラインにして再読み込みし、ハイドレーションが終わるのを待つ */
async function reloadOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await page.reload();
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

test.describe('5.4：Service Worker', () => {
  test('5.4：Service Worker が登録され、有効になった後はページを制御する（scope は /）', async ({ page, baseURL }) => {
    // Act
    await openControlled(page);

    // Assert
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
    expect(scope).toBe(`${baseURL}/`);
  });

  test('5.4：/sw.js は更新をすぐ見つけられるよう no-cache で配信される', async ({ request }) => {
    const response = await request.get('/sw.js');

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-cache');
    expect(response.headers()['content-type']).toContain('javascript');
  });

  test('5.4：一度開いた後、オフラインで再読み込みしても地図とカード（一度見た県の内容）が表示される', async ({ page, context }) => {
    // Arrange：北海道を固定して、カードの内容（JSON）を一度読む
    await openControlled(page);
    await prefPath(page, HOKKAIDO).click();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="loaded"]`)).toBeAttached();
    await expectCached(page, 'maps-cards', '/cards/ja/01.json');

    // Act：オフラインにして再読み込み（URL のハッシュで北海道が固定される）
    await reloadOffline(context, page);

    // Assert：地図・見出し・カードの内容が出る
    await expect(page.locator('h1')).toContainText('めいぶつ');
    await expect(page.locator('path[data-pref]')).toHaveCount(47);
    await expect(prefPath(page, HOKKAIDO)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="loaded"]`)).toBeAttached();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-item]`).first()).toBeVisible();
  });

  test('5.4：オフラインでも、ほかの言語のページ（プリキャッシュ済み）を開ける', async ({ page, context }) => {
    // Arrange
    await openControlled(page);

    // Act：オフラインで言語の切替（全体の読み込み）
    await context.setOffline(true);
    await page.locator('a[data-lang-link="en"]').click();

    // Assert
    await expect(page).toHaveURL(/\/en\/$/u);
    await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
    await expect(page.locator('h1')).toHaveText(plainText(getMessages('en').siteName));
  });

  test('4.11.5：オフラインでは、一度見た県の市区町村だけが表示される（見ていない県は「オフラインのため表示できません」）', async ({ page, context }) => {
    // Arrange：長野県を最大化して、市区町村のデータを一度読む
    await openControlled(page);
    await prefPath(page, NAGANO).dblclick();
    await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
    await expectCached(page, 'maps-muni', `/geo/muni/${NAGANO}.topo.json`);

    // Act・Assert：オフラインで再読み込みしても、長野県の市区町村は出る
    await reloadOffline(context, page);
    await prefPath(page, NAGANO).dblclick();
    await expect(page.locator('[data-muni-status="loaded"]')).toBeAttached();
    await expect(page.locator(`[data-muni-pref="${NAGANO}"] path[data-muni]`).first()).toBeAttached();

    // Act・Assert：戻して、見ていない県（岐阜県）を最大化すると、オフラインの表示になる
    await dblclickAtCenter(page, prefPath(page, NAGANO));
    await expect(prefPath(page, NAGANO)).not.toHaveAttribute('data-state', 'maximized');
    await prefPath(page, GIFU).dblclick();
    await expect(page.locator('[data-muni-status="offline"]')).toBeAttached();
    await expect(page.locator('[data-muni-root] [role="status"]')).toContainText('オフライン');
    await expect(prefPath(page, GIFU)).toHaveAttribute('data-state', 'maximized');
  });
});

test.describe('5.4：Web App Manifest・アイコン', () => {
  for (const lang of LANGS) {
    test(`5.4：${lang} の manifest は、その言語の名前・start_url・アイコンを持ち、HTML からリンクされている`, async ({ page, request }) => {
      // Act
      await page.goto(`/${lang}/`);
      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      const response = await request.get(href ?? '');

      // Assert：リンクの先が manifest で、Content-Type が application/manifest+json
      expect(href).toBe(`/${lang}/app.webmanifest`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/manifest+json');
      const manifest = (await response.json()) as { name: string; start_url: string; display: string; icons: { src: string; sizes: string; purpose: string }[]; lang: string; scope: string };
      expect(manifest.name).toBe(plainText(getMessages(lang).siteName));
      expect(manifest.start_url).toBe(`/${lang}/`);
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.icons.map(icon => icon.purpose).sort()).toEqual(['any', 'any', 'maskable']);
      await expect(page.locator('html')).toHaveAttribute('lang', manifest.lang);
    });
  }

  test('5.4：manifest のアイコンと、ファビコン・apple-touch-icon が 200 で返る（同じオリジン）', async ({ page, request }) => {
    // Arrange
    await page.goto('/ja/');
    const manifest = (await (await request.get('/ja/app.webmanifest')).json()) as { icons: { src: string }[] };
    const linked = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''));

    // Act・Assert
    expect(linked).toEqual(['/icons/icon.svg', '/icons/apple-touch-icon.png']);
    for (const src of [...manifest.icons.map(icon => icon.src), ...linked]) {
      expect(src.startsWith('/'), src).toBe(true);
      const response = await request.get(src);
      expect(response.status(), src).toBe(200);
      expect(response.headers()['content-type'], src).toMatch(/^image\//u);
    }
  });
});

test.describe('5.5：Service Worker があっても CSP 違反が出ない', () => {
  test('5.5：登録・プリキャッシュ・オフラインの操作の間に、CSP 違反が1件も出ない', async ({ page, context }) => {
    // Arrange：違反を集める（イベントはページの読み込みの前から）
    const found: string[] = [];
    await page.exposeFunction('__reportCsp', (directive: string) => found.push(`securitypolicyviolation：${directive}`));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => (window as unknown as { __reportCsp: (directive: string) => void }).__reportCsp(event.violatedDirective), true);
    });
    page.on('console', message => {
      if (/content[-\s]security[-\s]policy|refused to/iu.test(message.text())) found.push(`console：${message.text()}`);
    });
    page.on('pageerror', error => found.push(`pageerror：${error.message}`));

    // Act：オンラインで県を見て、オフラインで再読み込みして、キャッシュから表示する
    await openControlled(page);
    await prefPath(page, HOKKAIDO).click();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="loaded"]`)).toBeAttached();
    await expectCached(page, 'maps-cards', '/cards/ja/01.json');
    await reloadOffline(context, page);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="loaded"]`)).toBeAttached();

    // Assert
    expect(found).toEqual([]);
  });
});
