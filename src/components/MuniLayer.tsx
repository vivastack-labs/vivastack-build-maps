'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { labelScale, muniLabelText, selectLabels, type LabelCandidate, type PlacedLabel } from '@/features/map/labels';
import { applyLabelVisibility } from '@/features/map/mapDom';
import type { MuniLoader } from '@/features/map/muniLoader';
import type { MuniShape } from '@/features/map/muniShapes';
import { MUNI_SHADE_CLASS } from '@/features/map/regions';
import type { Lang } from '@/i18n/lang';
import { useMapState } from './MapStateProvider';
import { useMuniShapes } from './useMuniShapes';

type Props = {
  readonly lang: Lang;
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

/*
 * 拡大しても画面の上の大きさが変わらない長さは、`calc(基準px / var(--zoom-k, 1))`（`JapanMap` と同じ）。style 属性ではなくクラスで書く（5.5・D39）。
 * クラス名は Tailwind が拾えるよう全体を書く。ラベルの 12 は `MUNI_LABEL_FONT_SIZE`（`MuniLayer.test.tsx` が確かめる）。
 * ラベルの文字は、さらに `--map-px`（viewBox の1単位が画面の何 px か。`useLabelScale` が書く）で割り、地図の表示幅にかかわらず画面の上で一定にする（#147）。
 */
/** 市区町村の境界線（0.5）・県の外周の線（1.4）の太さ（viewBox の単位。倍率1のとき） */
const MUNI_BORDER_WIDTH_CLASS = '[stroke-width:calc(0.5px/var(--zoom-k,1))]';
const OUTLINE_WIDTH_CLASS = '[stroke-width:calc(1.4px/var(--zoom-k,1))]';
const MUNI_LABEL_FONT_CLASS = '[font-size:calc(12px/var(--zoom-k,1)/var(--map-px,1))]';
/** 地図の層（`MapZoom` が倍率を書く）の、倍率の属性 */
const ZOOM_SCALE_ATTRIBUTE = 'data-zoom-scale';
/** viewBox の1単位が画面の何 px か（地図の幅 ÷ viewBox の幅）の CSS 変数 */
const MAP_PX_PROPERTY = '--map-px';
/** `--map-px` に書く値の小数の桁数 */
const MAP_PX_DIGITS = 4;

/** ラベルの候補（いちばん大きなポリゴンの外接矩形に入るかで選ぶ） */
function toCandidate({ code, properties, label }: MuniShape, lang: Lang): LabelCandidate {
  return { code, text: muniLabelText(properties, lang), ...label };
}

/** 地図の層の倍率（`data-zoom-scale`）。ないときは 1 */
function currentScale(layer: Element | null): number {
  const k = Number(layer?.getAttribute(ZOOM_SCALE_ATTRIBUTE));
  return Number.isFinite(k) && k > 0 ? k : 1;
}

/** 地図の `<svg>` の幅（画面の px）。分からなければ 0 */
function mapWidth(group: SVGGElement): number {
  return group.ownerSVGElement?.getBoundingClientRect().width ?? 0;
}

/** `--map-px` を書く（前と同じ値なら書かない。ラベルの文字のスタイルを計算し直させない） */
function writeMapPx(group: SVGGElement, width: number): void {
  const value = String(Number(labelScale(1, width).toFixed(MAP_PX_DIGITS)));
  if (group.style.getPropertyValue(MAP_PX_PROPERTY) !== value) group.style.setProperty(MAP_PX_PROPERTY, value);
}

/**
 * 拡大の倍率と地図の表示幅に合わせて、ラベルの文字の大きさ（`--map-px`）を書き、ラベルを出し入れする（F-MUNI-02、#147）。
 * 倍率は祖先の `[data-map-layer]` の `data-zoom-scale`（`MapZoom` は変えない）、表示幅は `<svg>` の幅（`ResizeObserver`。ない環境では最初の幅だけ）を見る。
 * 幅は最初と大きさが変わったときだけ測る（拡大・移動の毎フレームではレイアウトを読まない）。
 * 動きの途中の毎フレームで React を描き直さず、ラベルの `visibility` の属性だけを書く。
 */
function useLabelScale(groupRef: React.RefObject<SVGGElement | null>, labels: readonly PlacedLabel[] | null): void {
  useLayoutEffect(() => {
    const group = groupRef.current;
    const layer = group?.closest('[data-map-layer]') ?? null;
    if (group === null || layer === null) return;
    let width = 0;
    const applyVisibility = () => applyLabelVisibility(group, labelScale(currentScale(layer), width));
    const measure = () => {
      width = mapWidth(group);
      writeMapPx(group, width);
      applyVisibility();
    };
    measure();
    const observer = new MutationObserver(applyVisibility);
    observer.observe(layer, { attributes: true, attributeFilter: [ZOOM_SCALE_ATTRIBUTE] });
    const svg = group.ownerSVGElement;
    const resizeObserver = svg !== null && typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (svg !== null) resizeObserver?.observe(svg);
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, [groupRef, labels]);
}

/**
 * 最大化した県の市区町村の形・県の外周の線・ラベル（T2-08、F-MUNI-01〜04）。地図の層（`<g data-map-layer>`）の最後に置く。
 * 最大化していない・読み込めていないときは何も描かない。県の形（1km の簡略化）は下に残し、所属未定地が穴にならないようにする。
 * スクリーンリーダーには読ませない（フォーカスも当てない。名前はカードの一覧 `MuniList` で確かめる。4.11.6）。
 * 操作は `MapInteraction` が受ける（`data-muni-pref`）。マウスをのせた市区町村の強調は CSS の `hover:`。
 * ラベルは画面の上の大きさを保ち（`--zoom-k`・`--map-px`）、中国語のページは日本語の漢字表記なので `lang="ja"` を付ける（F-I18N-05）。
 */
export function MuniLayer({ lang, loader }: Props) {
  const { state } = useMapState();
  const { status } = useMuniShapes(state.maximized, loader);
  const loaded = status?.kind === 'loaded' ? status.shapes : null;
  const labels = useMemo(
    () =>
      loaded === null
        ? null
        : selectLabels(
            loaded.shapes.map(shape => toCandidate(shape, lang)),
            lang
          ),
    [loaded, lang]
  );
  const groupRef = useRef<SVGGElement>(null);
  useLabelScale(groupRef, labels);

  if (loaded === null || labels === null || state.maximized === null) return null;
  return (
    <g ref={groupRef} data-muni-layer data-muni-pref={state.maximized} aria-hidden="true">
      <g className={`stroke-muni-border ${MUNI_BORDER_WIDTH_CLASS}`} strokeLinejoin="round">
        {loaded.shapes.map(({ code, d, shade }) => (
          <path key={code} data-muni={code} data-shade={shade} d={d} className={MUNI_SHADE_CLASS[shade]} />
        ))}
      </g>
      <path data-muni-outline d={loaded.outline} fill="none" strokeLinejoin="round" className={`pointer-events-none stroke-map-border ${OUTLINE_WIDTH_CLASS}`} />
      <g data-muni-labels className={`pointer-events-none fill-map-label select-none ${MUNI_LABEL_FONT_CLASS}`} textAnchor="middle" dominantBaseline="central">
        {labels.map(({ code, text, x, y, minScale }) => (
          <text key={code} data-muni-label={code} data-min-scale={minScale} lang={lang === 'zh' ? 'ja' : undefined} x={x} y={y}>
            {text}
          </text>
        ))}
      </g>
    </g>
  );
}
