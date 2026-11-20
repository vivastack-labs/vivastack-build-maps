/**
 * 地図の拡大・縮小・移動の計算（T2-06、F-ZOOM-01〜05、4.11.2、U16・D36）。
 *
 * DOM を使わない純粋関数だけを置く。d3-zoom（`MapZoom`）に渡すのは、ここで求めた値だけにする。
 * 座標はすべて地図の viewBox の座標。変換は `translate(x, y) scale(k)`（d3-zoom の `ZoomTransform` と同じ意味）。
 */
import { VIEWBOX } from './projection.ts';

/** 範囲（viewBox の座標）。`x0 < x1`・`y0 < y1` */
export type Bounds = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
/** 表示領域の大きさ（viewBox の単位） */
export type Size = { readonly width: number; readonly height: number };
/** `translate(x, y) scale(k)` */
export type ZoomTransform = { readonly k: number; readonly x: number; readonly y: number };
/** 倍率の範囲 [最小, 最大] */
export type ScaleExtent = readonly [min: number, max: number];

/** 通常の倍率の範囲。全体表示（1）から 8 倍まで（F-ZOOM-01） */
export const BASE_SCALE_EXTENT: ScaleExtent = [1, 8];
/** 最大化中の倍率の上限は、寄る範囲が収まる倍率のこの倍（ただし 8 を下回らない）。市区町村（T2-08）を見分けられる広さ */
export const MAXIMIZED_ZOOM_IN_RATIO = 4;
/**
 * 倍率の上限の上限。市区町村のラベルを選ぶ倍率の段（`labels.ts`）と、パスの座標の桁数（`muniShapes.ts`。0.01 が 1px 前後）の上限。
 * 東京都の23区（D51）のように寄る範囲が狭い県でも、これを超えて拡大しない。
 */
export const MAX_ZOOM_SCALE = 128;
/** 「＋」「−」の1回分の倍率 */
export const ZOOM_STEP = 1.5;
/** 県に寄るときの余白。表示領域の各辺に対する割合 */
export const FIT_PADDING = 0.05;
/** 「＋」「−」・最大化の動きの時間（ミリ秒）。動きを減らす設定では使わない（F-ZOOM-05） */
export const ZOOM_DURATION_MS = 300;

/** 地図全体（viewBox）の範囲 */
const VIEWBOX_BOUNDS: Bounds = { x0: 0, y0: 0, x1: VIEWBOX.width, y1: VIEWBOX.height };
const MAX_PADDING = 0.5;

function assertBounds({ x0, y0, x1, y1 }: Bounds): void {
  const isValid = [x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0;
  if (!isValid) {
    throw new Error(`範囲は有限の数で、幅・高さが正である必要があります（${x0}, ${y0}, ${x1}, ${y1}）`);
  }
}

function assertSize({ width, height }: Size): void {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
    throw new Error(`表示領域の大きさが正しくありません（${width} × ${height}）`);
  }
}

function assertScale(k: number): void {
  if (!(Number.isFinite(k) && k > 0)) {
    throw new Error(`倍率は有限の正の数である必要があります（${k}）`);
  }
}

/**
 * 範囲を、表示領域の中央に、各辺 `padding`（割合）の余白を残して収める変換（F-ZOOM-04）。
 * 倍率は、幅・高さのうち先に余白に当たるほうで決まる。
 */
export function fitTransform(bounds: Bounds, size: Size, padding: number): ZoomTransform {
  assertBounds(bounds);
  assertSize(size);
  if (!(padding >= 0 && padding < MAX_PADDING)) {
    throw new Error(`余白は 0 以上 0.5 未満の割合で指定してください（${padding}）`);
  }
  const usable = 1 - 2 * padding;
  const k = Math.min((size.width * usable) / (bounds.x1 - bounds.x0), (size.height * usable) / (bounds.y1 - bounds.y0));
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  return { k, x: size.width / 2 - k * cx, y: size.height / 2 - k * cy };
}

