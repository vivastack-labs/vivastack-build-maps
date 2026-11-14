import type { ReactNode } from 'react';
import { FIRST_PREF } from '@/features/map/keyboard';
import { LABEL_FONT_SIZE, loadPrefPaths, type PrefPath } from '@/features/map/prefPaths';
import { OKINAWA_FRAME, VIEWBOX } from '@/features/map/projection';
import { PENDING_FILL_CLASS, PENDING_PATTERN_ID, REGION_FILL_CLASS } from '@/features/map/regions';
import { zoomInvariant } from '@/features/map/zoomInvariant';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { plainText } from '@/lib/ruby';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。名前・地方・「準備中」かどうかを引く。読み込みと絞り込み（`publish`）は呼ぶ側で1回だけ行う */
  readonly prefectures: readonly PublishedPrefecture[];
  /** 地図の層（`<g data-map-layer>`）の最後（県名ラベルの上）に置くもの。最大化した県の市区町村の層（T2-08） */
  readonly children?: ReactNode;
};

/** 海域名の文字の大きさ（viewBox の単位） */
const SEA_LABEL_FONT_SIZE = 24;
/**
 * 県のパスの操作の見た目（D26）。マウスをのせると少し薄く（Tailwind の hover: は (hover: hover) のときだけ効くので、タッチで色が残らない）、
 * 固定中・最大化中は aria-pressed で塗りを変える。状態の属性は `MapInteraction` が書き換える
 */
const PREF_INTERACTION_CLASS = 'cursor-pointer hover:opacity-80 aria-pressed:fill-map-selected';
/**
 * 2.4.7：キーボードのフォーカス（`:focus-visible`）の枠。さくいんと同じ色。SVG の中の outline の太さは viewBox と拡大の倍率で変わるので、
 * 倍率（`--zoom-k`。層に書かれる）で割って、画面の上で一定に近づける（`zoomInvariant` と同じ考え方）
 */
const PREF_FOCUS_CLASS = 'focus-visible:outline-solid focus-visible:outline-[length:calc(4px/var(--zoom-k,1))] focus-visible:outline-slate-900 dark:focus-visible:outline-slate-50';
/** F-MUNI-04：県を最大化している間は、最大化した県以外を薄くする（`MapInteraction` の `group/map` に `data-map-maximized` が付く） */
const PREF_DIMMED_CLASS = 'group-data-[map-maximized]/map:not-data-[state=maximized]:opacity-40';
/** 「準備中」の斜線の間隔・太さ（viewBox の単位。倍率1のとき） */
const PENDING_HATCH_PITCH = 7;
const PENDING_HATCH_STROKE = 2;
/** 県境の線・沖縄の枠の線の太さ（viewBox の単位。倍率1のとき） */
const BORDER_WIDTH = 0.8;
const FRAME_WIDTH = 1.5;
/** 海域名の位置（viewBox の座標。文字の中心） */
const SEA_LABEL_POSITIONS = {
  japanSea: { x: 370, y: 470 },
  pacific: { x: 830, y: 900 }
} as const;
/** 県名ラベルから省く、県の種類の字（都・府・県。中国語は县）。北海道は「道」なので省かない */
const PREF_SUFFIX = /[都府県县]$/u;

/** 県名ラベル。県の種類の字を省いて短くし、文字を大きくする（「青森」「东京」） */
function labelText(name: string): string {
  return plainText(name).replace(PREF_SUFFIX, '');
}

/** 県コードから地図のデータ（パス・ラベルの位置）を引く。ない県は、描かずに止める（ビルドで気付くため） */
function pathOf(paths: ReadonlyMap<string, PrefPath>, code: string): PrefPath {
  const path = paths.get(code);
  if (!path) {
    throw new Error(`県コード ${code} の形が地図のデータ（prefs.topo.json）にありません`);
  }
  return path;
}

/** 「準備中」の斜線の模様（4.11.4）。地と線の色は @theme の変数（ライト・ダーク）。斜線は拡大すると太くなる（地図の絵の一部） */
function PendingPattern() {
  return (
    <defs>
      <pattern id={PENDING_PATTERN_ID} width={PENDING_HATCH_PITCH} height={PENDING_HATCH_PITCH} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={PENDING_HATCH_PITCH} height={PENDING_HATCH_PITCH} className="fill-map-pending" />
        <line x1={0} y1={0} x2={0} y2={PENDING_HATCH_PITCH} strokeWidth={PENDING_HATCH_STROKE} className="stroke-map-pending-stripe" />
      </pattern>
    </defs>
  );
}

