import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';

// PRに載せるスクリーンショットの画面（playwright.screenshots.config.ts）。
// before（main）でも、このファイルを今のブランチから写して撮る。
// 画面が変わるタスクでは、変わった状態（例：県を選んでパネルを開いた状態）を SCENES に足す。
// main にまだない画面は before で失敗し、PR本文の表では「なし」になる
type Scene = {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
};

const SCENES: readonly Scene[] = LANGS.map(lang => ({ name: `${lang}-top`, path: `/${lang}/` }));

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
