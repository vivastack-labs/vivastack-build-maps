import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang };

/** 県名さくいんの領域（4.11.7）。見出しだけの仮の表示で、中身は T2-10 で入れる。 */
export function IndexArea({ lang }: Props) {
  return (
    <section data-area="index" className="min-w-0">
      <h2 className="text-lg font-bold">
        <RubyText text={getMessages(lang).index.heading} />
      </h2>
    </section>
  );
}
