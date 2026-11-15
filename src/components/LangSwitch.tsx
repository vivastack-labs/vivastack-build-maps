import { LANGS, htmlLang, LANG_NAMES, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';

type Props = { readonly lang: Lang };

const LINK_CLASS = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-400 px-3 py-1 text-sm aria-[current=page]:bg-map-selected aria-[current=page]:text-slate-950';

/**
 * 言語の切替（F-I18N-03、4.11.7）。3言語のページ（`/ja/`・`/en/`・`/zh/`）へのリンクで、今の言語に `aria-current="page"` を付ける。
 * ふつうの `<a>` にする（`next/link` は使わない）：ソフトナビゲーションでは React が `<html data-mode data-ruby>` を新しい言語の既定値に書き戻し、
 * 保存したモード・ふりがなが消える（T3-05）。言語ごとに別の静的なページなので、全体の読み込みでよい。
 * 言語の名前はその言語で書く（`LANG_NAMES`）。`lang` を付けて、読み上げも正しい言語で読む。
 * ランドマークは `header`・`main`・`footer` の3つだけにするので、`<nav>` は使わない（AGENTS.md）。
 * 固定している県を引き継ぐハッシュは、JavaScript があるときだけ `HashSync` が `href` に足す。
 */
export function LangSwitch({ lang }: Props) {
  return (
    <ul data-lang-switch aria-label={plainText(getMessages(lang).langSwitch.label)} className="flex flex-wrap items-center gap-2">
      {LANGS.map(code => (
        <li key={code}>
          <a href={`/${code}/`} data-lang-link={code} hrefLang={htmlLang(code)} lang={htmlLang(code)} aria-current={code === lang ? 'page' : undefined} className={LINK_CLASS}>
            {LANG_NAMES[code]}
          </a>
        </li>
      ))}
    </ul>
  );
}
