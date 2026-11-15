import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { TOKYO_CODE } from '@/lib/distance';
import { CardSwitch } from './CardSwitch';
import { MuniList } from './MuniList';
import { PrefCard } from './PrefCard';
import { ModeText } from './ModeText';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。47県ぶんのカードを出す */
  readonly prefectures: readonly PublishedPrefecture[];
  /** 県コード → 東京からの距離（km。10km 単位。ビルド時に `distancesFromTokyo` で求める。7.5） */
  readonly distances: ReadonlyMap<string, number>;
};

/** 県の距離を引く。ない県は計算の誤りなので例外にする（黙って 0 km と出さない） */
function distanceOf(distances: ReadonlyMap<string, number>, code: string): number {
  const km = distances.get(code);
  if (km === undefined) throw new Error(`県コード ${code} の東京からの距離がありません`);
  return km;
}

/**
 * カードの領域（4.11.7）。県を選ぶ前の案内文（`data-card-guide`）と、47県の本物のカード（`PrefCard`。`hidden` 付き。T3-03）をサーバーで出力し、
 * 表示する県の切り替え（`hidden` を外す）と最大化ボタンは `CardSwitch` が属性だけで行う（T2-05、6.6 (2)）。
 * 東京都は基準の点なので距離を渡さない（`null`。F-CARD-03）。
 * 最大化中の「市区町村の一覧」（`MuniList`。T2-08）は、47枚のカードの中ではなく、カードの下に1つだけ置く
 * （カードの中に置くとクライアントコンポーネントが47個できる）。
 * 並びは「県の見出し・内容 → 最大化ボタン → 出典（`PrefCard` の中。T3-04）→ 市区町村の一覧（最大化中だけ）」（4.11.7）。
 * 1024px以上では、地図とさくいんの2行ぶんの高さの右の列に置き、スクロールしても見える位置に固定する。カードが画面より高いときは、カードの中でスクロールする。
 * 案内文・カードの解説文は `ModeText` でこども向け・おとな向けの両方を出し、片方を CSS で隠す（T3-05。F-MODE-04）。
 * `MapStateProvider` の中に置く。
 */
export function CardArea({ lang, prefectures, distances }: Props) {
  return (
    <section
      data-area="card"
      className="min-w-0 rounded border border-slate-300 p-4 lg:sticky lg:top-4 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto"
    >
      <CardSwitch>
        <p data-card-guide>
          <ModeText text={getMessages(lang).card.guide} />
        </p>
        {prefectures.map(prefecture => (
          <PrefCard key={prefecture.code} lang={lang} prefecture={prefecture} distanceKm={prefecture.code === TOKYO_CODE ? null : distanceOf(distances, prefecture.code)} />
        ))}
      </CardSwitch>
      <MuniList lang={lang} labels={getMessages(lang).muni} />
    </section>
  );
}
