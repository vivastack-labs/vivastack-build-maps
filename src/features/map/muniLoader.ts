// 市区町村データ（`public/geo/muni/NN.topo.json`）の読み込み（T2-07、F-MUNI-05、4.11.5）。
// DOM・React は使わない。fetch・オンラインの判定・タイマーは外から受け取る（単体テストで置き換えるため）。

import type { GeometryCollection, Topology } from 'topojson-specification';
import {
  BROWSER_LOADER_DEPS,
  createResourceLoader,
  FETCH_TIMEOUT_MS,
  SLOW_THRESHOLD_MS,
  type LoadFailureReason,
  type LoaderDeps,
  type LoadResponse,
  type LoadStatus,
  type ResourceLoader
} from '../loader/resourceLoader.ts';
import { PREF_CODE_PATTERN } from './projection.ts';

export { FETCH_TIMEOUT_MS, SLOW_THRESHOLD_MS };

/** 市区町村データを置いているパス（県コード + `.topo.json` を続ける） */
export const MUNI_BASE_PATH = '/geo/muni/';

/** 市区町村の属性（`geo/README.md`）。`cityName` は政令指定都市の区だけにある */
export type MuniProperties = {
  readonly code: string;
  readonly name: { readonly ja: string; readonly en: string };
  readonly kana: string;
  readonly cityName?: string;
};

/** 検証を通った市区町村の TopoJSON。オブジェクト名は `municipalities` */
export type MuniTopology = Topology<{ municipalities: GeometryCollection<MuniProperties> }>;

/** 読み込みの失敗の種類。通信エラー・HTTP のエラー（404 など）・データの形の不正 */
export type MuniFailureReason = LoadFailureReason;

/** 読み込みの状態（4.11.5）。`slow` は 300ms を超えても終わらないとき */
export type MuniLoadStatus = LoadStatus<MuniTopology>;

/** `fetch` の応答のうち、使う部分だけ */
export type MuniResponse = LoadResponse;

/** 外から受け取る部品 */
export type MuniLoaderDeps = LoaderDeps;

/** 市区町村データの読み込み部品。`load(code, onStatus)` の流れは `ResourceLoader`（共通） */
export type MuniLoader = ResourceLoader<MuniTopology>;

const MUNI_CODE_PATTERN = /^\d{5}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

/** 市区町村の属性が、使う形（`code` は県コードで始まる5桁の数字、`name.ja`・`name.en`・`kana` は文字列、`cityName` は文字列かなし）かを確かめる */
function isMuniProperties(properties: unknown, prefCode: string): boolean {
  if (!isRecord(properties) || !isString(properties.code)) return false;
  if (!MUNI_CODE_PATTERN.test(properties.code) || !properties.code.startsWith(prefCode)) return false;
  if (properties.cityName !== undefined && !isString(properties.cityName)) return false;
  const { name } = properties;
  return isRecord(name) && isString(name.ja) && isString(name.en) && isString(properties.kana);
}

/**
 * 読み込んだ JSON が、使う形の市区町村の TopoJSON かを簡単に確かめる（4.11.5）。
 * 確かめるのは `type`・`arcs`・`objects.municipalities`（空でない）・各要素の属性だけで、各要素の `type`・`arcs` と座標は見ない（大きなファイルで時間がかかるため。ファイル自体は CI が検査している）。
 * 合えば受け取った値をそのまま、合わなければ `null` を返す。
 */
export function validateMuniTopology(json: unknown, prefCode: string): MuniTopology | null {
  if (!isRecord(json) || json.type !== 'Topology' || !Array.isArray(json.arcs) || !isRecord(json.objects)) return null;
  const collection = json.objects.municipalities;
  if (!isRecord(collection) || collection.type !== 'GeometryCollection' || !Array.isArray(collection.geometries) || collection.geometries.length === 0) return null;
  const isValid = collection.geometries.every(geometry => isRecord(geometry) && isMuniProperties(geometry.properties, prefCode));
  return isValid ? (json as unknown as MuniTopology) : null;
}

/** 市区町村データの読み込み部品を作る（`createResourceLoader` に URL と検証を渡す）。県コードの形は境界（ここ）で確かめる */
export function createMuniLoader(deps: MuniLoaderDeps): MuniLoader {
  return createResourceLoader<MuniTopology>(
    {
      url: code => `${MUNI_BASE_PATH}${code}.topo.json`,
      isKey: code => PREF_CODE_PATTERN.test(code),
      invalidKeyMessage: code => `県コードではありません：${code}`,
      validate: validateMuniTopology
    },
    deps
  );
}

/** ブラウザの `fetch`・`navigator.onLine` を使う、アプリで1つの読み込み部品（地図とカードの一覧が同じキャッシュを使う） */
export const muniLoader: MuniLoader = createMuniLoader(BROWSER_LOADER_DEPS);
