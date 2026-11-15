import { formatDate } from '@/i18n/format';
import { LABEL_SEPARATOR } from '@/i18n/cardText';
import type { Lang } from '@/i18n/lang';
import { getMessages, type Messages } from '@/i18n/messages';
import type { Source, Specialty, Spot } from '@/lib/content-schema.generated';
import type { Access } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 東京からの行き方（ない県もある） */
  readonly access: Pick<Access, 'sources'> | undefined;
  readonly specialties: readonly Pick<Specialty, 'id' | 'name' | 'sources'>[];
  readonly spots: readonly Pick<Spot, 'id' | 'name' | 'sources'>[];
};

/** 出典欄の1項目（行き方・名物・名所）。`key` は `data-source-item` に書く値、`name` は見出しの文（ふりがなの記法つき） */
type Entry = { readonly key: string; readonly name: string; readonly sources: readonly Source[] };

/** 行き方・名物・名所の順に、出典欄の項目にする（4.11.7、F-SRC-02） */
function entriesOf(lang: Lang, labels: Messages['card'], { access, specialties, spots }: Pick<Props, 'access' | 'specialties' | 'spots'>): readonly Entry[] {
  return [
    ...(access === undefined ? [] : [{ key: 'access', name: labels.access, sources: access.sources }]),
    ...specialties.map(item => ({ key: `specialties/${item.id}`, name: item.name[lang], sources: item.sources })),
    ...spots.map(item => ({ key: `spots/${item.id}`, name: item.name[lang], sources: item.sources }))
  ];
}

/** 出典1件：タイトルのリンク、URL の文字、確認日（F-SRC-02）。タイトルのふりがなは日本語のページだけに出す（ほかの言語の文は記法を使わない）。外部のサイトは新しいタブで開く（選んだ県の状態を保つため） */
function SourceItem({ lang, source, labels }: { readonly lang: Lang; readonly source: Source; readonly labels: Messages['card'] }) {
  return (
    <li data-source className="break-words">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
        <RubyText text={lang === 'ja' ? source.title : plainText(source.title)} />
      </a>{' '}
      <span data-source-url className="text-xs">
        {source.url}
      </span>{' '}
      <span data-source-accessed className="text-xs">
        <RubyText text={labels.accessed + LABEL_SEPARATOR[lang]} />
        {formatDate(lang, source.accessed)}
      </span>
    </li>
  );
}

/**
 * カードの「出典」欄（F-SRC-01〜03、4.11.7）。閉じた `<details>` で、行き方・名物・名所の項目ごとに出典を並べる。
 * `sources: []` の項目は「出典なし」と出す（F-SRC-03）。出す項目が1つもない県（「準備中」・プレビューの未作成）は何も出さない。
 * 確認日は `formatDate` で言語の書式にする（形が誤っていればビルドを止める）。フックを使わないサーバーコンポーネント。
 */
export function SourceList({ lang, access, specialties, spots }: Props) {
  const labels = getMessages(lang).card;
  const entries = entriesOf(lang, labels, { access, specialties, spots });
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
                  <SourceItem key={`${i}-${source.url}`} lang={lang} source={source} labels={labels} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
