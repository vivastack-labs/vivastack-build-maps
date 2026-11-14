// 市区町村データ（`public/geo/muni/NN.topo.json`）の読み込み（T2-07、F-MUNI-05、4.11.5）。
// DOM・React は使わない。fetch・オンラインの判定・タイマーは外から受け取る（単体テストで置き換えるため）。

import type { GeometryCollection, Topology } from 'topojson-specification';
import { PREF_CODE_PATTERN } from './projection.ts';

/** 市区町村データを置いているパス（県コード + `.topo.json` を続ける） */
export const MUNI_BASE_PATH = '/geo/muni/';

/** 「読み込み中」を出すまでの時間（ミリ秒）。これ以内に終わったら出さない（ちらつき防止。4.11.5） */
export const SLOW_THRESHOLD_MS = 300;

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
export type MuniFailureReason = 'network' | 'http' | 'invalid';

/** 読み込みの状態（4.11.5）。`slow` は 300ms を超えても終わらないとき */
export type MuniStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'slow' }
  | { readonly kind: 'loaded'; readonly data: MuniTopology }
  | { readonly kind: 'failed'; readonly reason: MuniFailureReason }
  | { readonly kind: 'offline' };

/** `fetch` の応答のうち、使う部分だけ */
export type MuniResponse = { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };

/** 外から受け取る部品 */
export type MuniLoaderDeps = {
  readonly fetch: (url: string) => Promise<MuniResponse>;
  /** オンラインか（`navigator.onLine`） */
  readonly isOnline: () => boolean;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

/** 読み込みの結果（途中の状態を除く） */
type MuniResult = Exclude<MuniStatus, { readonly kind: 'loading' | 'slow' }>;

/** 市区町村データの読み込み部品 */
export type MuniLoader = {
  /**
   * 県（県コード）の市区町村データを読み込む。`onStatus` には `loading` →（300ms を超えたら `slow`）→ 結果、の順に渡す。
   * 成功したものはメモリに残し、2回目からは `loaded` だけを渡す。失敗は残さない（呼び直せば fetch し直す。自動では再試行しない）。
   * 県コードでなければ、fetch せずに例外にする。
   */
  load(code: string, onStatus: (status: MuniStatus) => void): Promise<MuniResult>;
};

const MUNI_CODE_LENGTH = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

/** 市区町村の属性が、使う形（`code` は県コードで始まる5桁、`name.ja`・`name.en`・`kana` は文字列）かを確かめる */
function isMuniProperties(properties: unknown, prefCode: string): boolean {
  if (!isRecord(properties) || !isString(properties.code)) return false;
  if (properties.code.length !== MUNI_CODE_LENGTH || !properties.code.startsWith(prefCode)) return false;
  const { name } = properties;
  return isRecord(name) && isString(name.ja) && isString(name.en) && isString(properties.kana);
}

/**
 * 読み込んだ JSON が、使う形の市区町村の TopoJSON かを簡単に確かめる（4.11.5）。
 * 確かめるのは `type`・`arcs`・`objects.municipalities`・各要素の属性だけで、`arcs` の中身と座標は見ない（大きなファイルで時間がかかるため。ファイル自体は CI が検査している）。
 * 合えば受け取った値をそのまま、合わなければ `null` を返す。
 */
export function validateMuniTopology(json: unknown, prefCode: string): MuniTopology | null {
  if (!isRecord(json) || json.type !== 'Topology' || !Array.isArray(json.arcs) || !isRecord(json.objects)) return null;
  const collection = json.objects.municipalities;
  if (!isRecord(collection) || collection.type !== 'GeometryCollection' || !Array.isArray(collection.geometries)) return null;
  const isValid = collection.geometries.every(geometry => isRecord(geometry) && isMuniProperties(geometry.properties, prefCode));
  return isValid ? (json as unknown as MuniTopology) : null;
}

/** fetch の例外を、オフラインか通信エラーかに分ける */
const toFetchFailure = (isOnline: () => boolean): MuniResult => (isOnline() ? { kind: 'failed', reason: 'network' } : { kind: 'offline' });

/** 1回 fetch して、検証まで行う。例外にはせず、結果の状態で返す */
async function fetchMuni(code: string, deps: MuniLoaderDeps): Promise<MuniResult> {
  let response: MuniResponse;
  try {
    response = await deps.fetch(`${MUNI_BASE_PATH}${code}.topo.json`);
  } catch {
    return toFetchFailure(deps.isOnline);
  }
  if (!response.ok) return { kind: 'failed', reason: 'http' };
  try {
    const data = validateMuniTopology(await response.json(), code);
    return data === null ? { kind: 'failed', reason: 'invalid' } : { kind: 'loaded', data };
  } catch {
    // 本文が JSON でない
    return { kind: 'failed', reason: 'invalid' };
  }
}

/**
 * 市区町村データの読み込み部品を作る。成功のキャッシュと、読み込み中の Promise は、作った部品ごとに持つ。
 * 県コードの形は境界（ここ）で確かめる。
 */
export function createMuniLoader(deps: MuniLoaderDeps): MuniLoader {
  const loaded = new Map<string, MuniResult>();
  const inFlight = new Map<string, Promise<MuniResult>>();

  const fetchOnce = (code: string): Promise<MuniResult> => {
    const running = inFlight.get(code);
    if (running) return running;
    const started = fetchMuni(code, deps).then(result => {
      inFlight.delete(code);
      if (result.kind === 'loaded') loaded.set(code, result);
      return result;
    });
    inFlight.set(code, started);
    return started;
  };

  return {
    async load(code, onStatus) {
      if (!PREF_CODE_PATTERN.test(code)) throw new Error(`県コードではありません：${code}`);
      const cached = loaded.get(code);
      if (cached) {
        onStatus(cached);
        return cached;
      }
      onStatus({ kind: 'loading' });
      const timer = deps.setTimeout(() => onStatus({ kind: 'slow' }), SLOW_THRESHOLD_MS);
      // fetchOnce は例外にならない（失敗は結果の状態で返る）ので、タイマーはここで必ず止まる
      const result = await fetchOnce(code);
      deps.clearTimeout(timer);
      onStatus(result);
      return result;
    }
  };
}

/** ブラウザの `fetch`・`navigator.onLine` を使う、アプリで1つの読み込み部品（地図とカードの一覧が同じキャッシュを使う） */
export const muniLoader: MuniLoader = createMuniLoader({
  fetch: url => fetch(url),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
});
