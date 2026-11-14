import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 画面への反映を待つ（requestAnimationFrame を2回）。「変わらない」ことを確かめる前に呼ぶ。
 * 待たないと、操作が反映される前の DOM を見て、実装が壊れていてもテストが通ってしまう
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** 要素の外接矩形の中心（表示の中の座標）。要素が見えない（描かれていない）ときは例外 */
async function centerOf(locator: Locator): Promise<{ readonly x: number; readonly y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('要素の位置を取れません');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * 寄る動き（最大化の300ms）が止まって、中心が2回続けて同じになるのを待ってから、その中心を返す。
 * 動きの途中の座標を押すと、別の場所を押してしまう
 */
async function settledCenter(locator: Locator): Promise<{ readonly x: number; readonly y: number }> {
  let previous = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(await centerOf(locator));
      const isSame = current === previous;
      previous = current;
      return isSame;
    })
    .toBe(true);
  return centerOf(locator);
}

/**
 * 要素の外接矩形の中心を、座標でダブルクリックする（動きが止まるのを待ってから）。
 * 最大化した県は、市区町村の形（T2-08）が上に重なるので、`locator.dblclick()` は「ほかの要素がクリックを受ける」で止まる。
 * 座標なら、そこにある要素（県のパスか市区町村の形）が受ける（どちらも同じ県の操作になる）。
 * Playwright の自動のスクロールがないので、要素が表示の中にあるときに使う
 */
export async function dblclickAtCenter(page: Page, locator: Locator): Promise<void> {
  const { x, y } = await settledCenter(locator);
  await page.mouse.dblclick(x, y);
}

/** 要素の外接矩形の中心を、座標でクリックする（`dblclickAtCenter` と同じ理由。動きが止まるのを待ってから） */
export async function clickAtCenter(page: Page, locator: Locator): Promise<void> {
  const { x, y } = await settledCenter(locator);
  await page.mouse.click(x, y);
}
