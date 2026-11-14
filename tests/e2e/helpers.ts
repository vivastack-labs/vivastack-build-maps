import type { Page } from '@playwright/test';

/**
 * 画面への反映を待つ（requestAnimationFrame を2回）。「変わらない」ことを確かめる前に呼ぶ。
 * 待たないと、操作が反映される前の DOM を見て、実装が壊れていてもテストが通ってしまう
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
