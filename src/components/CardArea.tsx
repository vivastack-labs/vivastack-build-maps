import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang };

/**
 * カードの領域（4.11.7）。県を選ぶ前の案内文を出す仮の表示で、T2-05 でカードに置き換える。
 * 1024px以上では、地図とさくいんの2行ぶんの高さの右の列に置き、スクロールしても見える位置に固定する。
 * こども向け・おとな向けの出し分けは T3-05 まで入れないので、おとな向けの文だけを出す
 * （`ModeText` を今使うと両方が表示され、スクリーンリーダーも両方を読む）。
 */
export function CardArea({ lang }: Props) {
  return (
    <section data-area="card" className="min-w-0 rounded border border-slate-300 p-4 lg:sticky lg:top-4 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
      <p>
        <RubyText text={getMessages(lang).card.guide.adult} />
      </p>
    </section>
  );
}
