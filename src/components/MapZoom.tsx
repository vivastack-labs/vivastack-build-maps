'use client';

import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as createZoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { VIEWBOX } from '@/features/map/projection';
import type { PrefCode } from '@/features/map/state';
import {
  BASE_SCALE_EXTENT,
  clampScale,
  constrainTransform,
  FIT_PADDING,
  fitTransform,
  panExtent,
  scaleExtent,
  stepScale,
  zoomAbout,
  ZOOM_DURATION_MS,
  type Bounds,
  type ZoomTransform
} from '@/features/map/viewport';
import type { Messages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { useMapState } from './MapStateProvider';
import { RubyText } from './RubyText';

/**
 * キーボードの `+` `-` `0` から呼ぶ、拡大・縮小・全体表示（F-KB-04）。ボタンと同じ関数なので、動きを減らす設定と、
 * 動きの途中の「＋」の目標の倍率の扱いもボタンと同じになる。
 */
export type MapZoomControls = {
  /** 「＋」（1）・「−」（-1）1回分 */
  readonly step: (direction: 1 | -1) => void;
  /** 「全体」。最大化を解除して全体表示に戻す */
  readonly reset: () => void;
};

/** `MapZoom` が子に渡す操作。`MapZoom` の外では `null`（`useMapZoom`） */
export const MapZoomContext = createContext<MapZoomControls | null>(null);

/** `MapZoom` の拡大・縮小・全体表示の操作。`MapZoom` の外（地図を使わないテストなど）では `null` */
export function useMapZoom(): MapZoomControls | null {
  return useContext(MapZoomContext);
}

/** 県の「寄る範囲」と「移動できる範囲」（`PrefPath` の `fitBounds`・`panBounds`） */
export type PrefBounds = { readonly fit: Bounds; readonly pan: Bounds };

type Props = {
  /** 県コード → 範囲。ビルド時に求めたものを `MapArea` が渡す */
  readonly bounds: Readonly<Record<PrefCode, PrefBounds>>;
  /** ボタンの文言（辞書の `zoom`） */
  readonly labels: Messages['zoom'];
  /** `MapInteraction` と、その中の地図の `<svg>`（`<g data-map-layer>` を持つ） */
  readonly children: ReactNode;
};

type Zoom = ZoomBehavior<SVGSVGElement, unknown>;
/** 動いている途中の目標の変換を持つ入れ物（`attachZoom` の中の変数を読み書きする） */
type Pending = { readonly get: () => ZoomTransform | null; readonly set: (target: ZoomTransform | null) => void };

/**
 * d3-zoom の付いた `<svg>`。`pending` は、動いている途中のボタン・最大化の目標の変換（なければ `null`）。
 * 動きの途中でもう一度「＋」を押したとき、途中の変換ではなく目標の変換から1回分を進めるために持つ（寄った県から外れない）。
 * ホイール・ピンチ・ドラッグ・クリック（`sourceEvent` がある操作）が始まったら消す。
 */
type Handle = { readonly svg: SVGSVGElement; readonly zoom: Zoom; readonly pending: Pending };

/** 3px までの動きはクリックとして通す。それを超えるドラッグの後の click は d3-zoom が止める（県の固定が変わらない） */
const CLICK_DISTANCE = 3;
/** 変換が同じとみなす差 */
const EPSILON = 1e-6;
const IDENTITY: ZoomTransform = { k: 1, x: 0, y: 0 };
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const BUTTON_CLASS = 'inline-flex h-10 min-w-10 items-center justify-center rounded border border-map-border bg-page-bg px-2 text-lg leading-none text-page-text hover:opacity-80';

const toExtent = ({ x0, y0, x1, y1 }: Bounds): [[number, number], [number, number]] => [
  [x0, y0],
  [x1, y1]
];
const toD3 = ({ k, x, y }: ZoomTransform) => zoomIdentity.translate(x, y).scale(k);
const isReducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
const round = (value: number): number => Math.round(value * 1000) / 1000;

const currentTransform = (svg: SVGSVGElement): ZoomTransform => {
  const { k, x, y } = zoomTransform(svg);
  return { k, x, y };
};
const currentExtent = (zoom: Zoom): Bounds => {
  const [[x0, y0], [x1, y1]] = zoom.translateExtent();
  return { x0, y0, x1, y1 };
};

/**
 * 動かす。動きを減らす設定（F-ZOOM-05）のときは d3-transition を使わず、同期で最終の位置にする
 * （長さ0の transition でも反映は次のフレームになるため）。`target` は範囲に合わせてから渡す。
 */
function moveTo({ svg, zoom, pending }: Handle, target: ZoomTransform): void {
  const selection = select(svg);
  if (isReducedMotion()) {
    pending.set(null);
    selection.call(zoom.transform, toD3(target));
  } else {
    pending.set(target);
    selection.transition().duration(ZOOM_DURATION_MS).call(zoom.transform, toD3(target));
  }
}

/** 「＋」「−」1回分。動いている途中なら、その目標の変換から、表示の中心のまわりで倍率を変える */
function stepBy(handle: Handle, direction: 1 | -1): void {
  const { svg, zoom, pending } = handle;
  const base = pending.get() ?? currentTransform(svg);
  const k = stepScale(base.k, direction, zoom.scaleExtent());
  moveTo(handle, constrainTransform(zoomAbout(base, k, VIEWBOX), VIEWBOX, currentExtent(zoom)));
}

/**
 * 操作（ドラッグ・ホイール・クリックなど）の後、倍率を範囲に、位置を移動できる範囲に収める。
 * 寄る動きを途中で止めると、倍率が下限（県全体が収まる倍率）より小さいまま残るため。
 */
function normalizeView({ svg, zoom }: Handle): void {
  const current = currentTransform(svg);
  const k = clampScale(current.k, zoom.scaleExtent());
  const next = constrainTransform(zoomAbout(current, k, VIEWBOX), VIEWBOX, currentExtent(zoom));
  const isSame = [next.k - current.k, next.x - current.x, next.y - current.y].every(difference => Math.abs(difference) < EPSILON);
  if (!isSame) select(svg).call(zoom.transform, toD3(next));
}

/**
 * 最大化した県（なければ全体）に合わせて、倍率・移動の範囲を替え、その表示に動かす（F-ZOOM-04、4.11.2、D36）。
 * 県の範囲がわからないとき（ビルドの対象外のコード）は何もしない。
 */
function showPref(handle: Handle, pref: PrefCode | null, bounds: Props['bounds']): void {
  if (pref !== null && !Object.hasOwn(bounds, pref)) return;
  const entry = pref === null ? null : bounds[pref];
  const extent = panExtent(entry?.pan ?? null);
  const fit = entry ? fitTransform(entry.fit, VIEWBOX, FIT_PADDING) : null;
  handle.zoom.scaleExtent([...scaleExtent(fit?.k ?? null)]).translateExtent(toExtent(extent));
  moveTo(handle, fit ? constrainTransform(fit, VIEWBOX, extent) : IDENTITY);
}

/**
 * d3-zoom を `<svg>` に付け、`<g data-map-layer>` の `transform`・`data-zoom-scale`・CSS 変数 `--zoom-k` を書く
 * （サーバーの出力は描き直さない）。`--zoom-k` は、線の太さと県名ラベルの文字の大きさを、画面の上で一定に保つのに使う（`JapanMap`）。
 */
function attachZoom(svg: SVGSVGElement): Handle | null {
  const layer = svg.querySelector<SVGGElement>('[data-map-layer]');
  if (layer === null) return null;
  const write = ({ k, x, y }: ZoomTransform) => {
    layer.setAttribute('transform', `translate(${round(x)},${round(y)}) scale(${round(k)})`);
    layer.setAttribute('data-zoom-scale', String(round(k)));
    layer.style.setProperty('--zoom-k', String(round(k)));
  };
  let pendingTarget: ZoomTransform | null = null;
  const pending: Pending = { get: () => pendingTarget, set: target => (pendingTarget = target) };
  const zoom: Zoom = createZoom<SVGSVGElement, unknown>()
    .extent([
      [0, 0],
      [VIEWBOX.width, VIEWBOX.height]
    ])
    .scaleExtent([...BASE_SCALE_EXTENT])
    .translateExtent(toExtent(panExtent(null)))
    .clickDistance(CLICK_DISTANCE)
    // 操作が始まったら、動いている途中のボタンの目標は無効にする（動かさないクリックで動きが止まったときも）
    .on('start', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (event.sourceEvent) pending.set(null);
    })
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => write(event.transform))
    .on('end', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (event.sourceEvent) normalizeView(handle);
    });
  const handle: Handle = { svg, zoom, pending };
  // ダブルクリックでの拡大は使わない（最大化に使う。4.11.2）
  select(svg).call(zoom).on('dblclick.zoom', null);
  // d3 の内部の変換と層の属性を、全体表示にそろえる（zoom イベントで write が呼ばれる）
  select(svg).call(zoom.transform, zoomIdentity);
  return handle;
}

