// N03 から、アプリが使う2種類の TopoJSON を作る（T1-04、第8章、7.4）。
//
// - 市区町村（public/geo/muni/NN.topo.json）：コードごとに形をまとめ、簡略化し、県ごとに分ける。属性は municipality.ts で作る。
//   所属未定地（コード NN000）は市区町村ではないので入れない（D34）。
// - 都道府県（geo/data/prefs.topo.json）：市区町村の形を県ごとにまとめ（県境と市区町村の境界がずれないように、
//   N03 の _prefecture は使わない）、簡略化し、県名ラベルの位置（経緯度）を付ける。所属未定地も含める。
//   投影と沖縄の別枠への移動はしない（描くときに src/features/map/projection.ts で行う）。
import { gzipSync } from 'node:zlib';
import type { FeatureCollection } from 'geojson';
import mapshaper from 'mapshaper';
import type { GeometryObject, Topology } from 'topojson-specification';
import { assertFixesUsed, assertSameCodes, toMunicipality, type N03Row, type NamingSources } from './municipality.ts';

export type SimplifySettings = {
  /** 簡略化の度合い（メートル。mapshaper の -simplify interval=） */
  readonly interval: number;
  /** TopoJSON の座標の量子化（mapshaper の quantization=） */
  readonly quantization: number;
};

export type GeoBuildSettings = {
  readonly municipality: SimplifySettings;
  readonly prefecture: SimplifySettings;
  /** 1県分の市区町村データの、gzip 後の上限（バイト。5.1） */
  readonly maxGzipBytes: number;
};

/**
 * 値と理由は geo/README.md（D34）。
 * - 市区町村：100m。最大化した県を画面いっぱいに描いても角ばりが目立たず、最大の北海道でも100KBに収まる。
 * - 都道府県：1km。HTML に SVG のパスとして埋め込む（6.6 (1)）ので、最初の読み込み（5.1）に効く。全国の表示では見分けられない。
 */
export const GEO_BUILD_SETTINGS: GeoBuildSettings = {
  municipality: { interval: 100, quantization: 50_000 },
  prefecture: { interval: 1000, quantization: 100_000 },
  maxGzipBytes: 100_000
};

/** N03 の Shapefile のパス、またはテスト用の GeoJSON */
export type N03Source = string | FeatureCollection;

export type GeoBuildResult = {
  /** 都道府県の TopoJSON（オブジェクト名 prefectures） */
  readonly prefs: string;
  /** 県コード → その県の市区町村の TopoJSON（オブジェクト名 municipalities）。県コードの順 */
  readonly municipalities: ReadonlyMap<string, string>;
};

type AnyTopology = Topology<Record<string, { type: 'GeometryCollection'; geometries: GeometryObject<Record<string, unknown>>[] }>>;
type Geometry = GeometryObject<Record<string, unknown>>;

const GZIP_LEVEL = 9;
const LABEL_DIGITS = 4;
const UNASSIGNED_SUFFIX = '000';

export async function buildGeo(source: N03Source, naming: NamingSources, settings: GeoBuildSettings = GEO_BUILD_SETTINGS): Promise<GeoBuildResult> {
  // 全国の Shapefile を2回読むので、メモリを抑えるために1つずつ動かす
  const municipalityOutputs = await runMapshaper(source, municipalityCommands(settings.municipality));
  const prefOutputs = await runMapshaper(source, prefectureCommands(settings.prefecture));
  const municipalities = toMunicipalityFiles(municipalityOutputs, naming);
  assertGzipSize(municipalities, settings.maxGzipBytes);
  return { prefs: toPrefectureFile(prefOutputs), municipalities };
}

/** gzip（レベル9）した大きさ（バイト） */
export function gzipSize(text: string): number {
  return gzipSync(text, { level: GZIP_LEVEL }).length;
}

function municipalityCommands({ interval, quantization }: SimplifySettings): string {
  return [
    `-filter "!N03_007.endsWith('${UNASSIGNED_SUFFIX}')"`,
    '-dissolve N03_007 copy-fields=N03_004,N03_005',
    `-simplify interval=${interval} keep-shapes`,
    '-each "pref=N03_007.slice(0,2)"',
    '-split pref',
    `-o format=topojson singles quantization=${quantization}`
  ].join(' ');
}

