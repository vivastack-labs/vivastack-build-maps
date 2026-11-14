import { expect, test, type Page } from '@playwright/test';
import { LANGS } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { plainText } from '../../src/lib/ruby';
import { settledPoint } from './helpers';

// 4.11.4・7.1・R1・R4：本番用のビルド（T3-02）。コンテンツは tests/fixtures/content/（playwright.config.ts の CONTENT_DIR。開発計画 1.1）。
// 北海道は全部 reviewed（内容を出す）、東京都は reviewed・verified・draft が混在、沖縄県は未作成。内容を出すのは北海道だけで、残りの46県は「準備中」。
// プレビュー用のビルドの確認は tests/e2e-preview/preview.spec.ts

const prefectures = loadContent('tests/fixtures/content');
const HOKKAIDO = '01';
const TOKYO = '13';
const OKINAWA = '47';

const prefOf = (code: string) => {
  const found = prefectures.find(prefecture => prefecture.code === code);
  if (!found) throw new Error(`フィクスチャに県 ${code} がありません`);
  return found;
};

/** ハイドレーションが終わるのを待ってから、ページを開く（終わる前の操作は失われる） */
async function open(page: Page, lang = 'ja'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

const fillOf = (page: Page, code: string): Promise<string> => page.locator(`path[data-pref="${code}"]`).evaluate(element => getComputedStyle(element).fill);

test.describe('4.11.4：準備中の県の表示', () => {
  test('準備中の県（東京都・沖縄県）は斜線で塗られ、北海道は地方の色', async ({ page }) => {
    await page.goto('/ja/');

    // 斜線は fill: url(#pref-pending-hatch)、地方の色は rgb(...)
    expect(await fillOf(page, TOKYO)).toContain('url(');
    expect(await fillOf(page, OKINAWA)).toContain('url(');
    expect(await fillOf(page, HOKKAIDO)).not.toContain('url(');
    await expect(page.locator('path[data-pref][data-pending]')).toHaveCount(46);
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).not.toHaveAttribute('data-pending');
    await expect(page.locator('pattern#pref-pending-hatch')).toHaveCount(1);
  });

  for (const lang of LANGS) {
    test(`凡例に「準備中」が出る（${lang}）`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      const item = page.locator('[data-legend-pending]');
      await expect(item).toHaveCount(1);
      // ふりがな（<rt>）は本文に含めずに比べる
      const text = await item.evaluate(element => {
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll('rt').forEach(rt => rt.remove());
        return copy.textContent;
      });
      expect(text).toBe(plainText(getMessages(lang).comingSoon.label));
      await expect(page.locator('[data-legend-region]')).toHaveCount(8);
    });
  }

  test('さくいんの準備中の県に（準備中）が付き、北海道には付かない', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator('[data-area="index"] [data-index-pending]')).toHaveCount(46);
    await expect(page.locator(`a[data-pref="${TOKYO}"] [data-index-pending]`)).toHaveCount(1);
    await expect(page.locator(`a[data-pref="${OKINAWA}"] [data-index-pending]`)).toHaveCount(1);
    await expect(page.locator(`a[data-pref="${HOKKAIDO}"] [data-index-pending]`)).toHaveCount(0);
    // ふりがな（<rt>）は本文に含めずに比べる
    const suffix = await page.locator(`a[data-pref="${TOKYO}"] [data-index-pending]`).evaluate(element => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('rt').forEach(rt => rt.remove());
      return copy.textContent;
    });
    expect(suffix).toBe('（準備中）');
  });

  test('英語のさくいんは、県名と（準備中）の間に空白が見える（「Tokyo (coming soon)」）', async ({ page }) => {
    await page.goto('/en/');

    // innerText は、描かれた通りの文字（flex の子の先頭の空白は消える）
    await expect(page.locator(`a[data-pref="${TOKYO}"]`)).toHaveText('Tokyo (coming soon)');
    expect(await page.locator(`a[data-pref="${TOKYO}"]`).evaluate(element => (element as HTMLElement).innerText)).toBe('Tokyo (coming soon)');
  });

  test('準備中の県の形の aria-label に（準備中）が付く', async ({ page }) => {
    await page.goto('/ja/');

    await expect(page.locator(`path[data-pref="${TOKYO}"]`)).toHaveAttribute('aria-label', '東京都（準備中）');
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('aria-label', '北海道');
  });

  test('準備中の県のツールチップは、名物があるフィクスチャ（東京都）でも県名だけ', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'タッチの端末にはマウスのホバーがない（4.11.3）');
    await open(page);
    const path = page.locator(`path[data-pref="${TOKYO}"]`);
    await path.scrollIntoViewIfNeeded();
    const point = await settledPoint(path);

    await page.mouse.move(point.x, point.y);

    const tip = page.locator(`[data-tip-pref="${TOKYO}"]`);
    await expect(tip).toBeVisible();
    await expect(tip.locator('li')).toHaveCount(0);
    expect(await tip.evaluate(element => element.querySelectorAll('rt').length)).toBeGreaterThan(0);
    await expect(tip.locator('[data-tip-name]')).toContainText('東京都');
  });
});

