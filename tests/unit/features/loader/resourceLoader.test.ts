import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createResourceLoader, FETCH_TIMEOUT_MS, SLOW_THRESHOLD_MS, type LoadResponse, type LoadStatus } from '@/features/loader/resourceLoader';

// 読み込みの状態の流れ（4.11.5）は、市区町村（T2-07）とカード（T3-09）で共通。ここは中身の形に関係なく確かめる
type Payload = { readonly key: string };

const KEY = '20';
const VALID_KEY = /^\d{2}$/u;

const okResponse = (body: unknown = { key: KEY }): LoadResponse => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const httpResponse = (status: number): LoadResponse => ({ ok: false, status, json: () => Promise.reject(new Error('本文なし')) });

/** 外から解決できる Promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 通知された状態の種類の並びを記録する onStatus */
function recorder() {
  const statuses: LoadStatus<Payload>[] = [];
  return { statuses, kinds: () => statuses.map(status => status.kind), onStatus: (status: LoadStatus<Payload>) => void statuses.push(status) };
}

type FetchInit = { readonly signal: AbortSignal };

function setup(fetchImpl: (url: string, init: FetchInit) => Promise<LoadResponse>, isOnline: boolean | (() => boolean) = true, fetchTimeoutMs?: number) {
  const fetch = vi.fn(fetchImpl);
  const loader = createResourceLoader<Payload>(
    {
      url: key => `/test/${key}.json`,
      isKey: key => VALID_KEY.test(key),
      invalidKeyMessage: key => `キーではありません：${key}`,
      validate: (json, key) => (typeof json === 'object' && json !== null && (json as { key?: unknown }).key === key ? (json as Payload) : null)
    },
    {
      fetch,
      isOnline: typeof isOnline === 'function' ? isOnline : () => isOnline,
      ...(fetchTimeoutMs === undefined ? {} : { fetchTimeoutMs }),
      setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
      clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
    }
  );
  return { fetch, loader };
}

