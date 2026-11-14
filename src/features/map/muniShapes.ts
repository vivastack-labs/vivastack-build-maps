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

/**
 * ラベルの置き場所（viewBox の座標）。`x`・`y` はいちばん大きなポリゴンの内側の点（`polylabel`）。
 * `width`・`height` は、その点を通る水平・垂直の線が形の内側にある長さ（点から両側の近いほうの2倍）で、点を中心にした箱がおよそ収まる大きさ。
 * 凹んだ形（L字）では、外接矩形よりずっと小さくなる。
 */
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
const SHADE_COUNT = 5;
/** ラベルの位置を求める精度（viewBox の単位） */
const LABEL_PRECISION = 0.1;
/** パスの座標の小数の桁数。0.01 は約 19m で、最大の倍率（約95倍。佐賀県）でも 1px に満たない */
const PATH_DIGITS = 2;

type Point = readonly [number, number];
type Rings = readonly (readonly Point[])[];

type Cache = { readonly pref: string; readonly result: MuniShapes | null };
const cache = new WeakMap<MuniTopology, Cache>();

/** 経緯度を投影する。投影できない（座標が有限の数でない）ときは例外（呼ぶ側が `null` にする） */
function projectPosition(projection: GeoProjection, position: Position): Point {
  const point = projection([position[0] as number, position[1] as number]);
  if (point === null || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) throw new Error('経緯度を投影できません');
  return [point[0], point[1]];
}

/** リングの面積（絶対値。shoelace） */
function ringArea(ring: readonly (readonly number[])[]): number {
  const sum = ring.reduce((total, [x = 0, y = 0], i) => {
    const [nextX = 0, nextY = 0] = ring[(i + 1) % ring.length] ?? [];
    return total + (x * nextY - nextX * y);
  }, 0);
  return Math.abs(sum) / 2;
}

/**
 * MultiPolygon のうち、いちばん大きなポリゴン（投影する前の経緯度の面積で比べる。点を投影するのは、選んだ1つだけにするため）。
 * ポリゴンがなければ例外。
 */
function largestPolygon(geometry: Polygon | MultiPolygon): readonly (readonly Position[])[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const area = (polygon: readonly (readonly Position[])[]): number => ringArea(polygon[0] ?? []);
  const largest = polygons.reduce<readonly (readonly Position[])[] | null>((best, polygon) => (best === null || area(polygon) > area(best) ? polygon : best), null);
  if (largest === null || largest[0] === undefined) throw new Error('ポリゴンがありません');
  return largest;
}

/**
 * 点 (px, py) を通る水平（`isHorizontal`）・垂直の線が、形（すべてのリング。穴は外）の内側にある長さのうち、
 * 点から両側の近いほうの2倍。点を中心にした箱の幅・高さの上限になる。線が形を横切らなければ 0。
 */
function insideSpan(rings: Rings, [px, py]: Point, isHorizontal: boolean): number {
  const [along, across] = isHorizontal ? [px, py] : [py, px];
  const axes = (point: Point): Point => (isHorizontal ? point : [point[1], point[0]]);
  const crossings = rings.flatMap(ring =>
    ring.flatMap((start, i) => {
      const [a, b] = [axes(start), axes(ring[(i + 1) % ring.length] ?? start)];
      const isCrossing = a[1] <= across !== b[1] <= across;
      return isCrossing ? [a[0] + ((across - a[1]) * (b[0] - a[0])) / (b[1] - a[1])] : [];
    })
  );
  const before = Math.max(...crossings.filter(value => value <= along));
  const after = Math.min(...crossings.filter(value => value >= along));
  return Number.isFinite(before) && Number.isFinite(after) ? 2 * Math.min(along - before, after - along) : 0;
}

/** いちばん大きなポリゴンの、ラベルの置き場所（内側の点と、その点を中心に置ける箱の大きさ） */
function labelAnchor(projection: GeoProjection, geometry: Polygon | MultiPolygon): LabelAnchor {
  const rings: Rings = largestPolygon(geometry).map(ring => ring.map(position => projectPosition(projection, position)));
  const [x, y] = polylabel(
    rings.map(ring => ring.map(point => [...point])),
    LABEL_PRECISION
  );
  return { x, y, width: insideSpan(rings, [x, y], true), height: insideSpan(rings, [x, y], false), area: ringArea(rings[0] ?? []) };
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
    return { code: item.properties.code, properties: item.properties, d: pathOf(projection, item), shade: shades[i] ?? 0, label: labelAnchor(projection, item.geometry) };
  });
  const sorted = [...shapes].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return {
    shapes: sorted,
    outline: pathOf(
      projection,
      mesh(data, collection, (a, b) => a === b)
    )
  };
}

/**
 * すでに計算した結果を返す。まだ計算していなければ `undefined`（計算はしない）。壊れていて変換できなかったデータは `null`。
 * 描画の中で重い計算をしないために、結果があるときだけ使う（`useMuniShapes`）。
 */
export function cachedMuniShapes(data: MuniTopology, prefCode: string): MuniShapes | null | undefined {
  const cached = cache.get(data);
  return cached?.pref === prefCode ? cached.result : undefined;
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