/** R1・R4 の request だけのテストは、ブラウザによらないので chromium だけで動かす */
const CHROMIUM_ONLY = 'ブラウザによらない確認なので chromium だけで動かす';

/** 東京都（準備中）の名物・名所。reviewed の項目も含めて、すべてが本番に出てはいけない（verified・draft が混ざることも確かめる） */
function tokyoItems() {
  const tokyo = prefOf(TOKYO);
  const items = [...tokyo.specialties, ...tokyo.spots];
  expect(items.map(item => item.status)).toContain('verified');
  expect(items.map(item => item.status)).toContain('draft');
  return items;
}

/** 項目の名前・解説文（ja・en・zh、こども・おとな）。ja はふりがなの記法つき */
const textsOf = (item: ReturnType<typeof tokyoItems>[number]): readonly string[] => [...Object.values(item.name), ...Object.values(item.description).flatMap(({ kids, adult }) => [kids, adult])];

/** Next.js が dist/ に出す、ページの RSC のデータ（`/<lang>/` の HTML のほかに、クライアントが読むファイル） */
const rscPaths = (lang: string): readonly string[] => [`/${lang}/index.txt`, `/${lang}/__next._full.txt`, `/${lang}/__next.$d$lang.__PAGE__.txt`];

test.describe('R1：本番用のビルドに、reviewed でない項目の文が含まれない', () => {
  for (const lang of LANGS) {
    test(`画面の文字（ふりがなを除く）に、東京都の名物・名所の名前・解説文が1つも出てこない。北海道の名物は出る（${lang}）`, async ({ page }) => {
      // Arrange
      const forbidden = tokyoItems().flatMap(item => textsOf(item).map(plainText));

      // Act：ふりがな（<rt>）と script（RSC のデータ。下の request のテストで確かめる）を除いた、ページ全体の文字。hidden の要素（ツールチップ）も含む
      await page.goto(`/${lang}/`);
      const body = await page.evaluate(() => {
        const copy = document.body.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('rt, script').forEach(element => element.remove());
        return copy.textContent ?? '';
      });

      // Assert：<ruby> で文字が分かれていても、ふりがなを除けば連続した文になる
      for (const text of forbidden) {
        expect(body).not.toContain(text);
      }
      expect(body).not.toContain(plainText(prefOf(TOKYO).access?.route[lang] ?? '？'));
      // 比較のため：reviewed の北海道の名物の名前は出てくる
      for (const specialty of prefOf(HOKKAIDO).specialties) {
        expect(body).toContain(plainText(specialty.name[lang]));
      }
    });

    test(`HTML と RSC のデータに、東京都の名物・名所の id と、ふりがなのない文（en・zh）・記法のままの文が出てこない（${lang}）`, async ({ request }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', CHROMIUM_ONLY);
      // Arrange：id は React の key として RSC のデータに出る。en・zh の文はふりがながないので、連続した文字列で探せる
      const items = tokyoItems();
      const forbidden = [...items.map(item => item.id), ...items.flatMap(item => textsOf(item))];

      for (const path of [`/${lang}/`, ...rscPaths(lang)]) {
        // Act
        const response = await request.get(path);
        expect(response.ok(), path).toBe(true);
        const body = await response.text();

        // Assert
        for (const text of forbidden) {
          expect(body, `${path} に ${text} が含まれている`).not.toContain(text);
        }
      }
      // 比較のため：reviewed の北海道の名物の id は、RSC のデータに出る（探し方が合っている）
      const rsc = (await Promise.all(rscPaths(lang).map(async path => (await request.get(path)).text()))).join('\n');
      for (const specialty of prefOf(HOKKAIDO).specialties) {
        expect(rsc).toContain(specialty.id);
      }
    });
  }
});

test.describe('R4：本番用のビルドには noindex が付かない', () => {
  for (const lang of LANGS) {
    test(`/${lang}/ に robots の meta がない`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });

    test(`/${lang}/ の HTML に noindex がない`, async ({ request }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', CHROMIUM_ONLY);

      expect(await (await request.get(`/${lang}/`)).text()).not.toContain('noindex');
    });
  }
});
