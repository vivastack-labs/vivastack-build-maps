import { defineConfig, devices } from '@playwright/test';

// T3-02：プレビュー用のビルド（pnpm build:preview。BUILD_TARGET=preview）の E2E。pnpm test:e2e:preview で動かす（pnpm test:e2e には含めない）。
// 本番用のビルド（playwright.config.ts）と同じ out/・dist/ に出力するので、別のサーバーを同時に動かさず、別の設定にしている。
// プレビューの違い（準備中を使わない・下書きも出す・noindex）はブラウザによらないので、chromium だけで足りる。
// ポートは E2E（8788番）・pnpm dev（3000番）・wrangler dev の既定（8787番）とぶつからない 8789番（スクリーンショットの設定と同じ。同時には動かさない）
const PORT = 8789;
const BASE_URL = `http://localhost:${PORT}`;
const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e-preview',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,
  // 本番用のビルドの E2E（playwright.config.ts）の失敗のレポート・trace を上書きしないように、出力先を分ける（e2e.yml が両方をアップロードする）
  outputDir: 'test-results-preview',
  reporter: IS_CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-preview' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // T4-02：Service Worker（sw.js）が通信を横取りすると、page.route で失敗・遅延を作る既存のテストの結果が変わる。SW のなかった今までと同じ条件で動かす（tests/e2e/pwa.spec.ts だけ許可）
    serviceWorkers: 'block',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // コンテンツはフィクスチャ（開発計画 1.1）。本物の制作の進み具合でテストの結果が変わらないようにする
    command: `CONTENT_DIR=tests/fixtures/content pnpm build:preview && pnpm exec wrangler dev --port ${PORT}`,
    url: `${BASE_URL}/ja/`,
    reuseExistingServer: false,
    // wrangler の利用状況を送らない
    env: { WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_WEB_ANALYTICS_SITE_ID: '0123456789abcdef0123456789abcdef' },
    timeout: 180_000
  }
});
