// 市区町村データ（`public/geo/muni/NN.topo.json`）の読み込み（T2-07、F-MUNI-05、4.11.5）。
// DOM・React は使わない。fetch・オンラインの判定・タイマーは外から受け取る（単体テストで置き換えるため）。

import type { GeometryCollection, Topology } from 'topojson-specification';
import { PREF_CODE_PATTERN } from './projection.ts';

/** 市区町村データを置いているパス（県コード + `.topo.json` を続ける） */
export const MUNI_BASE_PATH = '/geo/muni/';

/**
 * 1回の読み込み（応答の本文まで）に待つ上限（ミリ秒。4.11.5）。超えたら打ち切って失敗にする（応答が来ないまま「読み込み中」が続かないように）。
 * 打ち切りは、fetch の失敗と同じく、オフラインか通信エラーかに分ける。
 */
export const FETCH_TIMEOUT_MS = 15_000;

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
export type MuniLoadStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'slow' }
  | { readonly kind: 'loaded'; readonly data: MuniTopology }
  | { readonly kind: 'failed'; readonly reason: MuniFailureReason }
  | { readonly kind: 'offline' };

/** `fetch` の応答のうち、使う部分だけ */
export type MuniResponse = { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };

/** 外から受け取る部品 */
export type MuniLoaderDeps = {
  /** `signal` が中断されたら、応答の待ちも本文の読み込みも reject にする（`fetch` の `signal`） */
  readonly fetch: (url: string, init: { readonly signal: AbortSignal }) => Promise<MuniResponse>;
  /** 1回の読み込みの上限（ミリ秒）。省くと `FETCH_TIMEOUT_MS` */
  readonly fetchTimeoutMs?: number;
  /** オンラインか（`navigator.onLine`） */
  readonly isOnline: () => boolean;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

/** 読み込みの結果（途中の状態を除く） */
type MuniResult = Exclude<MuniLoadStatus, { readonly kind: 'loading' | 'slow' }>;

/** 市区町村データの読み込み部品 */
export type MuniLoader = {
  /**
   * 県（県コード）の市区町村データを読み込む。`onStatus` には `loading` →（300ms を超えたら `slow`）→ 結果、の順に渡す。
   * 成功したものはメモリに残し、2回目からは `loaded` だけを渡す。失敗は残さない（呼び直せば fetch し直す。自動では再試行しない）。
   * 県コードでなければ、fetch せずに例外にする。
   */
  load(code: string, onStatus: (status: MuniLoadStatus) => void): Promise<MuniResult>;
};

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

/** fetch の例外を、オフラインか通信エラーかに分ける */
const toFetchFailure = (isOnline: () => boolean): MuniResult => (isOnline() ? { kind: 'failed', reason: 'network' } : { kind: 'offline' });

/** 打ち切り用の `signal` を付けて1回 fetch し、検証まで行う。例外にはせず、結果の状態で返す */
async function request(code: string, deps: MuniLoaderDeps, signal: AbortSignal): Promise<MuniResult> {
  let response: MuniResponse;
  try {
    response = await deps.fetch(`${MUNI_BASE_PATH}${code}.topo.json`, { signal });
  } catch {
    return toFetchFailure(deps.isOnline);
  }
  if (!response.ok) return { kind: 'failed', reason: 'http' };
  try {
    const data = validateMuniTopology(await response.json(), code);
    return data === null ? { kind: 'failed', reason: 'invalid' } : { kind: 'loaded', data };
  } catch {
    // 打ち切りで本文の読み込みが止まったときは通信の失敗。それ以外は本文が JSON でない
    return signal.aborted ? toFetchFailure(deps.isOnline) : { kind: 'failed', reason: 'invalid' };
  }
}

/** 1回の読み込み。上限（`fetchTimeoutMs`）を超えたら中断する。タイマーは終わったら必ず止める */
async function fetchMuni(code: string, deps: MuniLoaderDeps): Promise<MuniResult> {
  const controller = new AbortController();
  const timer = deps.setTimeout(() => controller.abort(), deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    return await request(code, deps, controller.signal);
  } finally {
    deps.clearTimeout(timer);
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
    const started = fetchMuni(code, deps)
      .then(result => {
        if (result.kind === 'loaded') loaded.set(code, result);
        return result;
      })
      // 失敗（reject）でも読み込み中の印を残さない。残すと、次の load が古い Promise を待ち続ける
      .finally(() => inFlight.delete(code));
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
      try {
        const result = await fetchOnce(code);
        onStatus(result);
        return result;
      } finally {
        // 結果が出たら、「読み込み中」の通知は止める（例外のときも）
        deps.clearTimeout(timer);
      }
    }
  };
}

/** ブラウザの `fetch`・`navigator.onLine` を使う、アプリで1つの読み込み部品（地図とカードの一覧が同じキャッシュを使う） */
export const muniLoader: MuniLoader = createMuniLoader({
  fetch: (url, init) => fetch(url, init),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
});
