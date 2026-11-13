import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang };

/**
 * ページの上部（4.11.7）。サイト名を h1 で出す。切替のボタンは T3-05・T3-07 で足す。
 * 1ページに h1 は1つなので、ページの中には h1 を置かない。
 */
export function Header({ lang }: Props) {
  return (
    <header className="px-4 py-3">
      <h1 className="text-xl font-bold">
        <RubyText text={getMessages(lang).siteName} />
      </h1>
    </header>
  );
}
