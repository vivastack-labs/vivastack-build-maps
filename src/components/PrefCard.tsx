import { distanceText, durationText } from '@/i18n/cardText';
import type { Lang } from '@/i18n/lang';
import { getMessages, type Messages } from '@/i18n/messages';
import type { Access, Drafted, PublishedPrefecture } from '@/lib/publish';
import type { Specialty, Spot } from '@/lib/content-schema.generated';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 絞り込みの後の県（`publish()` の結果。準備中の県は名物・名所・行き方を持たない） */
  readonly prefecture: PublishedPrefecture;
  /** 東京からの距離（km。10km 単位）。東京都は基準の点なので `null`（距離の行を出さない。F-CARD-03） */
  readonly distanceKm: number | null;
};

/** 見出しの項目名と、その値の間の区切り */
const LABEL_SEPARATOR: Readonly<Record<Lang, string>> = { ja: '：', en: ': ', zh: '：' };

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
function AccessSection({ lang, access, labels }: { readonly lang: Lang; readonly access: Drafted<Access>; readonly labels: Messages['card'] }) {
  return (
    <section data-card-access className="mt-3">
      <h3 className="font-bold">
        <RubyText text={labels.access} />
        {access.draft && <DraftMark label={labels.draft} />}
      </h3>
      <p>
        <Emoji emoji={access.emoji} />
        <RubyText text={access.mode[lang]} /> <RubyText text={access.route[lang]} />
      </p>
      <p data-card-duration>
        <RubyText text={labels.durationLabel + LABEL_SEPARATOR[lang]} />
        <RubyText text={durationText(lang, access.durationMin)} />
      </p>
    </section>
  );
}

/** 名物・名所の一覧（F-CARD-05・06）。解説文はこども向け・おとな向けの両方を出す（F-MODE-04。見せる方の切り替えは T3-05） */
function ItemList({ lang, items, labels }: { readonly lang: Lang; readonly items: readonly Drafted<Specialty | Spot>[]; readonly labels: Messages['card'] }) {
  return (
    <ul className="mt-1 space-y-2">
      {items.map(item => (
        <li key={item.id} data-card-item={item.id}>
          {item.emoji !== undefined && <Emoji emoji={item.emoji} />}
          <strong>
            <RubyText text={item.name[lang]} />
          </strong>
          {item.draft && <DraftMark label={labels.draft} />}
          <p>
            <ModeText text={item.description[lang]} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 名物・名所の節（見出しと一覧） */
function ItemSection({
  lang,
  kind,
  items,
  labels
}: {
  readonly lang: Lang;
  readonly kind: 'specialties' | 'spots';
  readonly items: readonly Drafted<Specialty | Spot>[];
  readonly labels: Messages['card'];
}) {
  return (
    <section {...(kind === 'specialties' ? { 'data-card-specialties': '' } : { 'data-card-spots': '' })} className="mt-3">
      <h3 className="font-bold">
        <RubyText text={labels[kind]} />
      </h3>
      <ItemList lang={lang} items={items} labels={labels} />
    </section>
  );
}

/**
 * 県のカード（F-CARD-02〜06・08、4.11.4・4.11.7、F-MODE-04）。サーバーコンポーネントで、47県ぶんを `hidden` 付きで HTML に出す（D24、6.6 (2)）。
 * 表示する県の切り替えと最大化ボタンの文言の切り替えは、`CardSwitch` が属性だけで行う。
 * 本番で内容を出さない県（`pending`）は、行き方・名物・名所の代わりに「準備中」の文を出す（4.11.4）。
 * 最大化ボタンは JavaScript がないと動かないので `hidden` で出し、`CardSwitch` が外す。
 * 文字はすべて `RubyText` で描く（`dangerouslySetInnerHTML` は使わない）。
 */
export function PrefCard({ lang, prefecture, distanceKm }: Props) {
  const { code, region, name, capital, access, specialties, spots, pending } = prefecture;
  const messages = getMessages(lang);
  const labels = messages.card;
  return (
    <article id={`pref-${code}`} data-card-pref={code} hidden>
      <p data-card-region className="text-sm">
        <RubyText text={messages.regions[region]} />
      </p>
      <h2 data-card-name className="text-xl font-bold">
        <RubyText text={name[lang]} />
      </h2>
      <p data-card-capital>
        <RubyText text={labels.capital + LABEL_SEPARATOR[lang]} />
        <RubyText text={capital.name[lang]} />
      </p>
      {distanceKm !== null && (
        <p data-card-distance>
          <RubyText text={distanceText(lang, distanceKm)} />
        </p>
      )}
      {pending ? (
        <p data-card-coming-soon className="mt-3">
          <ModeText text={messages.comingSoon.card} />
        </p>
      ) : (
        <>
          {access !== undefined && <AccessSection lang={lang} access={access} labels={labels} />}
          {/* プレビューでは、未作成の県（名物・名所が空）も「準備中」にならない。空の見出しと一覧は出さない */}
          {specialties.length > 0 && <ItemSection lang={lang} kind="specialties" items={specialties} labels={labels} />}
          {spots.length > 0 && <ItemSection lang={lang} kind="spots" items={spots} labels={labels} />}
        </>
      )}
      <button type="button" data-card-maximize={code} hidden className="mt-3 rounded border border-slate-400 px-3 py-1">
        <span data-label-maximize>
          <RubyText text={labels.maximize} />
        </span>
        <span data-label-restore hidden>
          <RubyText text={labels.restore} />
        </span>
      </button>
    </article>
  );
}
