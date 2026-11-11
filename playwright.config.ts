import { defineConfig, devices } from '@playwright/test';

// 10.2・5.3：PC・スマホ・タブレットで E2E を動かす。
// サーバーは next dev（T0-03 で、dist/ を配信する wrangler dev に切り替える）。
// Next.js 16 は同じディレクトリで next dev を2つ起動できないので、pnpm dev と同じ 3000 番を使い、
// 手元で動いている dev サーバーがあればそれを使う（CI では毎回起動する）
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry'
  },
  projects: [
    // PC（5.3）
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // スマホ（5.3）。Pixel 10 は幅360px で、対応する画面幅の下限にあたる
    { name: 'iphone', use: { ...devices['iPhone 17'] } },
    { name: 'pixel', use: { ...devices['Pixel 10'] } },
    // タブレット（5.3 の 768〜1366px）。iPad Mini の縦は下限の 768px
    { name: 'ipad-portrait', use: { ...devices['iPad Mini'] } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'] } }
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `${BASE_URL}/maps/ja/`,
    reuseExistingServer: !IS_CI,
    timeout: 120_000
  }
});
