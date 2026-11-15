import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { distanceText, durationText } from '../../src/i18n/cardText';
import { formatDate } from '../../src/i18n/format';
import { getMessages } from '../../src/i18n/messages';
import { loadContent } from '../../src/lib/content';
import { distancesFromTokyo } from '../../src/lib/distance';
import { expandSheet } from './helpers';

// F-CARD-02〜06・08、4.11.4、6.6 (2)、D24・D38：県のカード（T3-03）。カードの内容（行き方・名物・名所・出典）は、県ごとの JSON（/cards/{lang}/NN.json。T3-09）から描く。本番用のビルド。コンテンツは tests/fixtures/content/（playwright.config.ts の CONTENT_DIR）。
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
 * 1024px 未満（1列の配置）ではカードがさくいんの上にあるが、さくいんのホバーではカードを変えないので（T3-06、4.11.2）、
 * マウスの移動の途中でカードの高さが変わって `pointerdown` と `pointerup` が別の項目になることはない。そのまま `click()` する。
 * 768px 未満（パネル）では、内容を確かめられるよう、全部見える状態にする（`expandSheet`）。
 */
async function pinFromIndex(page: Page, code: string): Promise<void> {
  const item = page.locator(`a[data-pref="${code}"]`);
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-card-pref="${code}"]`)).toBeVisible();
  await expandSheet(page);
}

/** カードの内容（JSON から描く。T3-09）が差し込み先に出るのを待つ */
async function waitForDetails(page: Page, code: string, kind = 'loaded'): Promise<void> {
  await expect(page.locator(`[data-card-pref="${code}"] [data-card-details="${kind}"]`)).toBeAttached();
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
    await waitForDetails(page, HOKKAIDO);

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

test.describe('F-SRC-01〜03：出典欄', () => {
  test('F-SRC-01〜03：北海道のカードの出典欄は閉じていて、開くと出典と「出典なし」が見える', async ({ page }) => {
    // Arrange：フィクスチャの北海道は、行き方（2件）とじゃがいも（1件）に出典があり、ほかは sources: []
    const hokkaido = prefOf(HOKKAIDO);
    const potato = hokkaido.specialties[0];
    const potatoSource = potato?.sources[0];
    const messages = getMessages('en');
    await open(page);
    await pinFromIndex(page, HOKKAIDO);
    await waitForDetails(page, HOKKAIDO);
    const sources = page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-sources]`);

    // Assert：最初は閉じていて、中身は見えない（F-SRC-01）。「準備中」の沖縄県のカードには出典欄がない
    await expect(sources).toBeVisible();
    await expect(sources).not.toHaveAttribute('open');
    await expect(sources.locator('a').first()).toBeHidden();
    await expect(page.locator(`[data-card-pref="${OKINAWA}"] [data-card-sources]`)).toHaveCount(0);

    // Act
    await sources.locator('summary').click();

    // Assert：出典のある項目は、タイトルのリンク・URL・確認日（F-SRC-02）
    await expect(sources).toHaveAttribute('open', '');
    const potatoItem = sources.locator('[data-source-item="specialties/potato"]');
    await expect(potatoItem.locator('a')).toHaveText(potatoSource?.title ?? '');
    await expect(potatoItem.locator('a')).toHaveAttribute('href', potatoSource?.url ?? '');
    await expect(potatoItem.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(potatoItem.locator('[data-source-url]')).toHaveText(potatoSource?.url ?? '');
    await expect(potatoItem.locator('[data-source-accessed]')).toHaveText(`${messages.card.accessed}: ${formatDate('en', potatoSource?.accessed ?? '')}`);
    await expect(sources.locator('[data-source-item="access"] [data-source]')).toHaveCount(2);
    // 出典のない項目は「出典なし」（F-SRC-03）。リンクは出さない
    const milkItem = sources.locator('[data-source-item="specialties/milk"]');
    await expect(milkItem.locator('[data-source-none]')).toHaveText(messages.card.noSource);
    await expect(milkItem.locator('a')).toHaveCount(0);
    // 行き方・名物・名所の順（4.11.7）
    const keys = await sources.locator('[data-source-item]').evaluateAll(items => items.map(item => item.getAttribute('data-source-item')));
    expect(keys).toEqual(['access', ...hokkaido.specialties.map(item => `specialties/${item.id}`), ...hokkaido.spots.map(item => `spots/${item.id}`)]);
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

  test('5.3：JavaScript がないとき、:target のカードに見出しと「JavaScript を有効にすると読めます」の文が出て、内容と出典欄は出ない（D38）', async ({ page }) => {
    // Arrange・Act
    await page.goto(`/en/#pref-${HOKKAIDO}`);

    // Assert：見出し（県名・県庁所在地・距離）と、内容の代わりの文
    const card = page.locator(`[data-card-pref="${HOKKAIDO}"]`);
    await expect(card.locator('[data-card-name]')).toHaveText(prefOf(HOKKAIDO).name.en);
    await expect(card.locator('[data-card-capital]')).toBeVisible();
    await expect(card.locator('[data-card-distance]')).toBeVisible();
    await expect(card.locator('[data-card-needs-script]')).toBeVisible();
    await expect(card.locator('[data-card-needs-script] .adult')).toHaveText(getMessages('en').card.needsScript.adult);
    await expect(card.locator('[data-card-needs-script] .kids')).toBeHidden();
    // 内容・出典欄は HTML にないので、出ない
    await expect(card.locator('[data-card-access], [data-card-specialties], [data-card-spots], [data-card-item], [data-card-sources]')).toHaveCount(0);
  });

  test('ハッシュがなければ、案内文だけが見える', async ({ page }) => {
    // Arrange・Act
    await page.goto('/ja/');

    // Assert
    await expect(page.locator('[data-card-guide]')).toBeVisible();
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(0);
  });
});