// innerX・innerY は、いちばん大きな形の内側の点（polylabel）。北海道の北方領土や東京都の島ではなく、本土に付く
function prefectureCommands({ interval, quantization }: SimplifySettings): string {
  return [
    '-each "pref=N03_007.slice(0,2)"',
    '-dissolve pref',
    `-simplify interval=${interval} keep-shapes`,
    '-each "lon=this.innerX, lat=this.innerY"',
    `-o format=topojson quantization=${quantization}`
  ].join(' ');
}

async function runMapshaper(source: N03Source, commands: string): Promise<readonly AnyTopology[]> {
  const input = typeof source === 'string' ? `-i "${source}" encoding=utf8` : '-i n03.json';
  const outputs = await mapshaper.applyCommands(`-quiet ${input} ${commands}`, typeof source === 'string' ? undefined : { 'n03.json': source });
  return Object.values(outputs).map(content => JSON.parse(typeof content === 'string' ? content : new TextDecoder().decode(content)) as AnyTopology);
}

function toMunicipalityFiles(topologies: readonly AnyTopology[], naming: NamingSources): ReadonlyMap<string, string> {
  const files = topologies.map(topology => {
    const geometries = onlyCollection(topology).geometries;
    const prefCode = String(propertiesOf(geometries[0] as Geometry).pref);
    const rows = geometries.map(geometry => geometry.properties as unknown as N03Row);
    const named = geometries.map((geometry, index) => withProperties(geometry, { ...toMunicipality(rows[index] as N03Row, naming) }));
    return { prefCode, rows, json: serialize(topology, 'municipalities', named) };
  });
  const rows = files.flatMap(file => file.rows);
  assertSameCodes(naming.soumu, rows);
  assertFixesUsed(naming, rows);
  const table = new Map(files.map(file => [file.prefCode, file.json] as const).sort(([a], [b]) => compareCodes(a, b)));
  if (table.size !== files.length) {
    throw new Error(`同じ県の市区町村が複数の出力に分かれています（${files.map(file => file.prefCode).join('・')}）`);
  }
  return table;
}

function toPrefectureFile(topologies: readonly AnyTopology[]): string {
  const [topology] = topologies;
  if (topology === undefined || topologies.length !== 1) {
    throw new Error(`都道府県の出力が1つではありません（${topologies.length}）`);
  }
  const geometries = onlyCollection(topology).geometries.map(geometry => {
    const { pref, lon, lat } = propertiesOf(geometry);
    return withProperties(geometry, { code: String(pref), label: [round(Number(lon)), round(Number(lat))] });
  });
  return serialize(topology, 'prefectures', geometries);
}

function onlyCollection(topology: AnyTopology): AnyTopology['objects'][string] {
  const collections = Object.values(topology.objects);
  const [collection] = collections;
  if (collection === undefined || collections.length !== 1) {
    throw new Error(`TopoJSON のオブジェクトが1つではありません（${Object.keys(topology.objects).join('・')}）`);
  }
  const empty = collection.geometries.find(geometry => geometry.type === null);
  if (empty !== undefined) {
    throw new Error(`形のなくなった地域があります（${JSON.stringify(empty.properties)}）`);
  }
  return collection;
}

// topojson-specification の型では、形のない地域の properties が {} になるので、ここで型をそろえる
function propertiesOf(geometry: Geometry): Record<string, unknown> {
  return geometry.properties as Record<string, unknown>;
}

function withProperties(geometry: Geometry, properties: Record<string, unknown>): Geometry {
  return { ...geometry, properties };
}

// オブジェクトの名前をそろえ、コードの順に並べる（mapshaper の出力の順に頼らず、いつも同じ文字列にするため）
function serialize(topology: AnyTopology, name: string, geometries: readonly Geometry[]): string {
  const sorted = [...geometries].sort((a, b) => compareCodes(String(propertiesOf(a).code), String(propertiesOf(b).code)));
  return JSON.stringify({ ...topology, objects: { [name]: { type: 'GeometryCollection', geometries: sorted } } });
}

// ロケールに左右されない比較（コードは数字の文字列）
function compareCodes(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function round(value: number): number {
  const factor = 10 ** LABEL_DIGITS;
  return Math.round(value * factor) / factor;
}

function assertGzipSize(files: ReadonlyMap<string, string>, maxBytes: number): void {
  const oversized = [...files].map(([prefCode, json]) => [prefCode, gzipSize(json)] as const).filter(([, size]) => size > maxBytes);
  if (oversized.length > 0) {
    const list = oversized.map(([prefCode, size]) => `${prefCode}: ${size} B`).join('、');
    throw new Error(`圧縮後の大きさが基準（${maxBytes} B）を超える県があります（${list}）。簡略化の度合いを見直す`);
  }
}
