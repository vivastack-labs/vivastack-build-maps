import { langPath, type Lang, type SitePage } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { DisplayToggle } from './DisplayToggle';
import { LangSwitch } from './LangSwitch';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang; readonly page?: SitePage };

/**
 * ページの上部（4.11.7）。モード・ふりがなの切替のボタン（T3-05）と、言語の切替（T3-07）を置く。
 * 1ページに h1 は1つ：トップではサイト名を h1 で出す。ほかのページ（`page` が `about`・`privacy`。T4-05）では、
 * サイト名をトップへのリンク（`<p>` の中の `<a>`）にして、ページの題名を `<main>` の中の h1 にする（ページの中身が持つ）。
 * 言語の切替は `page` を受け取り、同じページのほかの言語を指す。
 * `Header` はサーバーコンポーネントのまま、ボタン（クライアント）には文言だけを渡す。
 */
export function Header({ lang, page = 'home' }: Props) {
  const messages = getMessages(lang);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      {page === 'home' ? (
        <h1 className="text-xl font-bold">
          <RubyText text={messages.siteName} />
        </h1>
      ) : (
        <p className="text-xl font-bold">
          <a href={langPath(lang)} data-site-name-link className="inline-flex min-h-11 items-center underline">
            <RubyText text={messages.siteName} />
          </a>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DisplayToggle lang={lang} labels={messages.display} />
        <LangSwitch lang={lang} page={page} />
      </div>
    </header>
  );
}