/** 県の形（1つのパス）。固定の状態は `aria-pressed` に出すので、サーバーでは `false` で始める（5.2）。`tabIndex` は北海道だけ 0 で、ハイドレーション前から Tab の停止位置が1つになる */
function PrefShape({ lang, prefecture, d }: { readonly lang: Lang; readonly prefecture: PublishedPrefecture; readonly d: string }) {
  const { code, region, name, pending } = prefecture;
  // 4.11.4：準備中の県は、地方の色の代わりに斜線で塗る。斜線は見た目だけの情報なので、読み上げにも「（準備中）」を足す（WCAG 1.3.1）。操作はほかの県と同じ
  const label = pending ? `${plainText(name[lang])}${plainText(getMessages(lang).comingSoon.indexSuffix)}` : plainText(name[lang]);
  return (
    <path
      data-pref={code}
      data-region={region}
      {...(pending ? { 'data-pending': '' } : {})}
      role="button"
      aria-pressed="false"
      aria-label={label}
      tabIndex={code === FIRST_PREF ? 0 : -1}
      d={d}
      className={`${pending ? PENDING_FILL_CLASS : REGION_FILL_CLASS[region]} ${PREF_INTERACTION_CLASS} ${PREF_FOCUS_CLASS} ${PREF_DIMMED_CLASS}`}
    />
  );
}

/**
 * 都道府県の地図（SVG。F-MAP-01〜04・06、D24）。ビルド時に HTML へ出力するので、JavaScript がなくても見える。
 * 色は `app/globals.css` の @theme の変数（ライト・ダーク。D26）。操作は `MapInteraction`（T2-05）、拡大・縮小・移動は `MapZoom`（T2-06。`<g data-map-layer>` を動かす。`<svg>` は touch-action: none で、指の操作をブラウザに取られない。4.11.3）。
 * `<svg>` は親の箱いっぱいに広がる。箱の縦横比は `VIEWBOX` と同じにする（`MapArea`）。
 */
export function JapanMap({ lang, prefectures, children }: Props) {
  const messages = getMessages(lang);
  const pathByCode = new Map(loadPrefPaths().map(path => [path.code, path]));

  return (
    <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="group" aria-label={plainText(messages.map.label)} className="block size-full touch-none">
      <PendingPattern />
      <rect data-map-sea x={0} y={0} width={VIEWBOX.width} height={VIEWBOX.height} className="fill-map-sea" />
      <g data-map-layer>
        <g className="stroke-map-border" style={{ strokeWidth: zoomInvariant(BORDER_WIDTH) }} strokeLinejoin="round">
          {prefectures.map(prefecture => (
            <PrefShape key={prefecture.code} lang={lang} prefecture={prefecture} d={pathOf(pathByCode, prefecture.code).d} />
          ))}
        </g>
        <rect data-okinawa-frame {...OKINAWA_FRAME} fill="none" strokeDasharray="6 4" style={{ strokeWidth: zoomInvariant(FRAME_WIDTH) }} className="stroke-map-frame" />
        {(['japanSea', 'pacific'] as const).map(sea => (
          <text
            key={sea}
            data-sea-label
            {...SEA_LABEL_POSITIONS[sea]}
            style={{ fontSize: zoomInvariant(SEA_LABEL_FONT_SIZE) }}
            textAnchor="middle"
            dominantBaseline="central"
            className="pointer-events-none fill-map-sea-label select-none"
          >
            {plainText(messages.seas[sea])}
          </text>
        ))}
        {/* 5.2：パスの aria-label と重複するので、スクリーンリーダーには読ませない。F-MAP-01：幅820px以下では隠す */}
        <g
          data-pref-labels
          aria-hidden="true"
          className="pointer-events-none fill-map-label select-none max-map-label:hidden"
          style={{ fontSize: zoomInvariant(LABEL_FONT_SIZE[lang]) }}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {prefectures.map(({ code, name }) => {
            const label = pathOf(pathByCode, code).labels[lang];
            return (
              // 最大化した県のラベルは、市区町村のラベルと重なるので隠す（`MapInteraction` が data-state を書く。T2-08）
              <text key={code} data-pref-label={code} x={label.x} y={label.y} className="data-[state=maximized]:hidden">
                {labelText(name[lang])}
              </text>
            );
          })}
        </g>
        {children}
      </g>
    </svg>
  );
}