test.describe('6.6 (2)：JavaScript があるとき、:target の規則は止まる', () => {
  test('5.3：JavaScript が有効なら（scripting: enabled）、ハイドレーションの前（JavaScript を読み込む前）も「JavaScript を有効にすると読めます」の文は見えない', async ({ browser }) => {
    // Arrange：JavaScript は有効のまま、読み込みだけを止める（ハイドレーションの前の状態）
    const context = await browser.newContext({ javaScriptEnabled: true });
    const page = await context.newPage();
    await page.route('**/*.js', route => route.abort());

    // Act
    await page.goto(`/en/#pref-${HOKKAIDO}`);

    // Assert：カードの見出しは読める。内容の代わりの文は出さない
    await expect(page.locator('[data-card-ready]')).toHaveCount(0);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-name]`)).toBeVisible();
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-needs-script]`)).toBeHidden();
    await context.close();
  });

  test('/en/#pref-13 を開くと、ハイドレーションの後は状態（固定）で東京都のカードだけが見え、別の県を固定するとその県のカードだけが見える', async ({ page }) => {
    // Arrange・Act：ハッシュで開き、`CardSwitch` のマウント（data-card-ready）を待つ
    await page.goto(`/en/#pref-${TOKYO}`);
    await page.locator('[data-card-ready]').waitFor({ state: 'attached' });

    // Assert：ハッシュの県が固定されている（T3-07）ので、:target の規則ではなく状態で、東京都のカードだけが見える。案内文は出ない
    await expect(page.locator(`[data-card-pref="${TOKYO}"]`)).toBeVisible();
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(1);
    await expect(page.locator('[data-card-guide]')).toBeHidden();

    // Act：さくいんから北海道を固定する
    await page.locator('[data-index-ready]').waitFor({ state: 'attached' });
    await pinFromIndex(page, HOKKAIDO);

    // Assert：状態で選んだカード1枚だけが見える（ハッシュの東京都と2枚同時には見えない）
    await expect(page.locator('[data-card-pref]:visible')).toHaveCount(1);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"]`)).toBeVisible();
    await expect(page.locator('[data-card-guide]')).toBeHidden();
  });
});

