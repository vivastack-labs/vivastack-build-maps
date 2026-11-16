import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { MODE_STORAGE_KEY } from '../../src/features/mode/settings';
import { LANGS } from '../../src/i18n/lang';

import { expandSheet, settle } from './helpers';

// 5.2（T4-03）：axe で、WCAG 2.2 AA（A・AA）の違反が0件であることを確かめる。本番用のビルド（フィクスチャのコンテンツ。北海道だけが内容を持つ）。
// 組み合わせ：3言語 × 2モード（こども・おとな）× ライト・ダーク × 状態（PC は最初の表示・固定中・最大化中、スマホはパネルの peek・full）。
// 同じ検査を7つのプロジェクトでくり返さないよう、PC の状態は chromium、パネルは pixel のプロジェクトだけで動かす。
// 除外（exclude・disableRules）はしない。axe が判断できない項目（incomplete）は、違反にならない（SVG の中の文字の色など。色は単体テストで確かめる）。

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MODES = ['kids', 'adult'] as const;
const SCHEMES = ['light', 'dark'] as const;
const HOKKAIDO = '01';
/** 外接矩形の中心が県の中にあるので、`locator.hover()` で県の上にマウスをのせられる */
const NAGANO = '20';

type Mode = (typeof MODES)[number];
type Scheme = (typeof SCHEMES)[number];

/**
 * モードと配色を切り替えて、ページを開く。モードは localStorage に入れ（初期化スクリプトが最初の描画の前に読む。T3-05）、配色は `emulateMedia` で切り替える。
 * 切り替わらなければ（キーが変わったときなど）、既定のモードや配色を2回検査して通ってしまうので、開いた後に確かめる
 */
async function openPage(page: Page, lang: string, mode: Mode, scheme: Scheme, hash = ''): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key as string, value as string), [MODE_STORAGE_KEY, mode]);
  await page.goto(`/${lang}/${hash}`);
  // ハイドレーションが終わるのを待つ（終わる前の操作は失われる）。これらは表示されていないことがあるので、DOM にあるかで待つ
  for (const selector of ['[data-map-ready]', '[data-index-ready]', '[data-card-ready]']) await page.locator(selector).waitFor({ state: 'attached' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
  expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches), `配色が ${scheme} になっている`).toBe(scheme === 'dark');
}

/** 北海道のカードの内容（JSON）が入るのを待つ */
async function waitForCardDetails(page: Page): Promise<void> {
  await page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="loaded"]`).waitFor({ state: 'attached' });
}

/**
 * 最大化の寄る動きが終わるのを待つ。始まる前の倍率1が2回続いて通らないよう、先に倍率が1でなくなるのを待ってから、止まるのを待つ
 * （全体表示の倍率は1。県が収まる倍率は1より大きい）
 */
async function waitForZoomSettled(page: Page): Promise<void> {
  const layer = page.locator('[data-map-layer]');
  await expect(layer).not.toHaveAttribute('data-zoom-scale', '1');
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = (await layer.getAttribute('data-zoom-scale')) ?? '';
        const isSame = current === previous;
        previous = current;
        return isSame;
      },
      { intervals: [300] }
    )
    .toBe(true);
  await settle(page);
}

/** axe を動かして、違反を「規則の ID・影響・要素」の文字にして返す（0件なら空） */
async function violationsOf(page: Page): Promise<readonly string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map(
    violation => `${violation.id}（${violation.impact ?? '-'}）：${violation.help}\n${violation.nodes.map(node => `  ${node.target.join(' ')}\n    ${node.failureSummary ?? ''}`).join('\n')}`
  );
}

async function expectNoViolations(page: Page): Promise<void> {
  expect(await violationsOf(page), '違反の一覧').toEqual([]);
}

test.describe('5.2：axe（PC）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'PC の状態は chromium だけで確かめる（同じ検査をくり返さない）');
  });

  for (const lang of LANGS) {
    for (const mode of MODES) {
      for (const scheme of SCHEMES) {
        const name = `${lang}・${mode}・${scheme}`;

        test(`5.2：${name}・最初の表示で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme);

          await expectNoViolations(page);
        });

        test(`5.2：${name}・固定中で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme, `#pref-${HOKKAIDO}`);
          await waitForCardDetails(page);
          await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('aria-pressed', 'true');

          await expectNoViolations(page);
        });

        test(`5.2：${name}・最大化中で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme, `#pref-${HOKKAIDO}`);
          await waitForCardDetails(page);

          await page.locator(`[data-card-maximize="${HOKKAIDO}"]`).click();
          await page.locator('[data-muni-status="loaded"]').waitFor({ state: 'attached' });
          await page.locator('[data-muni-list]').waitFor({ state: 'attached' });
          await waitForZoomSettled(page);

          await expectNoViolations(page);
        });
      }
    }
  }
});