/**
 * 地図の拡大・縮小・移動（T2-06、F-ZOOM-01〜05、4.11.2・4.11.3）。
 * d3-zoom は `<svg>` で操作（ホイール・ピンチ・ドラッグ）を受け、`<g data-map-layer>` だけを動かす（海の矩形は動かない）。
 * `MapInteraction`（子）の外に「＋」「−」「全体」のボタンを重ねる（中に置くと、ボタンのクリックが海のクリックになる）。
 * 最大化した県が変わると、その県に寄る（`mapReducer` の状態は変えない。拡大率と表示位置は d3-zoom が持つ）。
 */
export function MapZoom({ bounds, labels, children }: Props) {
  const { state, dispatch } = useMapState();
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Handle | null>(null);
  // 最後に表示へ反映した最大化の県。変わったときだけ動かす
  const shownPref = useRef<PrefCode | null>(null);

  useEffect(() => {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;
    const handle = attachZoom(svg);
    handleRef.current = handle;
    return () => {
      select(svg).interrupt().on('.zoom', null);
      handleRef.current = null;
      // 次のマウント（StrictMode の再マウントなど）で、最大化中の県に寄り直す
      shownPref.current = null;
    };
  }, []);

  useEffect(() => {
    if (handleRef.current === null || shownPref.current === state.maximized) return;
    shownPref.current = state.maximized;
    showPref(handleRef.current, state.maximized, bounds);
  }, [state.maximized, bounds]);

  const reset = () => {
    // 最大化を解除する。解除の動きはここで行うので、状態の変化を見る上の effect には任せない
    shownPref.current = null;
    dispatch({ type: 'resetView' });
    if (handleRef.current) showPref(handleRef.current, null, bounds);
  };
  const step = (direction: 1 | -1) => {
    if (handleRef.current) stepBy(handleRef.current, direction);
  };

  return (
    <MapZoomContext value={{ step, reset }}>
      <div ref={containerRef} className="relative size-full">
        {children}
        <div data-zoom-controls className="absolute right-2 bottom-2 flex gap-1">
          <button type="button" data-zoom="in" aria-label={plainText(labels.inLabel)} className={BUTTON_CLASS} onClick={() => step(1)}>
            <RubyText text={labels.in} />
          </button>
          <button type="button" data-zoom="out" aria-label={plainText(labels.outLabel)} className={BUTTON_CLASS} onClick={() => step(-1)}>
            <RubyText text={labels.out} />
          </button>
          <button type="button" data-zoom="reset" className={BUTTON_CLASS} onClick={reset}>
            <RubyText text={labels.reset} />
          </button>
        </div>
      </div>
    </MapZoomContext>
  );
}