test.describe('D38：カードの内容は県ごとの JSON', () => {
  const hokkaido = prefOf(HOKKAIDO);
  const firstSpecialty = hokkaido.specialties[0];
  const descriptions = firstSpecialty?.description;

  /** 固定した県の JSON を待つ（`/cards/{lang}/NN.json`） */
  const cardResponse = (page: Page, lang: string, code: string) => page.waitForResponse(response => new URL(response.url()).pathname === `/cards/${lang}/${code}.json`);

  test('D38：/cards/en/01.json を読み込んでカードの内容を出す（JSON は application/json）', async ({ page }) => {
    // Arrange
    await open(page);

    // Act：固定すると読み込む
    const responsePromise = cardResponse(page, 'en', HOKKAIDO);
    await pinFromIndex(page, HOKKAIDO);
    const response = await responsePromise;

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = (await response.json()) as { code: string; specialties: { name: string }[] };
    expect(body.code).toBe(HOKKAIDO);
    expect(body.specialties.map(item => item.name)).toEqual(hokkaido.specialties.map(item => item.name.en));
    await waitForDetails(page, HOKKAIDO);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties] [data-card-item]`)).toHaveCount(3);
  });

  test('D38：県を選ぶまで /cards/ は読み込まない。準備中の県（沖縄県）は読み込まない', async ({ page }) => {
    // Arrange
    const requested: string[] = [];
    page.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/cards/')) requested.push(pathname);
    });
    await open(page);
    expect(requested).toEqual([]);

    // Act：準備中の県を固定する
    await pinFromIndex(page, OKINAWA);
    await expect(page.locator(`[data-card-pref="${OKINAWA}"] [data-card-coming-soon]`)).toBeVisible();

    // Assert
    expect(requested).toEqual([]);
  });

  test('D38：ホバーでカードを出すときも読み込む（固定しない）', async ({ page, isMobile }) => {
    // Arrange：タッチではホバーしない
    test.skip(isMobile, 'タッチにホバーはない');
    await open(page);

    // Act：さくいんの項目にマウスをのせる（1024px 未満ではさくいんのホバーでカードを変えない。T3-06）
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 0) < 1024, '1024px 未満ではさくいんのホバーでカードを変えない');
    const responsePromise = cardResponse(page, 'en', HOKKAIDO);
    await page.locator(`a[data-pref="${HOKKAIDO}"]`).hover();
    await responsePromise;

    // Assert
    await waitForDetails(page, HOKKAIDO);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties] [data-card-item]`)).toHaveCount(3);
  });

  test('D38：300ms を超える読み込みの間は「読み込み中」を出し、終わったら内容に変わる', async ({ page }) => {
    // Arrange：応答を 800ms 遅らせる
    await page.route('**/cards/en/*.json', async (route: Route) => {
      await new Promise(resolve => setTimeout(resolve, 800));
      await route.continue();
    });
    await open(page);

    // Act
    await pinFromIndex(page, HOKKAIDO);

    // Assert
    const slow = page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="slow"]`);
    await expect(slow).toContainText(getMessages('en').card.loading);
    await waitForDetails(page, HOKKAIDO);
    await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="slow"]`)).toHaveCount(0);
  });

  for (const [name, fail] of [
    ['HTTP のエラー（500）', (route: Route) => route.fulfill({ status: 500, body: 'error' })],
    ['形が不正な JSON', (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: HOKKAIDO, specialties: 1, spots: [] }) })],
    ['別の県の JSON', (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: TOKYO, specialties: [], spots: [] }) })]
  ] as const) {
    test(`D38：読み込みに失敗（${name}）すると文言と「再試行」を出し、再試行で内容が出る`, async ({ page }) => {
      // Arrange：最初の1回だけ失敗させる
      let isFirst = true;
      await page.route('**/cards/en/01.json', route => {
        if (!isFirst) return route.continue();
        isFirst = false;
        return fail(route);
      });
      await open(page);

      // Act
      await pinFromIndex(page, HOKKAIDO);

      // Assert
      const failed = page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="failed"]`);
      await expect(failed).toBeVisible();
      await expect(failed).toContainText(getMessages('en').card.loadFailed.adult);
      await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-item]`)).toHaveCount(0);

      // Act：再試行
      await failed.locator('[data-card-retry]').click();

      // Assert
      await waitForDetails(page, HOKKAIDO);
      await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-specialties] [data-card-item]`)).toHaveCount(3);
      await expect(page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-retry]`)).toHaveCount(0);
    });
  }

  test('D38：オフラインのときは専用の文言と「再試行」を出し、オンラインに戻して再試行すると内容が出る', async ({ page, context }) => {
    // Arrange：ページを開いてからオフラインにする
    await open(page);
    await context.setOffline(true);

    // Act
    await pinFromIndex(page, HOKKAIDO);

    // Assert
    const offline = page.locator(`[data-card-pref="${HOKKAIDO}"] [data-card-details="offline"]`);
    await expect(offline).toContainText(getMessages('en').card.offline.adult);

    // Act：オンラインに戻して再試行
    await context.setOffline(false);
    await offline.locator('[data-card-retry]').click();

    // Assert
    await waitForDetails(page, HOKKAIDO);
  });

  test('D38：2回目以降は読み込み直さない（成功はメモリに残る）', async ({ page }) => {
    // Arrange
    let count = 0;
    await page.route('**/cards/en/01.json', route => {
      count += 1;
      return route.continue();
    });
    await open(page);
    await pinFromIndex(page, HOKKAIDO);
    await waitForDetails(page, HOKKAIDO);

    // Act：別の県に切り替えて戻す
    await pinFromIndex(page, TOKYO);
    await pinFromIndex(page, HOKKAIDO);

    // Assert
    await waitForDetails(page, HOKKAIDO);
    expect(count).toBe(1);
  });

  /** ページの HTML（本体と、末尾の RSC のデータの `<script>` を含む全体）を返す */
  async function htmlOf(request: APIRequestContext, lang: string): Promise<string> {
    return (await request.get(`/${lang}/`)).text();
  }

  test('D38：HTML にカードの解説文・行き方・出典が入らない（どの言語のページにも、どの言語の文も）', async ({ request }) => {
    // Arrange：北海道の最初の名物の解説文（3言語・こども向け・おとな向け）と、行き方の経路・出典の URL
    const sentences = [descriptions?.en.adult, descriptions?.en.kids, descriptions?.ja.adult, descriptions?.ja.kids, descriptions?.zh.adult, descriptions?.zh.kids];
    expect(sentences.every(text => typeof text === 'string' && text !== '')).toBe(true);
    const others = [hokkaido.access?.route.en, hokkaido.access?.route.ja, 'https://example.com/hokkaido/potato'];

    for (const lang of ['ja', 'en', 'zh']) {
      // Act
      const html = await htmlOf(request, lang);

      // Assert
      for (const text of [...sentences, ...others]) expect(html, `${lang} に ${text ?? ''}`).not.toContain(text);
      // 差し込み先は出る（準備中でない北海道だけ）
      expect(html).toContain('data-card-body="01"');
    }
  });

  test('D38：JSON は、その言語の文だけを含む（en にほかの言語の解説文は出ない）。ja はふりがなの記法のまま', async ({ request }) => {
    // Act
    const en = await (await request.get(`/cards/en/${HOKKAIDO}.json`)).text();
    const ja = await (await request.get(`/cards/ja/${HOKKAIDO}.json`)).text();

    // Assert
    expect(en).toContain(descriptions?.en.adult ?? '');
    for (const text of [descriptions?.ja.adult, descriptions?.zh.adult]) expect(en).not.toContain(text ?? '');
    expect(ja).toContain(JSON.stringify(descriptions?.ja.adult ?? '').slice(1, -1));
    expect(ja).toMatch(/\{[^}|]+\|[^}]+\}/u);
  });

  test('D38：範囲外の JSON は 404', async ({ request }) => {
    for (const path of ['/cards/en/00.json', '/cards/en/48.json', '/cards/fr/01.json', '/cards/en/1.json']) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });
});
