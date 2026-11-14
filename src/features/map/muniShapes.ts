/**
 * 市区町村の TopoJSON から、描くもの（パス・濃淡・ラベルの位置・県の外周の線）を作る（T2-08、F-MUNI-01、D34・D36）。
 *
 * 投影は `createProjection(県コード)` だけを使う（沖縄県は点線枠に移る。小笠原村は実際の位置）。
 * DOM・React は使わない。`data` は読むだけ（`muniLoader` のキャッシュと共有している）。
 * 形が壊れていて変換できなければ、例外にせず `null` を返す（`invalid` の失敗として扱う。T2-07）。
 */
import { geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';
import { feature, mesh, neighbors } from 'topojson-client';
import type { MuniProperties, MuniTopology } from './muniLoader';
import { createProjection } from './projection';

/** 濃淡の段階（0〜4）。隣り合う市区町村が同じにならないように付ける */
export type Shade = 0 | 1 | 2 | 3 | 4;

/** ラベルの置き場所。`x`・`y` はいちばん大きなポリゴンの内側の点、`width`・`height` はその外接矩形（viewBox の座標） */
export type LabelAnchor = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** いちばん大きなポリゴンの面積（ラベルを選ぶ優先の順に使う） */
  readonly area: number;
};

/** 市区町村1つぶんの描くもの */
export type MuniShape = {
  readonly code: string;
  readonly properties: MuniProperties;
  /** SVG のパス（viewBox の座標） */
  readonly d: string;
  readonly shade: Shade;
  readonly label: LabelAnchor;
};

/** 1つの県の市区町村の描くもの。`shapes` は `code` の順 */
export type MuniShapes = {
  readonly shapes: readonly MuniShape[];
  /** 県の外周の線のパス（どの市区町村とも接しない弧）。周りの県との境界のずれを目立たなくする */
  readonly outline: string;
};

/** 濃淡の数 */
export const SHADE_COUNT = 5;
/** ラベルの位置を求める精度（viewBox の単位） */
const LABEL_PRECISION = 0.1;
/** パスの座標の小数の桁数。0.01 は約 19m で、最大の倍率（約 40 倍）でも角が目立たない */
const PATH_DIGITS = 2;

type ProjectedPolygon = { readonly rings: readonly (readonly [number, number][])[]; readonly area: number };

type Cache = { readonly pref: string; readonly result: MuniShapes | null };
const cache = new WeakMap<MuniTopology, Cache>();

function projectPosition(projection: GeoProjection, position: Position): [number, number] {
  const point = projection([position[0] as number, position[1] as number]);
  if (point === null) throw new Error('経緯度を投影できません');
  return point;
}

/** リングの面積（絶対値。shoelace） */
function ringArea(ring: readonly (readonly [number, number])[]): number {
  const sum = ring.reduce((total, [x, y], i) => {
    const [nextX, nextY] = ring[(i + 1) % ring.length] as readonly [number, number];
    return total + (x * nextY - nextX * y);
  }, 0);
  return Math.abs(sum) / 2;
}

function projectPolygon(projection: GeoProjection, coordinates: readonly (readonly Position[])[]): ProjectedPolygon {
  const rings = coordinates.map(ring => ring.map(position => projectPosition(projection, position)));
  const [outer] = rings;
  if (outer === undefined) throw new Error('ポリゴンにリングがありません');
  return { rings, area: ringArea(outer) };
}

/** 市区町村のポリゴン（MultiPolygon は複数）を、投影した座標にする */
function projectedPolygons(projection: GeoProjection, geometry: Polygon | MultiPolygon): readonly ProjectedPolygon[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(coordinates => projectPolygon(projection, coordinates));
}

/** いちばん大きなポリゴンの、内側の点と外接矩形 */
function labelAnchor(polygons: readonly ProjectedPolygon[]): LabelAnchor {
  const largest = polygons.reduce((best, polygon) => (polygon.area > best.area ? polygon : best));
  const [outer] = largest.rings as [readonly [number, number][]];
  const xs = outer.map(([x]) => x);
  const ys = outer.map(([, y]) => y);
  const [x, y] = polylabel(largest.rings.map(ring => ring.map(point => [...point])), LABEL_PRECISION);
  return { x, y, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), area: largest.area };
}

/**
 * 隣り合う市区町村が同じにならないように、濃淡を付ける。隣の多い順に、隣が使っていない最小の段階を取る（Welsh–Powell）。
 * 5段階すべてが隣で使われているときは、隣で使われる数がいちばん少ない段階にする（平面の地図ではまず起きない）。
 */
function assignShades(adjacency: readonly (readonly number[])[]): readonly Shade[] {
  const shades: (Shade | null)[] = adjacency.map(() => null);
  const order = adjacency.map((_, i) => i).sort((a, b) => (adjacency[b]?.length ?? 0) - (adjacency[a]?.length ?? 0) || a - b);
  for (const index of order) {
    const counts = Array.from({ length: SHADE_COUNT }, () => 0);
    for (const neighbor of adjacency[index] ?? []) {
      const shade = shades[neighbor];
      if (shade !== null && shade !== undefined) counts[shade] = (counts[shade] ?? 0) + 1;
    }
    shades[index] = counts.indexOf(Math.min(...counts)) as Shade;
  }
  return shades.map(shade => shade ?? 0);
}

function pathOf(projection: GeoProjection, object: Parameters<ReturnType<typeof geoPath>>[0]): string {
  return geoPath(projection).digits(PATH_DIGITS)(object) ?? '';
}

function computeShapes(data: MuniTopology, projection: GeoProjection): MuniShapes {
  const collection = data.objects.municipalities;
  const features = feature(data, collection).features as Feature<Polygon | MultiPolygon, MuniProperties>[];
  const shades = assignShades(neighbors(collection.geometries));
  const shapes = features.map((item, i): MuniShape => {
    const polygons = projectedPolygons(projection, item.geometry);
    return { code: item.properties.code, properties: item.properties, d: pathOf(projection, item), shade: shades[i] ?? 0, label: labelAnchor(polygons) };
  });
  const sorted = [...shapes].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { shapes: sorted, outline: pathOf(projection, mesh(data, collection, (a, b) => a === b)) };
}

/**
 * 検証済みの市区町村の TopoJSON（`muniLoader` が返す `MuniTopology`）から、描くものを作る。
 * 同じ `data`（参照）は1回だけ計算する。形が壊れていて変換できなければ `null`。
 * 県コードが正しくなければ例外（呼ぶ側の誤り）。
 */
export function muniShapes(data: MuniTopology, prefCode: string): MuniShapes | null {
  const projection = createProjection(prefCode);
  const cached = cache.get(data);
  if (cached?.pref === prefCode) return cached.result;
  let result: MuniShapes | null;
  try {
    result = computeShapes(data, projection);
  } catch {
    result = null;
  }
  cache.set(data, { pref: prefCode, result });
  return result;
}