test.describe('5.2：axe（スマホのパネル）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel', 'パネルは pixel だけで確かめる（同じ検査をくり返さない）');
  });

  for (const lang of LANGS) {
    for (const mode of MODES) {
      for (const scheme of SCHEMES) {
        const name = `${lang}・${mode}・${scheme}`;

        test(`5.2：${name}・パネルが閉じた最初の表示で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme);
          await expect(page.locator('[data-area="card"]')).toHaveAttribute('data-sheet', 'closed');
          // パネルが閉じている間は、地図の下の案内文が見える（4.11.7）。この状態の文字の色も検査する
          await expect(page.locator('[data-sheet-guide]')).toBeVisible();

          await expectNoViolations(page);
        });

        test(`5.2：${name}・パネル（peek）で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme);

          await page.locator(`a[data-pref="${HOKKAIDO}"]`).click();
          await expect(page.locator('[data-area="card"]')).toHaveAttribute('data-sheet', 'peek');
          await waitForCardDetails(page);
          await settle(page);

          await expectNoViolations(page);
        });

        test(`5.2：${name}・パネル（full）で axe の違反が0件`, async ({ page }) => {
          await openPage(page, lang, mode, scheme);

          await page.locator(`a[data-pref="${HOKKAIDO}"]`).click();
          await expandSheet(page);
          await waitForCardDetails(page);
          await settle(page);

          await expectNoViolations(page);
        });
      }
    }
  }
});

// 固定中の県名ラベル：暗い文字に、塗りと同じ色の縁取りを付ける（県の形からはみ出しても、塗りと 4.5:1 以上。theme-contrast.test.ts）
test.describe('5.2：固定中の県名ラベルの縁取り', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'chromium だけで確かめる');
  });

  for (const scheme of SCHEMES) {
    test(`5.2：${scheme}・固定中のラベルだけに、塗りと同じ色の縁取りが付く。ホバーで薄くなる県のパスとは別（縁取りは薄くならない）`, async ({ page }) => {
      await openPage(page, 'ja', 'kids', scheme, `#pref-${NAGANO}`);
      const label = page.locator(`[data-pref-label="${NAGANO}"]`);
      const other = page.locator('[data-pref-label="01"]');
      const path = page.locator(`path[data-pref="${NAGANO}"]`);
      await expect(path).toHaveAttribute('aria-pressed', 'true');

      // 縁取りの色は、塗りと同じ色
      const fill = await path.evaluate(element => getComputedStyle(element).fill);
      await expect(label).toHaveCSS('stroke', fill);
      await expect(label).toHaveCSS('paint-order', 'stroke');
      // 倍率1のとき 3px（SVG の既定の 1px ではない）
      await expect(label).toHaveCSS('stroke-width', '3px');
      // ふつうの県のラベルには付かない
      await expect(other).toHaveCSS('stroke', 'none');

      // 固定中の県にマウスをのせると、パスは薄くなる（hover:opacity-80）が、ラベルは別の要素なので薄くならない
      await path.hover();
      await expect(path).toHaveCSS('opacity', '0.8');
      await expect(label).toHaveCSS('opacity', '1');
    });
  }
});
