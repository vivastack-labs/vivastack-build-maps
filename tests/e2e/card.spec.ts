import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { distanceText, durationText } from '../../src/i18n/cardText';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { distancesFromTokyo } from '../../src/lib/distance';

// F-CARD-02〜06・08、4.11.4、6.6 (2)、D24：県のカード（T3-03）。本番用のビルド。コンテンツは tests/fixtures/content/（playwright.config.ts の CONTENT_DIR）。
// 北海道は全部 reviewed（内容を出す）、東京都は reviewed・verified・draft が混在、沖縄県は未作成。本番で内容を出すのは北海道だけで、残りの46県は「準備中」。
// 内容の文字は、ふりがなのない英語のページで比べる（ふりがなの <rt> が本文に混ざらない）。

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
async function open(page: Page, lang = 'en'): Promise<void> {
  await page.goto(`/${lang}/`);
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
  await page.locator('[data-card-ready]').waitFor({ state: 'attached' });
}

/**
 * さくいんの項目をクリックして県を固定する（地図の小さな県を座標で押さずに済む）。
 * 先に `hover()` して、その県のカードが表示されるのを待ってから `click()` する。
 * 1列の配置（1024px 未満）ではカードがさくいんの上にあり、マウスを項目にのせるとカードが案内文から県のカードに変わって高さが変わる。
 * `click()` のマウスの移動の途中でそれが起きると、`pointerdown` と `pointerup` が別の項目になり、`click` が共通の祖先に出て固定にならない。
 * 先にカードを変えておけば、`click()` が位置を取り直してから押すので、同じ項目で `pointerdown`・`pointerup` になる（タッチのプロジェクトもマウスのイベントで動く）。
 */
async function pinFromIndex(page: Page, code: string): Promise<void> {
  const item = page.locator(`a[data-pref="${code}"]`);
  await item.hover();
  await expect(page.locator(`[data-card-pref="${code}"]`)).toBeVisible();
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
}

