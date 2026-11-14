'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { MUNI_LABEL_FONT_SIZE, muniLabelText, selectLabels, type LabelCandidate, type PlacedLabel } from '@/features/map/labels';
import { applyLabelVisibility } from '@/features/map/mapDom';
import type { MuniLoader } from '@/features/map/muniLoader';
import type { MuniShape } from '@/features/map/muniShapes';
import { MUNI_SHADE_CLASS } from '@/features/map/regions';
import { zoomInvariant } from '@/features/map/zoomInvariant';
import type { Lang } from '@/i18n/lang';
import { useMapState } from './MapStateProvider';
import { useMuniShapes } from './useMuniShapes';

type Props = {
  readonly lang: Lang;
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

/** 市区町村の境界線・県の外周の線の太さ（viewBox の単位。倍率1のとき） */
const MUNI_BORDER_WIDTH = 0.5;
const OUTLINE_WIDTH = 1.4;
/** 地図の層（`MapZoom` が倍率を書く）の、倍率の属性 */
const ZOOM_SCALE_ATTRIBUTE = 'data-zoom-scale';

/** ラベルの候補（いちばん大きなポリゴンの外接矩形に入るかで選ぶ） */
function toCandidate({ code, properties, label }: MuniShape, lang: Lang): LabelCandidate {
  return { code, text: muniLabelText(properties, lang), ...label };
}

/** 地図の層の倍率（`data-zoom-scale`）。ないときは 1 */
function currentScale(layer: Element | null): number {
  const k = Number(layer?.getAttribute(ZOOM_SCALE_ATTRIBUTE));
  return Number.isFinite(k) && k > 0 ? k : 1;
}

/**
 * 倍率に合わせてラベルを出し入れする。倍率は祖先の `[data-map-layer]` の `data-zoom-scale` を見る（`MapZoom` は変えない）。
 * 動きの途中の毎フレームで React を描き直さず、ラベルの `visibility` の属性だけを書く。
 */
function useLabelVisibility(groupRef: React.RefObject<SVGGElement | null>, labels: readonly PlacedLabel[] | null): void {
  useLayoutEffect(() => {
    const group = groupRef.current;
    const layer = group?.closest('[data-map-layer]') ?? null;
    if (group === null || layer === null) return;
    const apply = () => applyLabelVisibility(group, currentScale(layer));
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(layer, { attributes: true, attributeFilter: [ZOOM_SCALE_ATTRIBUTE] });
    return () => observer.disconnect();
  }, [groupRef, labels]);
}

/**
 * 最大化した県の市区町村の形・県の外周の線・ラベル（T2-08、F-MUNI-01〜04）。地図の層（`<g data-map-layer>`）の最後に置く。
 * 最大化していない・読み込めていないときは何も描かない。県の形（1km の簡略化）は下に残し、所属未定地が穴にならないようにする。
 * スクリーンリーダーには読ませない（フォーカスも当てない。名前はカードの一覧 `MuniList` で確かめる。4.11.6）。
 * 操作は `MapInteraction` が受ける（`data-muni-pref`）。マウスをのせた市区町村の強調は CSS の `hover:`。
 * ラベルは画面の上の大きさを保ち（`--zoom-k`）、中国語のページは日本語の漢字表記なので `lang="ja"` を付ける（F-I18N-05）。
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
  useLabelVisibility(groupRef, labels);

  if (loaded === null || labels === null || state.maximized === null) return null;
  return (
    <g ref={groupRef} data-muni-layer data-muni-pref={state.maximized} aria-hidden="true">
      <g className="stroke-muni-border" style={{ strokeWidth: zoomInvariant(MUNI_BORDER_WIDTH) }} strokeLinejoin="round">
        {loaded.shapes.map(({ code, d, shade }) => (
          <path key={code} data-muni={code} data-shade={shade} d={d} className={MUNI_SHADE_CLASS[shade]} />
        ))}
      </g>
      <path data-muni-outline d={loaded.outline} fill="none" strokeLinejoin="round" className="pointer-events-none stroke-map-border" style={{ strokeWidth: zoomInvariant(OUTLINE_WIDTH) }} />
      <g
        data-muni-labels
        className="pointer-events-none fill-map-label select-none max-map-label:hidden"
        style={{ fontSize: zoomInvariant(MUNI_LABEL_FONT_SIZE) }}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {labels.map(({ code, text, x, y, minScale }) => (
          <text key={code} data-muni-label={code} data-min-scale={minScale} lang={lang === 'zh' ? 'ja' : undefined} x={x} y={y}>
            {text}
          </text>
        ))}
      </g>
    </g>
  );
}
