import { defineConfig, devices } from '@playwright/test';

// PRに載せるスクリーンショットを撮る（scripts/pr-screenshots.ts から実行する。pnpm test:e2e には含めない）。
// 画像は環境変数 SCREENSHOT_OUT のディレクトリに <画面>-<端末>.png で書き出す。
// サーバーは E2E と同じく dist/ を配信する wrangler dev。ポートは E2E（8788）とぶつからない 8789番
const PORT = 8789;
const BASE_URL = `http://localhost:${PORT}`;

if (!process.env.SCREENSHOT_OUT) {
  throw new Error('SCREENSHOT_OUT に画像の出力先を指定してください（node scripts/pr-screenshots.ts から実行する）');
}

export default defineConfig({
  testDir: 'tests/screenshots',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: BASE_URL },
  // 端末は PC と、対応する画面幅の下限のスマホ（5.3）の2つに絞る
  projects: [
    { name: 'pc', use: { ...devices['Desktop Chrome'] } },
    { name: 'sp', use: { ...devices['Pixel 10'] } }
  ],
  webServer: {
    command: `pnpm build && pnpm exec wrangler dev --port ${PORT}`,
    url: `${BASE_URL}/ja/`,
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
    timeout: 180_000
  }
});
