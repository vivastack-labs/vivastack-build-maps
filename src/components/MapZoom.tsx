'use client';

import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as createZoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { useEffect, useRef, type ReactNode } from 'react';
import { VIEWBOX } from '@/features/map/projection';
import type { PrefCode } from '@/features/map/state';
import { BASE_SCALE_EXTENT, constrainTransform, FIT_PADDING, fitTransform, panExtent, scaleExtent, stepScale, ZOOM_DURATION_MS, type Bounds, type ZoomTransform } from '@/features/map/viewport';
import type { Messages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { useMapState } from './MapStateProvider';
import { RubyText } from './RubyText';

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
/**
 * d3-zoom の付いた `<svg>`。`pending.k` は、動いている途中のボタン・最大化の目標の倍率（なければ `null`）。
 * 動きの途中でもう一度「＋」を押したとき、途中の倍率ではなく目標の倍率から1回分を進めるために持つ。
 * ホイール・ピンチ・ドラッグ（`sourceEvent` がある zoom）が入ったら消す。
 */
type Handle = { readonly svg: SVGSVGElement; readonly zoom: Zoom; readonly pending: { k: number | null } };

/** 3px までの動きはクリックとして通す。それを超えるドラッグの後の click は d3-zoom が止める（県の固定が変わらない） */
const CLICK_DISTANCE = 3;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const BUTTON_CLASS = 'inline-flex h-10 min-w-10 items-center justify-center rounded border border-map-border bg-page-bg px-2 text-lg leading-none text-page-text hover:opacity-80';

const toExtent = ({ x0, y0, x1, y1 }: Bounds): [[number, number], [number, number]] => [
  [x0, y0],
  [x1, y1]
];
const toD3 = ({ k, x, y }: ZoomTransform) => zoomIdentity.translate(x, y).scale(k);
const isReducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * 動かす。動きを減らす設定（F-ZOOM-05）のときは d3-transition を使わず、同期で最終の位置にする
 * （長さ0の transition でも反映は次のフレームになるため）。
 */
function moveTo({ svg, zoom, pending }: Handle, target: ZoomTransform): void {
  const selection = select(svg);
  if (isReducedMotion()) {
    pending.k = null;
    selection.call(zoom.transform, toD3(target));
  } else {
    pending.k = target.k;
    selection.transition().duration(ZOOM_DURATION_MS).call(zoom.transform, toD3(target));
  }
}

/** 「＋」「−」1回分の倍率にする。範囲は今の `scaleExtent` */
function stepBy({ svg, zoom, pending }: Handle, direction: 1 | -1): void {
  const k = stepScale(pending.k ?? zoomTransform(svg).k, direction, zoom.scaleExtent());
  const selection = select(svg);
  if (isReducedMotion()) {
    pending.k = null;
    selection.call(zoom.scaleTo, k);
  } else {
    pending.k = k;
    selection.transition().duration(ZOOM_DURATION_MS).call(zoom.scaleTo, k);
  }
}

/**
 * 最大化した県（なければ全体）に合わせて、倍率・移動の範囲を替え、その表示に動かす（F-ZOOM-04、4.11.2、D36）。
 * 県の範囲がわからないとき（ビルドの対象外のコード）は何もしない。
 */
function showPref(handle: Handle, pref: PrefCode | null, bounds: Props['bounds']): void {
  const entry = pref === null ? null : bounds[pref];
  if (pref !== null && entry === undefined) return;
  const extent = panExtent(entry?.pan ?? null);
  const fit = entry ? fitTransform(entry.fit, VIEWBOX, FIT_PADDING) : null;
  handle.zoom.scaleExtent([...scaleExtent(fit?.k ?? null)]).translateExtent(toExtent(extent));
  moveTo(handle, fit ? constrainTransform(fit, VIEWBOX, extent) : { k: 1, x: 0, y: 0 });
}

/** d3-zoom を `<svg>` に付け、`<g data-map-layer>` の `transform` と `data-zoom-scale` を書く（サーバーの出力は描き直さない） */
function attachZoom(svg: SVGSVGElement): Handle | null {
  const layer = svg.querySelector('[data-map-layer]');
  if (layer === null) return null;
  const write = (transform: ZoomTransform) => {
    layer.setAttribute('transform', `translate(${round(transform.x)},${round(transform.y)}) scale(${round(transform.k)})`);
    layer.setAttribute('data-zoom-scale', String(round(transform.k)));
  };
  const pending: Handle['pending'] = { k: null };
  const zoom: Zoom = createZoom<SVGSVGElement, unknown>()
    .extent([
      [0, 0],
      [VIEWBOX.width, VIEWBOX.height]
    ])
    .scaleExtent([...BASE_SCALE_EXTENT])
    .translateExtent(toExtent(panExtent(null)))
    .clickDistance(CLICK_DISTANCE)
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      // 操作（ホイール・ピンチ・ドラッグ）が入ったら、動いている途中のボタンの目標は無効にする
      if (event.sourceEvent) pending.k = null;
      write(event.transform);
    });
  // ダブルクリックでの拡大は使わない（最大化に使う。4.11.2）
  select(svg).call(zoom).on('dblclick.zoom', null);
  write({ k: 1, x: 0, y: 0 });
  return { svg, zoom, pending };
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
    <div ref={containerRef} className="relative size-full">
      {children}
      <div data-zoom-controls className="absolute right-2 bottom-2 flex gap-1">
        <button type="button" data-zoom="in" aria-label={plainText(labels.inLabel)} className={BUTTON_CLASS} onClick={() => step(1)}>
          <RubyText text={labels.in} />
        </button>
        <button type="button" data-zoom="out" aria-label={plainText(labels.outLabel)} className={BUTTON_CLASS} onClick={() => step(-1)}>
          <RubyText text={labels.out} />
        </button>
        <button type="button" data-zoom="reset" aria-label={plainText(labels.reset)} className={BUTTON_CLASS} onClick={reset}>
          <RubyText text={labels.reset} />
        </button>
      </div>
    </div>
  );
}
