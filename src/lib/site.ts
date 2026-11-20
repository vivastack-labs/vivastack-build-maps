import { LANGS, htmlLang, langPath, type Lang, type SitePage } from '@/i18n/lang';

/** サイトの絶対 URL（D8・D35。末尾にスラッシュを付けない）。`canonical`・`hreflang` に使う。プレビュー用のビルドも同じ（`noindex` が付く） */
export const SITE_URL = 'https://maps.vivastack-dev.workers.dev';

/** プライバシーポリシーの改定日（`YYYY-MM-DD`。言語の書式にして出す）。内容を変えたら更新する（T4-05） */
export const PRIVACY_REVISED_DATE = '2026-11-20';

/** 運営者 VivaStack の GitHub プロフィール（5.6、T6-02） */
export const OPERATOR_PROFILE_URL = 'https://github.com/vivastack';

/** 誤記や不具合を受け付けるプロジェクトの公開窓口（5.6、T6-02） */
export const PROJECT_ISSUES_URL = 'https://github.com/vivastack-labs/vivastack-build-maps/issues';

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
