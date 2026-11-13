import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';

// PRに載せるスクリーンショットの画面（playwright.screenshots.config.ts）。今の作業ツリーだけを撮る（before は撮らない）。
// 画面が変わるタスクでは、変わった状態（例：県を選んでパネルを開いた状態）を SCENES に足す
type Scene = {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
};

/** ハイドレーションが終わってから県をクリックして固定し、マウスを地図から外す（ホバーの見た目を写さない） */
async function pinPref(page: Page): Promise<void> {
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('path[data-pref="20"]').click();
  await page.locator('path[data-pref="20"][aria-pressed="true"]').waitFor();
  await page.mouse.move(0, 0);
}

const SCENES: readonly Scene[] = [
  ...LANGS.map(lang => ({ name: `${lang}-top`, path: `/${lang}/` })),
  // F-MAP-04：端末の設定がダークのときの色
  { name: 'ja-top-dark', path: '/ja/', prepare: page => page.emulateMedia({ colorScheme: 'dark' }) },
  // T2-05：県（長野県）をクリックして固定した状態。固定した県の塗りと、カードの県名が変わる。最大化は見た目が変わらない（拡大は T2-06）ので撮らない
  { name: 'ja-pinned', path: '/ja/', prepare: pinPref },
  // 存在しないパスの404（app/global-not-found.tsx）。404のステータスでも、page.goto は例外にならずに撮れる
  { name: 'ja-not-found', path: '/ja/no-such-page/' }
];

const OUT_DIR = process.env.SCREENSHOT_OUT ?? '';

for (const scene of SCENES) {
  test(scene.name, async ({ page }, testInfo) => {
    await page.goto(scene.path);
    // フォントの読み込みが終わる前に撮ると、文字が別のフォントで写る
    await page.evaluate(() => document.fonts.ready);
    await scene.prepare?.(page);
    await page.screenshot({
      path: join(OUT_DIR, `${scene.name}-${testInfo.project.name}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}
