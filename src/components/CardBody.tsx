import type { CardData, CardItem } from '@/features/card/cardData';
import type { CardDetailLabels } from '@/i18n/cardText';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';

type Props = {
  /** 読み込んだカードの内容（`validateCardData` を通ったもの） */
  readonly data: CardData;
  /** 項目名・「下書き」の文言（`cardDetailLabels`） */
  readonly labels: CardDetailLabels;
};

/** 「下書き」の印（プレビューのときだけ、`reviewed` でない項目に付く。7.1） */
function DraftMark({ label }: { readonly label: string }) {
  return (
    <span data-card-draft className="ml-1 rounded bg-amber-200 px-1 text-xs font-normal text-amber-950">
      <RubyText text={label} />
    </span>
  );
}

/** 絵文字（飾りなので、スクリーンリーダーには読ませない） */
function Emoji({ emoji }: { readonly emoji: string }) {
  return (
    <span data-card-emoji aria-hidden="true" className="mr-1">
      {emoji}
    </span>
  );
}

/** 東京からの行き方（F-CARD-04）。所要時間は目安であることを項目名に書く */
function AccessSection({ access, labels }: { readonly access: NonNullable<CardData['access']>; readonly labels: CardDetailLabels }) {
  return (
    <section data-card-access className="mt-3">
      <h3 className="font-bold">
        <RubyText text={labels.access} />
        {access.draft && <DraftMark label={labels.draft} />}
      </h3>
      <p className="break-words">
        <Emoji emoji={access.emoji} />
        <RubyText text={access.mode} /> <RubyText text={access.route} />
      </p>
      <p data-card-duration className="break-words">
        <RubyText text={labels.durationLabel} />
        <RubyText text={access.durationText} />
      </p>
    </section>
  );
}

/** 名物・名所の一覧（F-CARD-05・06）。解説文はこども向け・おとな向けの両方を出す（F-MODE-04。見せる方は CSS で切り替える。T3-05） */
function ItemList({ items, labels }: { readonly items: readonly CardItem[]; readonly labels: CardDetailLabels }) {
  return (
    <ul className="mt-1 space-y-2">
      {items.map(item => (
        <li key={item.id} data-card-item={item.id} className="break-words">
          {item.emoji !== undefined && <Emoji emoji={item.emoji} />}
          <strong>
            <RubyText text={item.name} />
          </strong>
          {item.draft && <DraftMark label={labels.draft} />}
          <p>
            <ModeText text={item.description} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 名物・名所の節（見出しと一覧） */
function ItemSection({ kind, items, labels }: { readonly kind: 'specialties' | 'spots'; readonly items: readonly CardItem[]; readonly labels: CardDetailLabels }) {
  return (
    <section {...(kind === 'specialties' ? { 'data-card-specialties': '' } : { 'data-card-spots': '' })} className="mt-3">
      <h3 className="font-bold">
        <RubyText text={labels[kind]} />
      </h3>
      <ItemList items={items} labels={labels} />
    </section>
  );
}

/**
 * カードの内容（行き方・名物・名所。F-CARD-04〜06、F-MODE-04）。JSON から読み込んだ `CardData` を描く（T3-09、D38）。
 * 空の見出しと一覧は出さない（プレビューの未作成の県）。文字はすべて `RubyText` で描く（`dangerouslySetInnerHTML` は使わない）。
 * 記法に誤りがあれば `RubyText` が例外にする。フックを使わない。
 */
export function CardBody({ data, labels }: Props) {
  const { access, specialties, spots } = data;
  return (
    <>
      {access !== undefined && <AccessSection access={access} labels={labels} />}
      {specialties.length > 0 && <ItemSection kind="specialties" items={specialties} labels={labels} />}
      {spots.length > 0 && <ItemSection kind="spots" items={spots} labels={labels} />}
    </>
  );
}