/**
 * 倍率の範囲。通常は 1〜8。最大化中は、県全体が収まる倍率（`fitScale`）より小さくならない（縮小しすぎない。4.11.2）。
 * 上限は、最大化で寄る範囲が収まる倍率（`focusScale`。省くと `fitScale`）の4倍（8 を下回らず、`MAX_ZOOM_SCALE` を超えない）。
 * 香川県・大阪府のように `fitScale` が大きい県でも、最大化したあとに拡大できる。
 * 東京都は寄る範囲（23区）が県全体より狭いので、`focusScale` が `fitScale` より大きい（D51）。`focusScale` は `fitScale` 以上で、小さいときは例外にする。
 * `fitScale` が `null`（最大化していない）のときは `focusScale` を見ない。
 */
export function scaleExtent(fitScale: number | null, focusScale: number | null = fitScale): ScaleExtent {
  if (fitScale === null) return BASE_SCALE_EXTENT;
  assertScale(fitScale);
  const focus = focusScale ?? fitScale;
  assertScale(focus);
  if (focus < fitScale) {
    throw new Error(`寄る範囲の倍率（${focus}）は、県全体が収まる倍率（${fitScale}）以上である必要があります`);
  }
  return [fitScale, Math.min(MAX_ZOOM_SCALE, Math.max(BASE_SCALE_EXTENT[1], focus * MAXIMIZED_ZOOM_IN_RATIO))];
}

/** 倍率を範囲の中に収める */
export function clampScale(k: number, [min, max]: ScaleExtent): number {
  assertScale(k);
  return Math.min(max, Math.max(min, k));
}

/** 「＋」（`direction` が 1）・「−」（-1）1回分の倍率。`extent` を超えない */
export function stepScale(k: number, direction: 1 | -1, extent: ScaleExtent): number {
  assertScale(k);
  return clampScale(k * ZOOM_STEP ** direction, extent);
}

/** 表示領域の中心を動かさずに、倍率を `k` にした変換（「＋」「−」の拡大・縮小）。範囲には合わせないので、`constrainTransform` に通す */
export function zoomAbout(transform: ZoomTransform, k: number, size: Size): ZoomTransform {
  assertScale(k);
  assertScale(transform.k);
  assertSize(size);
  const cx = size.width / 2;
  const cy = size.height / 2;
  return { k, x: cx - ((cx - transform.x) / transform.k) * k, y: cy - ((cy - transform.y) / transform.k) * k };
}

/**
 * 移動できる範囲。最大化していなければ viewBox。最大化中は、viewBox と県の範囲（`panBounds`）を合わせた外接矩形
 * （東京都は小笠原村の位置が viewBox の外なので、そこまで動ける。D36）。
 */
export function panExtent(panBounds: Bounds | null): Bounds {
  if (panBounds === null) return VIEWBOX_BOUNDS;
  assertBounds(panBounds);
  return {
    x0: Math.min(VIEWBOX_BOUNDS.x0, panBounds.x0),
    y0: Math.min(VIEWBOX_BOUNDS.y0, panBounds.y0),
    x1: Math.max(VIEWBOX_BOUNDS.x1, panBounds.x1),
    y1: Math.max(VIEWBOX_BOUNDS.y1, panBounds.y1)
  };
}

/** 端を超えた量（`low`・`high`）を戻す移動量。範囲より表示領域が広いときは中央に置く */
function overshoot(low: number, high: number): number {
  if (high > low) return (low + high) / 2;
  return Math.min(0, low) || Math.max(0, high);
}

/**
 * 変換を、移動できる範囲（`extent`）に収める。d3-zoom の既定の `constrain` と同じ計算
 * （d3-zoom は `zoom.transform` の値を範囲に合わせないので、寄る先をここで合わせてから渡す）。
 */
export function constrainTransform({ k, x, y }: ZoomTransform, size: Size, extent: Bounds): ZoomTransform {
  assertScale(k);
  assertSize(size);
  assertBounds(extent);
  const dx = overshoot((0 - x) / k - extent.x0, (size.width - x) / k - extent.x1);
  const dy = overshoot((0 - y) / k - extent.y0, (size.height - y) / k - extent.y1);
  return { k, x: x + k * dx, y: y + k * dy };
}
