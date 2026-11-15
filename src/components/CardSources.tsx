import type { CardData, CardSource } from '@/features/card/cardData';
import type { CardDetailLabels } from '@/i18n/cardText';
import { RubyText } from './RubyText';

type Props = {
  /** 読み込んだカードの内容（`validateCardData` を通ったもの） */
  readonly data: CardData;
  /** 項目名・「出典なし」などの文言（`cardDetailLabels`） */
  readonly labels: CardDetailLabels;
};

/** 出典欄の1項目（行き方・名物・名所）。`key` は `data-source-item` に書く値、`name` は見出しの文（ふりがなの記法つき） */
type Entry = { readonly key: string; readonly name: string; readonly sources: readonly CardSource[] };

/** 行き方・名物・名所の順に、出典欄の項目にする（4.11.7、F-SRC-02） */
function entriesOf({ access, specialties, spots }: CardData, labels: CardDetailLabels): readonly Entry[] {
  return [
    ...(access === undefined ? [] : [{ key: 'access', name: labels.access, sources: access.sources }]),
    ...specialties.map(item => ({ key: `specialties/${item.id}`, name: item.name, sources: item.sources })),
    ...spots.map(item => ({ key: `spots/${item.id}`, name: item.name, sources: item.sources }))
  ];
}

/** 出典1件：タイトルのリンク、URL の文字、確認日（F-SRC-02）。外部のサイトは新しいタブで開く（選んだ県の状態を保つため）。タイトルのふりがなは JSON を作るときに ja 以外は除いてある */
function SourceItem({ source, labels }: { readonly source: CardSource; readonly labels: CardDetailLabels }) {
  return (
    <li data-source className="break-words">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
        <RubyText text={source.title} />
      </a>{' '}
      <span data-source-url className="text-xs">
        {source.url}
      </span>{' '}
      <span data-source-accessed className="text-xs">
        <RubyText text={labels.accessed} />
        {source.accessedText}
      </span>
    </li>
  );
}

/**
 * カードの「出典」欄（F-SRC-01〜03、4.11.7）。JSON から読み込んだ `CardData` を描く（T3-09、D38）。閉じた `<details>` で、行き方・名物・名所の項目ごとに出典を並べる。
 * `sources: []` の項目は「出典なし」と出す（F-SRC-03）。出す項目が1つもない県（プレビューの未作成）は何も出さない。フックを使わない。
 * `href` は読み込むときに `validateCardData` が http(s) だけに絞っている。
 */
export function CardSources({ data, labels }: Props) {
  const entries = entriesOf(data, labels);
  if (entries.length === 0) return null;
  return (
    <details data-card-sources className="mt-3">
      <summary className="cursor-pointer font-bold">
        <RubyText text={labels.sources} />
      </summary>
      <ul className="mt-1 space-y-2">
        {entries.map(entry => (
          <li key={entry.key} data-source-item={entry.key}>
            <p data-source-item-name className="font-bold">
              <RubyText text={entry.name} />
            </p>
            {entry.sources.length === 0 ? (
              <p data-source-none>
                <RubyText text={labels.noSource} />
              </p>
            ) : (
              <ul className="ml-4 list-disc">
                {entry.sources.map((source, i) => (
                  <SourceItem key={`${i}-${source.url}`} source={source} labels={labels} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
