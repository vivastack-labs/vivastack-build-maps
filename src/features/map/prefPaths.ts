/**
 * 都道府県の形を SVG のパスにする（T2-04、F-MAP-01・02、6.6 (1)、D24）。
 *
 * ビルド時（サーバーコンポーネント）にだけ使う。`geo/data/prefs.topo.json` は配信せず、ここでパスにして HTML に埋め込む。
 * 投影は `projection.ts` だけを使う（沖縄県は点線枠に移る）。
 */
import { geoPath } from 'd3-geo';
import type { GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import prefsTopology from '../../../geo/data/prefs.topo.json' with { type: 'json' };
import { LANGS, type Lang } from '@/i18n/lang';
import { createProjection, projectPoint, VIEWBOX, type LonLat } from './projection.ts';

/** 県名ラベルの位置（viewBox の座標。文字の中心） */
export type LabelPosition = { readonly x: number; readonly y: number };

/** 県のパス（`d`）と、言語ごとの県名ラベルの位置 */
export type PrefPath = {
  readonly code: string;
  readonly d: string;
  readonly labels: Readonly<Record<Lang, LabelPosition>>;
};

/** パスの座標の小数の桁数。1桁（0.1px）なら見た目は変わらず、HTML が小さくなる（5.1） */
const PATH_DIGITS = 1;

/** 県コードが 01〜47 か */
const PREF_CODE = /^(0[1-9]|[1-3][0-9]|4[0-7])$/u;

/**
 * 県名ラベルの文字の大きさ（viewBox の単位）。幅821pxで、ja・zh は約13px。
 * 英語の県名は横に長く（Kagoshima など）、同じ大きさでは隣の県のラベルとの重なりを避けきれないので、小さくする。
 */
export const LABEL_FONT_SIZE: Readonly<Record<Lang, number>> = { ja: 16, en: 13, zh: 16 };

type LabelOffsets = Readonly<Record<string, readonly [dx: number, dy: number]>>;

// 県名ラベルを重ならないようにずらす量（viewBox の単位。[dx, dy]）。県コードで引く。
// 「いちばん大きな形の内側の点」のままだと、小さな県が隣り合うところで文字が重なるため。
// 文字の大きさ・長さで重なる県が変わるので、言語ごとに持つ（zh は ja と同じ字数）。
// 重ならないことは E2E（tests/e2e/map.spec.ts）で確かめている。
const OFFSETS_JA: LabelOffsets = {
  '04': [3, 0],
  '06': [-3, 0],
  '11': [0, -5],
  '12': [2, 0],
  '13': [2, 0],
  '14': [-2, 9],
  '19': [-2, -3],
  '24': [6, 0],
  '25': [7, 0],
  '26': [-2, 0],
  '27': [0, -9],
  '28': [-4, 2],
  '29': [-6, 4],
  '30': [0, 5],
  '31': [0, -2],
  '36': [0, 3],
  '37': [0, -3],
  '38': [-7, 0],
  '39': [7, 0],
  '40': [3, 0],
  '41': [-3, -1],
  '42': [0, 1],
  '44': [0, -3],
  '45': [0, 3]
};
const OFFSETS_EN: LabelOffsets = {
  '04': [0, -9],
  '06': [0, 9],
  '08': [0, -16],
  '09': [0, -8],
  '11': [0, -9],
  '12': [8, 0],
  '13': [0, -8],
  '14': [-8, 18],
  '16': [0, -3],
  '17': [0, 3],
  '19': [0, 9],
  '22': [3, 15],
  '23': [-3, 0],
  '24': [4, 0],
  '25': [7, 0],
  '26': [-7, -7],
  '27': [0, -5],
  '28': [5, 7],
  '29': [-4, 5],
  '30': [0, 15],
  '32': [0, -1],
  '33': [-5, -6],
  '36': [0, -3],
  '37': [0, -6],
  '38': [0, -7],
  '39': [0, 7],
  '40': [0, -5],
  '42': [0, -2],
  '43': [0, 4],
  '45': [0, 3]
};

/** 県名ラベルのずらし。言語ごと */
export const LABEL_OFFSETS: Readonly<Record<Lang, LabelOffsets>> = { ja: OFFSETS_JA, en: OFFSETS_EN, zh: OFFSETS_JA };

type PrefFeature = {
  readonly code: string;
  readonly label: LonLat;
  readonly geometry: Polygon | MultiPolygon;
};

let cached: readonly PrefPath[] | undefined;

/** 同梱の `prefs.topo.json` から、県コードの順にパスを作る。同じ結果を使い回す */
export function loadPrefPaths(): readonly PrefPath[] {
  cached ??= buildPrefPaths(prefsTopology);
  return cached;
}

/**
 * TopoJSON（オブジェクト名 `prefectures`、属性 `code`・`label`）から、県ごとのパスと県名ラベルの位置を作る。
 * 入力は境界で確かめ、形が想定と違えば例外にする（ビルドを止める）。
 * viewBox の外に出る島（硫黄島など）は形から除く（U16）。
 */
export function buildPrefPaths(topology: unknown): readonly PrefPath[] {
  return readFeatures(topology)
    .map(toPrefPath)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function toPrefPath({ code, label, geometry }: PrefFeature): PrefPath {
  const projection = createProjection(code);
  const path = geoPath(projection).digits(PATH_DIGITS);
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).filter(rings => overlapsViewBox(path.bounds({ type: 'Polygon', coordinates: rings })));
  if (polygons.length === 0) {
    throw new Error(`県 ${code} の形が viewBox の中にありません`);
  }
  const d = path({ type: 'MultiPolygon', coordinates: polygons });
  if (d === null) {
    throw new Error(`県 ${code} の形をパスにできません`);
  }
  const [x, y] = projectPoint(label, code);
  return { code, d, labels: Object.fromEntries(LANGS.map(lang => [lang, offsetLabel(lang, code, [x, y])])) as Record<Lang, LabelPosition> };
}

function offsetLabel(lang: Lang, code: string, [x, y]: readonly [number, number]): LabelPosition {
  const [dx, dy] = LABEL_OFFSETS[lang][code] ?? [0, 0];
  return { x: round(x + dx), y: round(y + dy) };
}

/** 外接矩形 [[x0, y0], [x1, y1]] が viewBox と重なるか。一部だけ入る島は残す */
function overlapsViewBox([[x0, y0], [x1, y1]]: [[number, number], [number, number]]): boolean {
  return x1 >= 0 && x0 <= VIEWBOX.width && y1 >= 0 && y0 <= VIEWBOX.height;
}

const round = (value: number): number => Math.round(value * 10) / 10;

function readFeatures(topology: unknown): readonly PrefFeature[] {
  if (!isRecord(topology) || topology.type !== 'Topology' || !isRecord(topology.objects)) {
    throw new Error('prefs.topo.json が TopoJSON（Topology）ではありません');
  }
  const object = topology.objects.prefectures;
  if (!isRecord(object) || object.type !== 'GeometryCollection') {
    throw new Error('prefs.topo.json に GeometryCollection のオブジェクト prefectures がありません');
  }
  const { features } = feature(topology as unknown as Topology, object as unknown as GeometryCollection<GeoJsonProperties>);
  return features.map(({ properties, geometry }) => {
    const code = properties?.code;
    if (typeof code !== 'string' || !PREF_CODE.test(code)) {
      throw new Error(`県の属性 code が 01〜47 の文字列ではありません（${String(code)}）`);
    }
    const label: unknown = properties?.label;
    if (!isLonLat(label)) {
      throw new Error(`県 ${code} の属性 label が [経度, 緯度] ではありません`);
    }
    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') {
      throw new Error(`県 ${code} の形が Polygon・MultiPolygon ではありません`);
    }
    return { code, label, geometry };
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n));
}
