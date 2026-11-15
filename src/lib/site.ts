import { LANGS, htmlLang, type Lang } from '@/i18n/lang';

/** サイトの絶対 URL（D8・D35。末尾にスラッシュを付けない）。`canonical`・`hreflang` に使う。プレビュー用のビルドも同じ（`noindex` が付く） */
export const SITE_URL = 'https://maps.vivastack-dev.workers.dev';

/** `x-default`（言語を決められない人向け）のページの言語 */
const DEFAULT_LANG: Lang = 'ja';

/** 言語のページの絶対 URL */
function pageUrl(lang: Lang): string {
  return `${SITE_URL}/${lang}/`;
}

/**
 * `<head>` の `canonical`（そのページの URL）と `hreflang`（ja・en・zh-Hans・x-default → ja）の URL（F-I18N-03、D8）。
 * `app/[lang]/layout.tsx` の `generateMetadata` の `alternates` にそのまま渡す。
 */
export function alternateUrls(lang: Lang): { readonly canonical: string; readonly languages: Readonly<Record<string, string>> } {
  const languages: Record<string, string> = Object.fromEntries(LANGS.map(code => [htmlLang(code), pageUrl(code)]));
  languages['x-default'] = pageUrl(DEFAULT_LANG);
  return { canonical: pageUrl(lang), languages };
}
