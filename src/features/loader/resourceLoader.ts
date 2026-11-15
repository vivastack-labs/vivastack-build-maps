// 県ごとのデータ（市区町村の TopoJSON・カードの JSON）の読み込みの共通の部品（T2-07・T3-09、F-MUNI-05、4.11.5）。
// DOM・React は使わない。fetch・オンラインの判定・タイマーは外から受け取る（単体テストで置き換えるため）。
// 読み込みの状態の流れ（loading → slow → loaded／failed／offline）、15秒の打ち切り、成功だけのキャッシュ、同じキーの読み込みの1回へのまとめは、ここだけに書く。

/**
 * 1回の読み込み（応答の本文まで）に待つ上限（ミリ秒。4.11.5）。超えたら打ち切って失敗にする（応答が来ないまま「読み込み中」が続かないように）。
 * 打ち切りは、fetch の失敗と同じく、オフラインか通信エラーかに分ける。
 */
export const FETCH_TIMEOUT_MS = 15_000;

/** 「読み込み中」を出すまでの時間（ミリ秒）。これ以内に終わったら出さない（ちらつき防止。4.11.5） */
export const SLOW_THRESHOLD_MS = 300;

/** 読み込みの失敗の種類。通信エラー・HTTP のエラー（404 など）・データの形の不正 */
export type LoadFailureReason = 'network' | 'http' | 'invalid';

/** 読み込みの状態（4.11.5）。`slow` は 300ms を超えても終わらないとき */
export type LoadStatus<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'slow' }
  | { readonly kind: 'loaded'; readonly data: T }
  | { readonly kind: 'failed'; readonly reason: LoadFailureReason }
  | { readonly kind: 'offline' };

/** `fetch` の応答のうち、使う部分だけ */
export type LoadResponse = { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };

/** 外から受け取る部品 */
export type LoaderDeps = {
  /** `signal` が中断されたら、応答の待ちも本文の読み込みも reject にする（`fetch` の `signal`） */
  readonly fetch: (url: string, init: { readonly signal: AbortSignal }) => Promise<LoadResponse>;
  /** 1回の読み込みの上限（ミリ秒）。省くと `FETCH_TIMEOUT_MS` */
  readonly fetchTimeoutMs?: number;
  /** オンラインか（`navigator.onLine`） */
  readonly isOnline: () => boolean;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

/** 読み込むものごとに違う部分 */
export type ResourceSpec<T> = {
  /** キー（県コード）から URL を作る。キーの形を確かめた後に呼ぶ */
  readonly url: (key: string) => string;
  /** キーの形か（境界。合わなければ fetch せずに例外にする） */
  readonly isKey: (key: string) => boolean;
  /** キーの形が合わないときの例外の文 */
  readonly invalidKeyMessage: (key: string) => string;
  /** 読み込んだ JSON が、使う形かを確かめる。合えば値、合わなければ `null` */
  readonly validate: (json: unknown, key: string) => T | null;
};

/** 読み込みの結果（途中の状態を除く） */
export type LoadResult<T> = Exclude<LoadStatus<T>, { readonly kind: 'loading' | 'slow' }>;

/** 読み込み部品 */
export type ResourceLoader<T> = {
  /**
   * キーのデータを読み込む。`onStatus` には `loading` →（300ms を超えたら `slow`）→ 結果、の順に渡す。
   * 成功したものはメモリに残し、2回目からは `loaded` だけを渡す。失敗は残さない（呼び直せば fetch し直す。自動では再試行しない）。
   * キーの形が合わなければ、fetch せずに例外にする。
   */
  load(key: string, onStatus: (status: LoadStatus<T>) => void): Promise<LoadResult<T>>;
};

/** fetch の例外を、オフラインか通信エラーかに分ける */
const toFetchFailure = <T>(isOnline: () => boolean): LoadResult<T> => (isOnline() ? { kind: 'failed', reason: 'network' } : { kind: 'offline' });

/** 打ち切り用の `signal` を付けて1回 fetch し、検証まで行う。例外にはせず、結果の状態で返す */
async function request<T>(key: string, spec: ResourceSpec<T>, deps: LoaderDeps, signal: AbortSignal): Promise<LoadResult<T>> {
  let response: LoadResponse;
  try {
    response = await deps.fetch(spec.url(key), { signal });
  } catch {
    return toFetchFailure(deps.isOnline);
  }
  if (!response.ok) return { kind: 'failed', reason: 'http' };
  try {
    const data = spec.validate(await response.json(), key);
    return data === null ? { kind: 'failed', reason: 'invalid' } : { kind: 'loaded', data };
  } catch {
    // 打ち切りで本文の読み込みが止まったときは通信の失敗。それ以外は本文が JSON でない
    return signal.aborted ? toFetchFailure(deps.isOnline) : { kind: 'failed', reason: 'invalid' };
  }
}

/** 1回の読み込み。上限（`fetchTimeoutMs`）を超えたら中断する。タイマーは終わったら必ず止める */
async function fetchResource<T>(key: string, spec: ResourceSpec<T>, deps: LoaderDeps): Promise<LoadResult<T>> {
  const controller = new AbortController();
  const timer = deps.setTimeout(() => controller.abort(), deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    return await request(key, spec, deps, controller.signal);
  } finally {
    deps.clearTimeout(timer);
  }
}

/**
 * 読み込み部品を作る。成功のキャッシュと、読み込み中の Promise は、作った部品ごとに持つ。
 * キーの形は境界（ここ）で確かめる。
 */
export function createResourceLoader<T>(spec: ResourceSpec<T>, deps: LoaderDeps): ResourceLoader<T> {
  const loaded = new Map<string, LoadResult<T>>();
  const inFlight = new Map<string, Promise<LoadResult<T>>>();

  const fetchOnce = (key: string): Promise<LoadResult<T>> => {
    const running = inFlight.get(key);
    if (running) return running;
    const started = fetchResource(key, spec, deps)
      .then(result => {
        if (result.kind === 'loaded') loaded.set(key, result);
        return result;
      })
      // 失敗（reject）でも読み込み中の印を残さない。残すと、次の load が古い Promise を待ち続ける
      .finally(() => inFlight.delete(key));
    inFlight.set(key, started);
    return started;
  };

  return {
    async load(key, onStatus) {
      if (!spec.isKey(key)) throw new Error(spec.invalidKeyMessage(key));
      const cached = loaded.get(key);
      if (cached) {
        onStatus(cached);
        return cached;
      }
      onStatus({ kind: 'loading' });
      const timer = deps.setTimeout(() => onStatus({ kind: 'slow' }), SLOW_THRESHOLD_MS);
      try {
        const result = await fetchOnce(key);
        onStatus(result);
        return result;
      } finally {
        // 結果が出たら、「読み込み中」の通知は止める（例外のときも）
        deps.clearTimeout(timer);
      }
    }
  };
}

/** ブラウザの `fetch`・`navigator.onLine`・タイマーを使う、アプリの読み込み部品の外から受け取る部品 */
export const BROWSER_LOADER_DEPS: LoaderDeps = {
  /** ブラウザの fetch */
  fetch: (url, init) => fetch(url, init),
  /** `navigator.onLine`（サーバーでは true） */
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  /** グローバルの setTimeout */
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  /** グローバルの clearTimeout */
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};