test.describe('F-CARD-02〜06：県のカード', () => {
  test('F-CARD-02〜06：北海道を固定すると、本物のカード（見出し・距離・行き方・名物3つ・名所3つ）が見える', async ({ page }) => {
    // Arrange
    const hokkaido = prefOf(HOKKAIDO);
    const messages = getMessages('en');
    const distance = distancesFromTokyo(prefectures).get(HOKKAIDO) ?? Number.NaN;
    await open(page);

    // Act
    await pinFromIndex(page, HOKKAIDO);

    // Assert：見出し（F-CARD-02）・距離（F-CARD-03）
    const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
    await expect(card).toBeVisible();
    await expect(page.locator('[data-card-guide]')).toBeHidden();
    await expect(card.locator('h2[data-card-name]')).toHaveText(hokkaido.name.en);
    await expect(card.locator('[data-card-region]')).toHaveText(messages.regions.hokkaido);
    await expect(card.locator('[data-card-capital]')).toContainText(hokkaido.capital.name.en);
    await expect(card.locator('[data-card-distance]')).toHaveText(distanceText('en', distance));
    // 行き方（F-CARD-04）：交通手段・経路・所要時間の目安
    const access = card.locator('[data-card-access]');
    await expect(access).toContainText(hokkaido.access?.mode.en ?? '');
    await expect(access).toContainText(hokkaido.access?.route.en ?? '');
    await expect(access.locator('[data-card-duration]')).toContainText(durationText('en', hokkaido.access?.durationMin ?? 0));
    await expect(access.locator('[data-card-duration]')).toContainText(messages.card.durationLabel);
    // 名物3つ・名所3つ（F-CARD-05・06）
    const specialties = card.locator('[data-card-specialties] [data-card-item]');
    await expect(specialties).toHaveCount(3);
    for (const [i, specialty] of hokkaido.specialties.entries()) {
      await expect(specialties.nth(i)).toContainText(specialty.name.en);
      await expect(specialties.nth(i)).toContainText(specialty.emoji);
    }
    const spots = card.locator('[data-card-spots] [data-card-item]');
    await expect(spots).toHaveCount(3);
    for (const [i, spot] of hokkaido.spots.entries()) {
      await expect(spots.nth(i)).toContainText(spot.name.en);
    }
    // 本番の内容のある県に「下書き」の印は出ない
    await expect(card.locator('[data-card-draft]')).toHaveCount(0);
  });

  test('4.11.4：準備中の県（沖縄県）のカードは「名物・名所は準備中です」', async ({ page }) => {
    // Arrange
    const okinawa = prefOf(OKINAWA);
    await open(page);

    // Act
    await pinFromIndex(page, OKINAWA);

    // Assert：県名・県庁所在地・距離は出し、行き方・名物・名所は出さない
    const card = page.locator(`[data-card-pref="${OKINAWA}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-card-name]')).toHaveText(okinawa.name.en);
    await expect(card.locator('[data-card-capital]')).toContainText(okinawa.capital.name.en);
    await expect(card.locator('[data-card-distance]')).toBeVisible();
    await expect(card.locator('[data-card-coming-soon]')).toBeVisible();
    await expect(card.locator('[data-card-coming-soon]')).toContainText(getMessages('en').comingSoon.card.adult);
    await expect(card.locator('[data-card-access], [data-card-specialties], [data-card-spots]')).toHaveCount(0);
    // 最大化などの操作は、ほかの県と同じようにできる
    await expect(card.locator('[data-card-maximize]')).toBeVisible();
  });
});

test.describe('F-CARD-08：最大化ボタン', () => {
  test('最大化ボタンで最大化し、文言が「元の大きさにもどす」に変わる。もう一度押すと元に戻り、固定は残る', async ({ page }) => {
    // Arrange
    const messages = getMessages('en');
    await open(page);
    await pinFromIndex(page, HOKKAIDO);
    const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
    const button = card.locator('[data-card-maximize]');
    const layer = page.locator('[data-map-layer]');
    await expect(button).toContainText(messages.card.maximize);

    // Act：最大化
    await button.click();

    // Assert：地図の県が最大化し、寄って倍率が1でなくなる。文言が変わる
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('data-state', 'maximized');
    await expect(layer).not.toHaveAttribute('data-zoom-scale', '1');
    await expect(button).toContainText(messages.card.restore);
    await expect(button.locator('[data-label-maximize]')).toBeHidden();

    // Act：もう一度押す
    await button.click();

    // Assert：最大化だけが解け（固定は残る）、全体の倍率に戻り、文言も戻る
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('data-state', 'pinned');
    await expect(page.locator(`path[data-pref="${HOKKAIDO}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(layer).toHaveAttribute('data-zoom-scale', '1');
    await expect(button).toContainText(messages.card.maximize);
    await expect(card).toBeVisible();
  });
});

test.describe('6.6 (2)：JavaScript がないとき', () => {
  test.use({ javaScriptEnabled: false });

  for (const code of [TOKYO, HOKKAIDO]) {
    test(`/ja/#pref-${code} を開くと、その県のカードが見え、案内文と最大化ボタンは見えない`, async ({ page }) => {
      // Arrange・Act
      await page.goto(`/ja/#pref-${code}`);

      // Assert：ハッシュの県のカードだけが見える
      await expect(page.locator(`[data-card-pref="${code}"]`)).toBeVisible();
      await expect(page.locator('[data-card-pref]:visible')).toHaveCount(1);
      await expect(page.locator(`[data-card-pref="${code}"] [data-card-name]`)).toBeVisible();
      await expect(page.locator('[data-card-guide]')).toBeHidden();
      // 動かないボタンは出さない
      await expect(page.locator('[data-card-maximize]:visible')).toHaveCount(0);
    });
  }

  test('ハッシュがなければ、案内文だけが見える', async ({ page }) => {
    // Arrange・Act
    await page.goto('/ja/');

    // Assert
    await expect(page.locator('[data-card-guide]')).toBeVisible();
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(0);
  });
});

test.describe('6.6 (2)：JavaScript があるとき、:target の規則は止まる', () => {
  test('/en/#pref-13 を開いても、ハイドレーションの後は案内文だけが見え、固定するとその県のカードだけが見える', async ({ page }) => {
    // Arrange・Act：ハッシュで開き、`CardSwitch` のマウント（data-card-ready）を待つ
    await page.goto(`/en/#pref-${TOKYO}`);
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });

    // Assert：状態が空なので、ハッシュのカードは見えず（:target の規則が止まる）、案内文が見える
    await expect(page.locator('[data-card-guide]')).toBeVisible();
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(0);

    // Act：さくいんから北海道を固定する
    await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
    await pinFromIndex(page, HOKKAIDO);

    // Assert：状態で選んだカード1枚だけが見える（ハッシュの東京都と2枚同時には見えない）
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(1);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
    await expect(page.locator('[data-card-guide]')).toBeHidden();
  });
});

