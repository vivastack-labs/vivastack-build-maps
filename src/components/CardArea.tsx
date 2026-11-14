import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { distanceText } from '@/i18n/cardText';
import { TOKYO_CODE } from '@/lib/distance';
import { CardSwitch } from './CardSwitch';
import { MuniList } from './MuniList';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。県名を出す */
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
 * カードの領域（4.11.7）。仮の表示で、T3-03 で本物のカードに置き換える（県名の下の `MuniList`（最大化中の「市区町村の一覧」。T2-08）は残す）。
 * 県を選ぶ前の案内文（`data-card-guide`）と、47県の県名と東京からの距離（`data-card-pref`。`hidden` 付き。距離の行は `data-card-distance`。東京都は基準の点なので出さない。T3-03 の `PrefCard` へそのまま移す。F-CARD-03）をサーバーで出力し、
 * 表示する県の切り替え（`hidden` を外す）は `CardSwitch` が属性だけで行う（T2-05、6.6 (2)）。
 * 1024px以上では、地図とさくいんの2行ぶんの高さの右の列に置き、スクロールしても見える位置に固定する。
 * こども向け・おとな向けの出し分けは T3-05 まで入れないので、おとな向けの文だけを出す
 * （`ModeText` を今使うと両方が表示され、スクリーンリーダーも両方を読む）。
 * `MapStateProvider` の中に置く。
 */
export function CardArea({ lang, prefectures, distances }: Props) {
  return (
    <section data-area="card" className="min-w-0 rounded border border-slate-300 p-4 lg:sticky lg:top-4 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
      <CardSwitch>
        <p data-card-guide>
          <RubyText text={getMessages(lang).card.guide.adult} />
        </p>
        {prefectures.map(({ code, name }) => (
          <div key={code} data-card-pref={code} hidden>
            <p data-card-name>
              <RubyText text={name[lang]} />
            </p>
            {code !== TOKYO_CODE && (
              <p data-card-distance>
                <RubyText text={distanceText(lang, distanceOf(distances, code))} />
              </p>
            )}
          </div>
        ))}
      </CardSwitch>
      <MuniList lang={lang} labels={getMessages(lang).muni} />
    </section>
  );
}
