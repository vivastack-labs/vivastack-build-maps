import { expect, test, type Page } from '@playwright/test';
import { formatDate } from '../../src/i18n/format';
import { LANGS, langPath, PAGES, type Lang, type SitePage } from '../../src/i18n/lang';
import { getMessages } from '../../src/i18n/messages';
import { plainText } from '../../src/lib/ruby';
import { PRIVACY_REVISED_DATE, SITE_URL } from '../../src/lib/site';
import { GSI_MAPS_URL, N03_SOURCE_URL, SOUMU_CODE_URL } from '../../src/lib/sources';
import { textWithoutRt } from './helpers';

// T4-05：「このサイトについて」（/{lang}/about/）とプライバシーポリシー（/{lang}/privacy/）。本番用のビルド（wrangler dev で dist/ を配信）。
// F-SRC-04・8.3・5.6・F-I18N-03・D8。ページの文の中身は単体テスト（AboutContent・PrivacyContent）が辞書と突き合わせるので、ここでは、実際に配信されたページで、
// フッターからたどれること・出典の文と URL・canonical と hreflang・言語の切替・h1 が1つであることを確かめる。

const SUB_PAGES = PAGES.filter((page): page is Exclude<SitePage, 'home'> => page !== 'home');

const titleOf = (lang: Lang, page: Exclude<SitePage, 'home'>): string => plainText(getMessages(lang)[page].title);

/** ページの h1 が、題名（ふりがなを除く）と同じ */
async function expectTitle(page: Page, expected: string): Promise<void> {
  await expect(page.locator('main h1')).toHaveCount(1);
  expect(await textWithoutRt(page.locator('main h1'))).toBe(expected);
}

/** ハイドレーションが終わってから、トップを開く（終わる前の操作は失われる） */
async function openTop(page: Page, lang: Lang): Promise<void> {
  await page.goto(langPath(lang));
  await page.locator('[data-map-ready]').waitFor({ state: 'attached' });
}

for (const lang of LANGS) {
  test(`F-SRC-04：${lang} のトップのフッターから「このサイトについて」・プライバシーポリシーを開ける`, async ({ page }) => {
    // Arrange
    await openTop(page, lang);
    const footer = page.getByRole('contentinfo');

    // Act・Assert：「このサイトについて」
    await footer.locator('a[data-footer-link="about"]').click();
    await expect(page).toHaveURL(new RegExp(`${langPath(lang, 'about')}$`, 'u'));
    await expectTitle(page, titleOf(lang, 'about'));
    await expect(footer.locator('a[data-footer-link="about"]')).toHaveAttribute('aria-current', 'page');
    await expect(footer.locator('a[data-footer-link="privacy"]')).not.toHaveAttribute('aria-current', 'page');

    // Act・Assert：「プライバシーポリシー」（ここのフッターから）
    await footer.locator('a[data-footer-link="privacy"]').click();
    await expect(page).toHaveURL(new RegExp(`${langPath(lang, 'privacy')}$`, 'u'));
    await expectTitle(page, titleOf(lang, 'privacy'));
    await expect(footer.locator('a[data-footer-link="privacy"]')).toHaveAttribute('aria-current', 'page');

    // Act・Assert：ヘッダーのサイト名からトップへ戻れる
    await page.getByRole('banner').locator('a[data-site-name-link]').click();
    await expect(page).toHaveURL(new RegExp(`${langPath(lang)}$`, 'u'));
    await expect(page.locator('h1')).toHaveCount(1);
  });
}