test.describe('D24：HTML の大きさ', () => {
  const firstSpecialty = prefOf(HOKKAIDO).specialties[0];
  const descriptions = firstSpecialty?.description;

  /** ページの HTML を、`<script>` の外（本体）と中（RSC のデータ）に分けて返す */
  async function htmlOf(request: APIRequestContext, lang: string): Promise<{ readonly all: string; readonly body: string; readonly scripts: string }> {
    const all = await (await request.get(`/${lang}/`)).text();
    return { all, body: all.replace(/<script[\s\S]*?<\/script>/gu, ''), scripts: [...all.matchAll(/<script[\s\S]*?<\/script>/gu)].map(match => match[0]).join('\n') };
  }

  test('解説文は HTML の本体に1回、RSC のデータ（<script>）に1回だけ出る', async ({ request }) => {
    // Arrange：ふりがながなく、HTML の記号を含まない、北海道の最初の名物の英語の解説文（おとな向け）
    const sentence = descriptions?.en.adult ?? '';
    expect(sentence).toMatch(/^[\w ,.]+$/u);

    // Act
    const { body, scripts } = await htmlOf(request, 'en');

    // Assert：サーバーコンポーネントの結果は、本体と RSC のデータに1回ずつ（props などで3回目を作らない）
    expect(body.split(sentence)).toHaveLength(2);
    expect(scripts.split(sentence)).toHaveLength(2);
  });

  test('英語のページの HTML に、ほかの言語（日本語・中国語）の解説文は出てこない', async ({ request }) => {
    // Arrange：カードを 'use client' にして全言語の元データを props で渡すと、ここで見つかる
    const others = [descriptions?.ja.adult, descriptions?.ja.kids, descriptions?.zh.adult, descriptions?.zh.kids];
    expect(others.every(text => typeof text === 'string' && text !== '')).toBe(true);

    // Act
    const { all } = await htmlOf(request, 'en');

    // Assert
    for (const text of others) expect(all).not.toContain(text);
  });

  test('日本語のページの HTML に、ふりがなの記法つきの元の文字列（{漢字|よみ}）は出てこない', async ({ request }) => {
    // Arrange：ふりがなの変換（<ruby>）はビルド時にサーバーで済ませる。記法のままの文字列が出るなら、クライアントに元データが渡っている
    const sources = [descriptions?.ja.adult, descriptions?.ja.kids];
    for (const text of sources) expect(text).toMatch(/\{[^}|]+\|[^}]+\}/u);

    // Act
    const { all } = await htmlOf(request, 'ja');

    // Assert
    // 辞書の文言（クライアントコンポーネントの props。小さい）には記法が残るので、記法の有無ではなく、コンテンツの文で確かめる
    for (const text of sources) expect(all).not.toContain(text);
  });
});
