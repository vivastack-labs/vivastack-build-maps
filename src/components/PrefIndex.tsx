import { REGIONS, REGION_SWATCH_CLASS } from '@/features/map/regions';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。県名・地方・「準備中」かどうかを使う */
  readonly prefectures: readonly PublishedPrefecture[];
};

/**
 * 項目（県名）の見た目。固定中は `aria-pressed:` で `--color-map-selected` の背景にし、文字は濃い色にする
 * （背景がライト・ダークのどちらでも 4.5:1 以上）。背景色だけでは白との差が小さい（ライトで約1.7:1。WCAG 1.4.1・1.4.11）ので、
 * 濃い枠（枠は常に `border-2` で、色だけ変える）と下線も付ける。最大化中は、さらに外側に輪（`ring`）を足す。
 * どれも幅・高さを変えない（太字にすると折り返しがずれる）。`select-none` は、ダブルクリックで県名の文字が選択されないため。
 * 押せる大きさは 24px 以上（WCAG 2.5.8）。クラス名は組み立てず全体を書く（D26）。
 */
const ITEM_CLASS = [
  'inline-flex min-h-8 min-w-8 cursor-pointer select-none items-center justify-center rounded border-2 border-map-border px-2 py-1 text-sm hover:underline',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-50',
  'aria-pressed:border-slate-950 aria-pressed:bg-map-selected aria-pressed:text-slate-950 aria-pressed:underline aria-pressed:decoration-2',
  'data-[state=maximized]:ring-2 data-[state=maximized]:ring-slate-950 dark:data-[state=maximized]:ring-slate-50'
].join(' ');

/**
 * 県名さくいん（F-IDX-01〜03、4.11.7）。8地方（`REGIONS` の順）ごとに、見出し（h3）と県名の一覧を出す。サーバーで出力する。
 * 各県名は `<a href="#pref-NN" role="button">`（6.6 (2)）：JavaScript がないときはリンクとして動き、
 * あるときは `PrefIndexInteraction` が地図と同じ操作を結線する。
 * 仕様は「県名ボタン」なので `role="button"`（固定中の `aria-pressed` はリンクには付けられない）。
 * Safari は既定ではリンクに Tab で止まらないので、`tabIndex={0}` を明示する（F-IDX-03）。
 */
export function PrefIndex({ lang, prefectures }: Props) {
  const { regions, comingSoon } = getMessages(lang);
  return (
    <div className="mt-3 grid gap-3">
      {REGIONS.map(region => (
        <div key={region} data-index-region={region}>
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <span data-swatch aria-hidden="true" className={`inline-block size-4 shrink-0 rounded-sm border border-map-border ${REGION_SWATCH_CLASS[region]}`} />
            <RubyText text={regions[region]} />
          </h3>
          <ul className="flex flex-wrap gap-2">
            {prefectures
              .filter(prefecture => prefecture.region === region)
              .map(({ code, name, pending }) => (
                <li key={code}>
                  <a href={`#pref-${code}`} role="button" tabIndex={0} aria-pressed="false" data-pref={code} className={ITEM_CLASS}>
                    <RubyText text={name[lang]} />
                    {/* 4.11.4：準備中の県は県名の後ろに（準備中）。ボタンの名前に含まれるので、スクリーンリーダーにも伝わる */}
                    {pending && (
                      <span data-index-pending>
                        <RubyText text={comingSoon.indexSuffix} />
                      </span>
                    )}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
