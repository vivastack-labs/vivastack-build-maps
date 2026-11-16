import { defineConfig, devices, type PlaywrightTestProject } from '@playwright/test';

type DeviceDescriptor = (typeof devices)[string];

// 10.2・5.3：PC・スマホ・タブレットで E2E を動かす。
// サーバーは、本番の Workers と同じ動き（パス・リダイレクト・ヘッダー）を確かめるため、dist/ を配信する wrangler dev（T0-03）。
// プロジェクト（9つ。T4-06）と 5.3 の対応：
//   PC          chromium・firefox・webkit（Desktop 1280px）、chromebook（Desktop Chrome の 1366×768。学校の端末・画面幅 1366px）
//   スマホ      iphone（iPhone 17、402px）、pixel（Pixel 10、360px。画面幅の下限）
//   タブレット  ipad-portrait（iPad Mini の縦、768px）、ipad-landscape（iPad Pro 11 の横、1194px）、android-tablet（Galaxy Tab S9 の横、1024px）
// PC だけ・タッチだけのテストは、テストに `@pc`・`@touch` のタグを付けて分ける（下の pcProject・touchProject）。
// 実行例：`pnpm test:e2e --grep @touch`。CI で確かめられないものは docs/device-checklist.md（実機）
// 古い dist/ を確かめないように毎回ビルドし、手元で動いているサーバーは使わない。
// ポートは pnpm dev（3000番）とも、手で起動した wrangler dev（既定の 8787番）ともぶつからない 8788番
const PORT = 8788;
const BASE_URL = `http://localhost:${PORT}`;
const IS_CI = Boolean(process.env.CI);

/**
 * PC のプロジェクト（マウス・キーボード）。`@touch` のテストを除く。
 * テストは `test(…, { tag: '@pc' }, …)`・`test.describe(…, { tag: '@pc' }, …)` で PC だけに限る（T4-06）
 */
function pcProject(name: string, device: DeviceDescriptor): PlaywrightTestProject {
  return { name, use: device, grepInvert: /@touch/ };
}

/**
 * タッチのプロジェクト（スマホ・タブレット）。`@pc` のテストを除く。
 * テストは `{ tag: '@touch' }` でタッチだけに限る（T4-06）
 */
function touchProject(name: string, device: DeviceDescriptor): PlaywrightTestProject {
  return { name, use: device, grepInvert: /@pc/ };
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // T4-02：Service Worker（sw.js）が通信を横取りすると、page.route で失敗・遅延を作る既存のテストの結果が変わる。SW のなかった今までと同じ条件で動かす（tests/e2e/pwa.spec.ts だけ許可）
    serviceWorkers: 'block',
    trace: 'on-first-retry'
  },
  projects: [
    // PC（5.3）。マウス・キーボードの操作を確かめる
    pcProject('chromium', devices['Desktop Chrome']),
    pcProject('firefox', devices['Desktop Firefox']),
    pcProject('webkit', devices['Desktop Safari']),
    // 学校の端末（GIGA の Chromebook・Windows の多くが 1366×768）と、画面幅 1366px
    pcProject('chromebook', { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } }),
    // スマホ（5.3）。Pixel 10 は幅360px で、対応する画面幅の下限にあたる
    touchProject('iphone', devices['iPhone 17']),
    touchProject('pixel', devices['Pixel 10']),
    // タブレット（5.3 の 768〜1366px）。iPad Mini の縦は下限の 768px
    touchProject('ipad-portrait', devices['iPad Mini']),
    touchProject('ipad-landscape', devices['iPad Pro 11 landscape']),
    // Android タブレット。1024px は2列の配置の下限（ホバーのないタッチの端末で確かめる）
    touchProject('android-tablet', devices['Galaxy Tab S9 landscape'])
  ],
  webServer: {
    // コンテンツはフィクスチャ（開発計画 1.1）。本物の制作の進み具合でテストの結果が変わらないようにする
    command: `CONTENT_DIR=tests/fixtures/content pnpm build && pnpm exec wrangler dev --port ${PORT}`,
    url: `${BASE_URL}/ja/`,
    reuseExistingServer: false,
    // wrangler の利用状況を送らない
    env: { WRANGLER_SEND_METRICS: 'false' },
    timeout: 180_000
  }
});