for (const lang of LANGS) {
  test(`F-SRC-04・8.3：${lang} の「このサイトについて」に、3つの出典の文（国土数値情報・総務省・地理院地図）と AI の明記・境界が暫定の旨がある`, async ({ page }) => {
    // Act
    await page.goto(langPath(lang, 'about'));

    // Assert：文は「前 + URL + 後」。URL はリンクで、別のサイトなので noopener noreferrer
    const { about, footer } = getMessages(lang);
    const sources = [
      ['map', footer.mapSource, N03_SOURCE_URL],
      ['soumu', about.reading.soumu, SOUMU_CODE_URL],
      ['gsi', about.reading.gsi, GSI_MAPS_URL]
    ] as const;
    for (const [key, text, url] of sources) {
      const element = page.locator(`[data-about-source="${key}"]`);
      expect(await textWithoutRt(element)).toBe(plainText(text.before) + url + plainText(text.after));
      const link = element.getByRole('link', { name: url });
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(await textWithoutRt(page.locator('[data-about-section="content"]'))).toContain(plainText(about.content.body));
    expect(await textWithoutRt(page.locator('[data-about-section="boundary"]'))).toContain(plainText(about.boundary.body));
  });

  test(`5.6：${lang} のプライバシーポリシーに、Cloudflare Web Analytics・Cookie を使わないこと・端末への保存・改定日がある`, async ({ page }) => {
    // Act
    await page.goto(langPath(lang, 'privacy'));

    // Assert
    const { privacy } = getMessages(lang);
    await expect(page.locator('[data-privacy-section="analytics"]')).toContainText('Cloudflare Web Analytics');
    expect(await textWithoutRt(page.locator('[data-privacy-section="cookies"]'))).toContain(plainText(privacy.cookies.body));
    await expect(page.locator('[data-privacy-section="storage"] li')).toHaveCount(privacy.storage.items.length);
    await expect(page.locator('[data-privacy-section="storage"]')).toContainText('localStorage');
    await expect(page.locator('[data-privacy-revised]')).toContainText(formatDate(lang, PRIVACY_REVISED_DATE));
  });
}

for (const lang of LANGS) {
  for (const sub of SUB_PAGES) {
    test(`F-I18N-03・D8：${lang} の ${sub} に canonical と hreflang があり、言語の切替は同じページを指す`, async ({ page }) => {
      // Act
      await page.goto(langPath(lang, sub));

      // Assert：<title>・canonical・hreflang（ja・en・zh-Hans・x-default → ja の同じページ）
      await expect(page).toHaveTitle(`${titleOf(lang, sub)} | ${plainText(getMessages(lang).siteName)}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}${langPath(lang, sub)}`);
      const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll(links => links.map(link => [link.getAttribute('hreflang'), link.getAttribute('href')]));
      expect(Object.fromEntries(alternates)).toEqual({
        ja: `${SITE_URL}${langPath('ja', sub)}`,
        en: `${SITE_URL}${langPath('en', sub)}`,
        'zh-Hans': `${SITE_URL}${langPath('zh', sub)}`,
        'x-default': `${SITE_URL}${langPath('ja', sub)}`
      });

      // Assert：言語の切替のリンクは同じページ。今の言語に aria-current
      const switchLinks = page.getByRole('banner').locator('a[data-lang-link]');
      expect(await switchLinks.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(LANGS.map(code => langPath(code, sub)));
      await expect(page.getByRole('banner').locator(`a[data-lang-link="${lang}"]`)).toHaveAttribute('aria-current', 'page');

      // Act・Assert：ほかの言語へ切り替えると、その言語の同じページが開く
      const other = LANGS.find(code => code !== lang) ?? 'ja';
      await page.getByRole('banner').locator(`a[data-lang-link="${other}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${langPath(other, sub)}$`, 'u'));
      await expectTitle(page, titleOf(other, sub));
    });

    test(`4.11.7：${lang} の ${sub} は h1 が1つ（ページの題名）で、ランドマークは header・main・footer の3つ`, async ({ page }) => {
      // Act
      await page.goto(langPath(lang, sub));

      // Assert
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'zh' ? 'zh-Hans' : lang);
    });
  }
}

test('F-MODE-04：ja のページでも、ふりがなの切替が効く（ふりがなを OFF にすると <rt> が見えなくなる）', async ({ page }) => {
  // Arrange
  await page.goto(langPath('ja', 'about'));
  const rt = page.locator('main rt').first();
  await expect(rt).toBeVisible();
  // ハイドレーションが終わってから押す（終わる前の操作は失われる）
  await page.locator('[data-display-toggle][data-display-ready]').waitFor({ state: 'attached' });

  // Act
  await page.getByRole('banner').locator('[data-ruby-button]').click();

  // Assert
  await expect(page.locator('html')).toHaveAttribute('data-ruby', 'off');
  await expect(rt).toBeHidden();
});
