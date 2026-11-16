'use client';

import type { MuniLoader } from '@/features/map/muniLoader';
import { fillCount } from '@/i18n/format';
import type { Lang } from '@/i18n/lang';
import type { Messages } from '@/i18n/messages';
import { useMapState } from './MapStateProvider';
import { RubyText } from './RubyText';
import { useMuniShapes } from './useMuniShapes';

type Props = {
  readonly lang: Lang;
  /** 文言（辞書の `muni`） */
  readonly labels: Messages['muni'];
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

/**
 * カードの「市区町村の一覧」（T2-08、4.11.6、F-I18N-05）。最大化中で、市区町村を読み込めたときだけ `<details>` を出す。
 * 地図の市区町村はスクリーンリーダーに読ませないので、名前を確かめる手段としてすべての市区町村を `code` の順に並べる。
 * パネルが一部だけ見える状態（768px 未満。T3-06）では、`data-sheet-detail` で隠す。
 * 見出しの件数は、辞書の `muni.listSummary` の `%n` に入れる（括弧は言語ごとに辞書に書く）。
 * 名前は、日本語・中国語のページは日本語の漢字表記（中国語のページは `lang="ja"`）、英語のページはローマ字。React のテキストとして出す。
 */
export function MuniList({ lang, labels, loader }: Props) {
  const { state } = useMapState();
  const { status } = useMuniShapes(state.maximized, loader);
  if (status?.kind !== 'loaded') return null;
  const { shapes } = status.shapes;
  return (
    <details data-muni-list data-sheet-detail className="mt-3">
      <summary className="cursor-pointer">
        <RubyText text={fillCount(lang, labels.listSummary, shapes.length)} />
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {shapes.map(({ code, properties }) => (
          <li key={code} data-muni-item={code} lang={lang === 'zh' ? 'ja' : undefined} className="break-words">
            {lang === 'en' ? properties.name.en : properties.name.ja}
          </li>
        ))}
      </ul>
    </details>
  );
}
