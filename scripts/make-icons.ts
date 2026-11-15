// T4-02、5.4：ホーム画面のアイコン（仮）を作る。日本の形（47県のうち沖縄県を除く。`geo/data/prefs.topo.json`）を、色のついた正方形の上に描いた SVG と、
// Playwright の chromium で書き出した PNG（192・512・maskable 512・apple-touch-icon 180）を public/icons/ に出す。
// 一度だけ手で実行して出力をコミットする（毎回のビルドでは動かさない）。デザインは仮で、public/icons/icon.svg を差し替えて作り直せる。
// 実行：node scripts/make-icons.ts（先に pnpm exec playwright install chromium）（Node.js の型の除去で直接動かすので、enum などは使わない。相対の import には .ts を付ける）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoPath } from 'd3-geo';
import type { GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';
import { merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon as TopoMultiPolygon, Polygon as TopoPolygon, Topology } from 'topojson-specification';
import { createProjection, OKINAWA_PREF_CODE, VIEWBOX } from '../src/features/map/projection.ts';

/** アイコンの背景の色（仮） */
const BACKGROUND = '#0f766e';
/** 日本の形の色 */
const SHAPE = '#ffffff';
/** SVG の座標（正方形の一辺）。PNG はこれを拡大・縮小して書き出す */
const CANVAS = 512;
/** any の角丸（一辺に対する割合） */
const CORNER_RATIO = 0.18;
/** any：形の縦を一辺の何割にするか */
const ANY_HEIGHT_RATIO = 0.8;
/** maskable：セーフゾーン（中央の円の直径が一辺の8割）の半径 */
const SAFE_RADIUS_RATIO = 0.4;

/** アイコンの種類。any＝角丸の背景、maskable＝全面の背景（OS が形に切り抜く。apple-touch-icon も同じ） */
export type IconKind = 'any' | 'maskable';

/** 外接矩形（viewBox の座標） */
export type ShapeBounds = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

/** 日本の形：SVG のパス（viewBox の座標）と外接矩形 */
export type Shape = { readonly d: string; readonly bounds: ShapeBounds };

/** 書き出すファイル（public/icons/ の中）。`kind` が背景の形、`size` が PNG の一辺（px） */
export const ICON_SIZES: readonly { readonly file: string; readonly size: number; readonly kind: IconKind }[] = [
  { file: 'icon-192.png', size: 192, kind: 'any' },
  { file: 'icon-512.png', size: 512, kind: 'any' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'maskable' }
];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * `prefs.topo.json` から、沖縄県（左上の枠に移る）と、viewBox の外に出る島（小笠原村）を除いた、日本の形を1つの塊にして返す。
 * 県の間の境界は消す（1色で塗るので、境界の線の隙間が見えないように）。入力が TopoJSON でなければ例外。
 */
export const mainlandShape = (topology: unknown): Shape => {
  if (!isRecord(topology) || topology.type !== 'Topology' || !isRecord(topology.objects)) {
    throw new Error('prefs.topo.json が TopoJSON（Topology）ではありません');
  }
  const object = topology.objects.prefectures;
  if (!isRecord(object) || object.type !== 'GeometryCollection') {
    throw new Error('prefs.topo.json に GeometryCollection のオブジェクト prefectures がありません');
  }
  const geometries = (object as unknown as GeometryCollection<GeoJsonProperties>).geometries.filter(
    (geometry): geometry is TopoPolygon | TopoMultiPolygon => (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') && geometry.properties?.code !== OKINAWA_PREF_CODE
  );
  const merged: MultiPolygon = merge(topology as unknown as Topology, geometries);
  // 沖縄県以外は同じ投影なので、どの県コードでもよい
  const path = geoPath(createProjection('01')).digits(0);
  const inside = (polygon: Polygon['coordinates']): boolean => {
    const [[x0, y0], [x1, y1]] = path.bounds({ type: 'Polygon', coordinates: polygon });
    return x0 >= 0 && y0 >= 0 && x1 <= VIEWBOX.width && y1 <= VIEWBOX.height;
  };
  const shape: MultiPolygon = { type: 'MultiPolygon', coordinates: merged.coordinates.filter(inside) };
  const [[x0, y0], [x1, y1]] = path.bounds(shape);
  return { d: path(shape) ?? '', bounds: { x0, y0, x1, y1 } };
};

/** 形を置く拡大率（`scale`）と、座標の移動量（`translate`。拡大した後に足す）。形を中央に置く */
export const iconLayout = (bounds: ShapeBounds, kind: IconKind): { readonly scale: number; readonly translate: readonly [number, number] } => {
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  // maskable は、外接矩形の四隅が中央の円（セーフゾーン）の中に入るようにする。any は縦を一辺の8割にする
  const scale = kind === 'any' ? (CANVAS * ANY_HEIGHT_RATIO) / height : (CANVAS * SAFE_RADIUS_RATIO) / (Math.hypot(width, height) / 2);
  const centerX = (bounds.x0 + bounds.x1) / 2;
  const centerY = (bounds.y0 + bounds.y1) / 2;
  return { scale, translate: [CANVAS / 2 - centerX * scale, CANVAS / 2 - centerY * scale] };
};

/** アイコンの SVG の文字列。style 属性・スクリプトは使わない */
export const iconSvg = (shape: Shape, kind: IconKind): string => {
  const { scale, translate } = iconLayout(shape.bounds, kind);
  const corner = kind === 'any' ? ` rx="${Math.round(CANVAS * CORNER_RATIO)}"` : '';
  const transform = `translate(${translate[0].toFixed(2)} ${translate[1].toFixed(2)}) scale(${scale.toFixed(4)})`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">`,
    `<rect width="${CANVAS}" height="${CANVAS}"${corner} fill="${BACKGROUND}"/>`,
    // 線の太さは拡大の前の座標なので、拡大率で割る。境界の隙間を消すための細い縁
    `<path d="${shape.d}" transform="${transform}" fill="${SHAPE}" stroke="${SHAPE}" stroke-width="${(1 / scale).toFixed(3)}" stroke-linejoin="round"/>`,
    '</svg>',
    ''
  ].join('');
};

// SVG を1つの正方形のページに入れて、PNG にする（any の角の外は透明）
const renderPngs = async (shape: Shape, outDir: string): Promise<void> => {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const { file, size, kind } of ICON_SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">${iconSvg(shape, kind).replace(`width="${CANVAS}" height="${CANVAS}"`, `width="${size}" height="${size}"`)}`);
      writeFileSync(join(outDir, file), await page.screenshot({ omitBackground: true, type: 'png' }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
};

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  const outDir = join(repoRoot, 'public', 'icons');
  const shape = mainlandShape(JSON.parse(readFileSync(join(repoRoot, 'geo', 'data', 'prefs.topo.json'), 'utf8')));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'icon.svg'), iconSvg(shape, 'any'));
  await renderPngs(shape, outDir);
}