describe('createResourceLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('4.11.5: 300ms以内に終わったら slow にならない', async () => {
    const response = deferred<LoadResponse>();
    const { loader } = setup(() => response.promise);
    const { kinds, onStatus } = recorder();

    const done = loader.load(KEY, onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS - 1);
    response.resolve(okResponse());
    await done;
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS * 2);

    expect(kinds()).toEqual(['loading', 'loaded']);
  });

  test('4.11.5: 300msを超えたら slow になる', async () => {
    const response = deferred<LoadResponse>();
    const { loader } = setup(() => response.promise);
    const { kinds, onStatus } = recorder();

    const done = loader.load(KEY, onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS);
    expect(kinds()).toEqual(['loading', 'slow']);
    response.resolve(okResponse());
    await done;

    expect(kinds()).toEqual(['loading', 'slow', 'loaded']);
  });

  test('4.11.5: 成功すると、検証を通った値を loaded で返す', async () => {
    const { loader } = setup(() => Promise.resolve(okResponse()));
    const { statuses, onStatus } = recorder();

    const result = await loader.load(KEY, onStatus);

    expect(result).toEqual({ kind: 'loaded', data: { key: KEY } });
    expect(result).toEqual(statuses.at(-1));
  });

  test('4.11.5: 404 は失敗（http）になる', async () => {
    const { loader } = setup(() => Promise.resolve(httpResponse(404)));
    const { kinds, onStatus } = recorder();

    const result = await loader.load(KEY, onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'http' });
    expect(kinds()).toEqual(['loading', 'failed']);
  });

  test('4.11.5: 通信エラーは失敗（network）になる', async () => {
    const { loader } = setup(() => Promise.reject(new TypeError('Failed to fetch')), true);

    const result = await loader.load(KEY, recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'network' });
  });

  test.each([
    ['JSON でない本文', () => Promise.reject(new SyntaxError('Unexpected token <'))],
    ['検証に合わない値', () => Promise.resolve({ key: '21' })],
    ['null', () => Promise.resolve(null)]
  ] as const)('4.11.5: 形が不正なデータは失敗（invalid）になる：%s', async (_name, body) => {
    const { loader } = setup(() => Promise.resolve({ ok: true, status: 200, json: body }));

    const result = await loader.load(KEY, recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('4.11.5: オフラインでの失敗はオフラインの状態になる', async () => {
    const { loader } = setup(() => Promise.reject(new TypeError('Failed to fetch')), false);
    const { kinds, onStatus } = recorder();

    const result = await loader.load(KEY, onStatus);

    expect(result).toEqual({ kind: 'offline' });
    expect(kinds()).toEqual(['loading', 'offline']);
  });

  test('4.11.5: 同じキーの2回目は fetch しない', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));
    await loader.load(KEY, recorder().onStatus);
    const second = recorder();

    const result = await loader.load(KEY, second.onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS * 2);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('loaded');
    expect(second.kinds()).toEqual(['loaded']);
  });

  test('4.11.5: 失敗の後の再読み込みは fetch し直す（再試行）', async () => {
    const responses = [httpResponse(404), okResponse()];
    const { fetch, loader } = setup(() => Promise.resolve(responses.shift() as LoadResponse));

    const first = await loader.load(KEY, recorder().onStatus);
    const second = await loader.load(KEY, recorder().onStatus);

    expect(first.kind).toBe('failed');
    expect(second.kind).toBe('loaded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('4.11.5: 読み込み中の同じキーは fetch を1回にまとめる', async () => {
    const response = deferred<LoadResponse>();
    const { fetch, loader } = setup(() => response.promise);
    const a = recorder();
    const b = recorder();

    const first = loader.load(KEY, a.onStatus);
    const second = loader.load(KEY, b.onStatus);
    response.resolve(okResponse());
    const results = await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.map(result => result.kind)).toEqual(['loaded', 'loaded']);
    expect(a.kinds()).toEqual(['loading', 'loaded']);
    expect(b.kinds()).toEqual(['loading', 'loaded']);
  });

  test('4.11.5: 自動では再試行しない', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(httpResponse(404)));
    await loader.load(KEY, recorder().onStatus);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(['2', '200', '../x', 'ab', 'constructor'])('キーでない値（%s）は fetch せずに、spec の文言の例外にする', async key => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await expect(loader.load(key, recorder().onStatus)).rejects.toThrow(`キーではありません：${key}`);

    expect(fetch).not.toHaveBeenCalled();
  });

  /** signal が中断されたら、AbortError で reject する（応答が来ないままの fetch） */
  const hangUntilAborted = (_url: string, { signal }: FetchInit) =>
    new Promise<LoadResponse>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });

  test('4.11.5: 応答が15秒を超えたら打ち切り、失敗（network）になる', async () => {
    const { loader } = setup(hangUntilAborted, true);
    const { kinds, onStatus } = recorder();

    const done = loader.load(KEY, onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(kinds()).toEqual(['loading', 'slow']);
    await vi.advanceTimersByTimeAsync(1);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
    expect(kinds()).toEqual(['loading', 'slow', 'failed']);
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
  });

  test('4.11.5: 打ち切りのとき、オフラインならオフラインの状態になる', async () => {
    const { loader } = setup(hangUntilAborted, false);

    const done = loader.load(KEY, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

    expect(await done).toEqual({ kind: 'offline' });
  });

  test('4.11.5: 本文の読み込み中に15秒を超えても打ち切り、失敗（invalid ではなく network）になる', async () => {
    const stalledBody = (_url: string, { signal }: FetchInit): Promise<LoadResponse> =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          })
      });
    const { loader } = setup(stalledBody, true);

    const done = loader.load(KEY, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
  });

  test('4.11.5: 上限は deps で変えられる', async () => {
    const { loader } = setup(hangUntilAborted, true, 1000);

    const done = loader.load(KEY, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
  });

  test('4.11.5: 時間内に終わったら中断しない（タイマーは止まる）', async () => {
    let signal: AbortSignal | undefined;
    const { loader } = setup((_url, init) => {
      signal = init.signal;
      return Promise.resolve(okResponse());
    });

    await loader.load(KEY, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * 2);

    expect(signal?.aborted).toBe(false);
  });

  test('4.11.5: 読み込み中の Promise が reject しても残らず、次の load は fetch し直す', async () => {
    let isOnlineCalls = 0;
    const isOnline = () => {
      isOnlineCalls += 1;
      if (isOnlineCalls === 1) throw new Error('isOnline が例外');
      return true;
    };
    const responses = [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(okResponse())];
    const { fetch, loader } = setup(() => (responses.shift() as () => Promise<LoadResponse>)(), isOnline);

    await expect(loader.load(KEY, recorder().onStatus)).rejects.toThrow('isOnline が例外');
    const second = await loader.load(KEY, recorder().onStatus);

    expect(second.kind).toBe('loaded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('4.11.5: 読み込み中の Promise を共有した2つ目の呼び出しにも、300ms後に slow が届く', async () => {
    const response = deferred<LoadResponse>();
    const { loader } = setup(() => response.promise);
    const a = recorder();
    const b = recorder();

    const first = loader.load(KEY, a.onStatus);
    await vi.advanceTimersByTimeAsync(100);
    const second = loader.load(KEY, b.onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS - 100);
    expect(a.kinds()).toEqual(['loading', 'slow']);
    expect(b.kinds()).toEqual(['loading']);
    await vi.advanceTimersByTimeAsync(100);
    expect(b.kinds()).toEqual(['loading', 'slow']);
    response.resolve(okResponse());
    await Promise.all([first, second]);

    expect(a.kinds()).toEqual(['loading', 'slow', 'loaded']);
    expect(b.kinds()).toEqual(['loading', 'slow', 'loaded']);
  });

  test('4.11.5: URL は spec の url(key)。signal を付けて fetch する', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await loader.load('01', recorder().onStatus);

    expect(fetch).toHaveBeenCalledWith('/test/01.json', { signal: expect.any(AbortSignal) });
  });
});
