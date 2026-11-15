import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { DisplayToggle } from './DisplayToggle';
import { LangSwitch } from './LangSwitch';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang };

/**
 * ページの上部（4.11.7）。サイト名を h1 で出し、横（狭い画面では下）にモード・ふりがなの切替のボタンを置く（T3-05）。言語の切替（T3-07）は、ボタンの横に置く。
 * 1ページに h1 は1つなので、ページの中には h1 を置かない。
 * `Header` はサーバーコンポーネントのまま、ボタン（クライアント）には文言だけを渡す。
 */
export function Header({ lang }: Props) {
  const messages = getMessages(lang);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <h1 className="text-xl font-bold">
        <RubyText text={messages.siteName} />
      </h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DisplayToggle lang={lang} labels={messages.display} />
        <LangSwitch lang={lang} />
      </div>
    </header>
  );
}
