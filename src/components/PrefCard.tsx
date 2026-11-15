import { distanceText, LABEL_SEPARATOR } from '@/i18n/cardText';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 絞り込みの後の県（`publish()` の結果。準備中の県は名物・名所・行き方を持たない） */
  readonly prefecture: PublishedPrefecture;
  /** 東京からの距離（km。10km 単位）。東京都は基準の点なので `null`（距離の行を出さない。F-CARD-03） */
  readonly distanceKm: number | null;
};

/**
 * 県のカード（F-CARD-02〜06・08、4.11.4・4.11.7、F-MODE-04）。サーバーコンポーネントで、47県ぶんを `hidden` 付きで HTML に出す（D24、6.6 (2)）。
 * HTML に入れるのは、地方名・県名・県庁所在地・距離・最大化ボタン・「準備中」の文だけ。行き方・名物・名所・出典は、
 * 県ごとの JSON（`/cards/{lang}/NN.json`）から `CardDetails` が、空の差し込み先 `[data-card-body]`・`[data-card-sources-slot]` に描く（T3-09、D38。
 * 上限の量のコンテンツでも最初の読み込みを 5.1 の基準値に収めるため）。出典の差し込み先は最大化ボタンの後に置く（4.11.7）。
 * 表示する県の切り替えと最大化ボタンの文言の切り替えは、`CardSwitch` が属性だけで行う。
 * 本番で内容を出さない県（`pending`）は、差し込み先の代わりに「準備中」の文を出す（4.11.4。JSON は読み込まない）。
 * JavaScript がないとき・読み込めなかったとき（`data-card-ready` がない）は、差し込み先の `[data-card-needs-script]` が見える（`app/globals.css`。5.2）。
 * 最大化ボタンは JavaScript がないと動かないので `hidden` で出し、`CardSwitch` が外す。
 * パネルが一部だけ見える状態（768px 未満。T3-06）で隠す部分（差し込み先・「準備中」の文）には `data-sheet-detail` を付ける
 * （カードの並びは変えず、CSS で隠す）。県名の `<h2>` は `tabIndex={-1}`（パネルを開いたとき、`CardSheet` がフォーカスを移す。4.11.6）。
 * 文字はすべて `RubyText` で描く（`dangerouslySetInnerHTML` は使わない）。
 */
export function PrefCard({ lang, prefecture, distanceKm }: Props) {
  const { code, region, name, capital, pending } = prefecture;
  const messages = getMessages(lang);
  const labels = messages.card;
  return (
    <article id={`pref-${code}`} data-card-pref={code} hidden>
      <p data-card-region className="text-sm">
        <RubyText text={messages.regions[region]} />
      </p>
      <h2 data-card-name tabIndex={-1} className="text-xl font-bold">
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
        <p data-card-coming-soon data-sheet-detail className="mt-3">
          <ModeText text={messages.comingSoon.card} />
        </p>
      ) : (
        <div data-card-body={code} data-sheet-detail>
          <p data-card-needs-script className="mt-3">
            <ModeText text={labels.needsScript} />
          </p>
        </div>
      )}
      <button type="button" data-card-maximize={code} hidden className="mt-3 rounded border border-slate-400 px-3 py-1">
        <span data-label-maximize>
          <RubyText text={labels.maximize} />
        </span>
        <span data-label-restore hidden>
          <RubyText text={labels.restore} />
        </span>
      </button>
      {pending ? null : <div data-card-sources-slot={code} data-sheet-detail />}
    </article>
  );
}
