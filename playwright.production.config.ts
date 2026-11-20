import { defineConfig, devices } from '@playwright/test';
import { SITE_URL } from './src/lib/site';

/** T6-02：デプロイされた静的ページを読む。手元で配信したビルドにも同じ検査を使える。 */
export default defineConfig({
  testDir: 'tests/e2e-production',
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'test-results/production',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PRODUCTION_CHECK_BASE_URL || SITE_URL,
    javaScriptEnabled: false,
    serviceWorkers: 'block'
  }
});
