import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { Prefecture } from '@/lib/content-schema.generated';
import { PrefIndex } from './PrefIndex';
import { PrefIndexInteraction } from './PrefIndexInteraction';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。県名と地方を出す */
  readonly prefectures: readonly Prefecture[];
};

/**
 * 県名さくいんの領域（4.11.7、F-IDX-01〜03）。見出し（h2）の下に、8地方ごとの県名（`PrefIndex`）を置く。
 * 操作は `PrefIndexInteraction` が地図と同じ状態（`mapReducer`）に結ぶ。`MapStateProvider` の中に置く。
 */
export function IndexArea({ lang, prefectures }: Props) {
  return (
    <section data-area="index" className="min-w-0">
      <h2 className="text-lg font-bold">
        <RubyText text={getMessages(lang).index.heading} />
      </h2>
      <PrefIndexInteraction>
        <PrefIndex lang={lang} prefectures={prefectures} />
      </PrefIndexInteraction>
    </section>
  );
}
