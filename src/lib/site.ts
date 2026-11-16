import { LANGS, htmlLang, langPath, type Lang, type SitePage } from '@/i18n/lang';

/** サイトの絶対 URL（D8・D35。末尾にスラッシュを付けない）。`canonical`・`hreflang` に使う。プレビュー用のビルドも同じ（`noindex` が付く） */
export const SITE_URL = 'https://maps.vivastack-dev.workers.dev';

/** `x-default`（言語を決められない人向け）のページの言語 */
const DEFAULT_LANG: Lang = 'ja';

/** 言語のページの絶対 URL */
function pageUrl(lang: Lang, page: SitePage): string {
  return `${SITE_URL}${langPath(lang, page)}`;
}

/**
 * `<head>` の `canonical`（そのページの URL）と `hreflang`（ja・en・zh-Hans・x-default → ja）の URL（F-I18N-03、D8）。
 * 各ページの `generateMetadata` の `alternates` にそのまま渡す（`page` を省くとトップ。T4-05 で、「このサイトについて」・プライバシーポリシーは同じページの3言語を指す）。
 */
export function alternateUrls(lang: Lang, page: SitePage = 'home'): { readonly canonical: string; readonly languages: Readonly<Record<string, string>> } {
  const languages = Object.fromEntries([...LANGS.map(code => [htmlLang(code), pageUrl(code, page)]), ['x-default', pageUrl(DEFAULT_LANG, page)]]);
  return { canonical: pageUrl(lang, page), languages };
}
