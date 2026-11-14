import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMuniLoader, FETCH_TIMEOUT_MS, MUNI_BASE_PATH, SLOW_THRESHOLD_MS, validateMuniTopology, type MuniResponse, type MuniLoadStatus } from '@/features/map/muniLoader';

const CODE = '20';

/** 検証を通る、長野県のファイル（の縮小版） */
const validTopology = () => ({
  type: 'Topology',
  arcs: [],
  objects: {
    municipalities: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [], properties: { code: '20201', name: { ja: '長野市', en: 'Nagano-shi' }, kana: 'ながのし' } },
        { type: 'Polygon', arcs: [], properties: { code: '20202', name: { ja: '松本市', en: 'Matsumoto-shi' }, kana: 'まつもとし', cityName: undefined } }
      ]
    }
  }
});

const okResponse = (body: unknown = validTopology()): MuniResponse => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const httpResponse = (status: number): MuniResponse => ({ ok: false, status, json: () => Promise.reject(new Error('本文なし')) });

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
  const statuses: MuniLoadStatus[] = [];
  return { statuses, kinds: () => statuses.map(status => status.kind), onStatus: (status: MuniLoadStatus) => void statuses.push(status) };
}

type FetchInit = { readonly signal: AbortSignal };

function setup(fetchImpl: (url: string, init: FetchInit) => Promise<MuniResponse>, isOnline: boolean | (() => boolean) = true, fetchTimeoutMs?: number) {
  const fetch = vi.fn(fetchImpl);
  const loader = createMuniLoader({
    fetch,
    isOnline: typeof isOnline === 'function' ? isOnline : () => isOnline,
    ...(fetchTimeoutMs === undefined ? {} : { fetchTimeoutMs }),
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
  });
  return { fetch, loader };
}

describe('createMuniLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('F-MUNI-05: 300ms以内に終わったら slow にならない（4.11.5）', async () => {
    const response = deferred<MuniResponse>();
    const { loader } = setup(() => response.promise);
    const { kinds, onStatus } = recorder();

    const done = loader.load(CODE, onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS - 1);
    response.resolve(okResponse());
    await done;
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS * 2);

    expect(kinds()).toEqual(['loading', 'loaded']);
  });

  test('F-MUNI-05: 300msを超えたら slow になる（4.11.5）', async () => {
    const response = deferred<MuniResponse>();
    const { loader } = setup(() => response.promise);
    const { kinds, onStatus } = recorder();

    const done = loader.load(CODE, onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS);
    expect(kinds()).toEqual(['loading', 'slow']);
    response.resolve(okResponse());
    await done;

    expect(kinds()).toEqual(['loading', 'slow', 'loaded']);
  });

  test('F-MUNI-05: 成功すると、検証を通った TopoJSON を loaded で返す', async () => {
    const { loader } = setup(() => Promise.resolve(okResponse()));
    const { statuses, onStatus } = recorder();

    const result = await loader.load(CODE, onStatus);

    expect(result.kind).toBe('loaded');
    expect(result).toEqual(statuses.at(-1));
    if (result.kind === 'loaded') expect(result.data.objects.municipalities.geometries).toHaveLength(2);
  });

  test('F-MUNI-05: 404 は失敗（http）になる', async () => {
    const { loader } = setup(() => Promise.resolve(httpResponse(404)));
    const { kinds, onStatus } = recorder();

    const result = await loader.load(CODE, onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'http' });
    expect(kinds()).toEqual(['loading', 'failed']);
  });

  test('F-MUNI-05: 通信エラーは失敗（network）になる', async () => {
    const { loader } = setup(() => Promise.reject(new TypeError('Failed to fetch')), true);

    const result = await loader.load(CODE, recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'network' });
  });

  const invalidBodies: readonly (readonly [string, () => Promise<unknown>])[] = [
    ['JSON でない本文', () => Promise.reject(new SyntaxError('Unexpected token <'))],
    ['null', () => Promise.resolve(null)],
    ['type が Topology でない', () => Promise.resolve({ ...validTopology(), type: 'FeatureCollection' })],
    ['arcs が配列でない', () => Promise.resolve({ ...validTopology(), arcs: {} })],
    ['objects.municipalities がない', () => Promise.resolve({ ...validTopology(), objects: {} })],
    ['municipalities が GeometryCollection でない', () => Promise.resolve({ ...validTopology(), objects: { municipalities: { type: 'Polygon', arcs: [] } } })],
    ['geometries が配列でない', () => Promise.resolve({ ...validTopology(), objects: { municipalities: { type: 'GeometryCollection', geometries: 1 } } })]
  ];
  test.each(invalidBodies)('F-MUNI-05: 形が不正なデータは失敗（invalid）になる：%s', async (_name, body) => {
    const { loader } = setup(() => Promise.resolve({ ok: true, status: 200, json: body }));

    const result = await loader.load(CODE, recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  const invalidProperties: readonly (readonly [string, unknown])[] = [
    ['properties がない', undefined],
    ['code が文字列でない', { code: 20201, name: { ja: '長野市', en: 'Nagano-shi' }, kana: 'ながのし' }],
    ['code が県コードで始まらない', { code: '21201', name: { ja: '岐阜市', en: 'Gifu-shi' }, kana: 'ぎふし' }],
    ['code が5桁でない', { code: '2020', name: { ja: '長野市', en: 'Nagano-shi' }, kana: 'ながのし' }],
    ['name がない', { code: '20201', kana: 'ながのし' }],
    ['name.ja が文字列でない', { code: '20201', name: { ja: 1, en: 'Nagano-shi' }, kana: 'ながのし' }],
    ['name.en が文字列でない', { code: '20201', name: { ja: '長野市', en: null }, kana: 'ながのし' }],
    ['kana が文字列でない', { code: '20201', name: { ja: '長野市', en: 'Nagano-shi' }, kana: ['ながのし'] }]
  ];
  test.each(invalidProperties)('F-MUNI-05: geometries の要素の属性が不正なら失敗（invalid）になる：%s', async (_name, properties) => {
    const body = validTopology();
    body.objects.municipalities.geometries = [{ type: 'Polygon', arcs: [], properties } as never];
    const { loader } = setup(() => Promise.resolve(okResponse(body)));

    const result = await loader.load(CODE, recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('F-MUNI-05: 別の県のファイルが返ってきたら失敗（invalid）になる', async () => {
    const { loader } = setup(() => Promise.resolve(okResponse()));

    const result = await loader.load('21', recorder().onStatus);

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('F-MUNI-05: オフラインでの失敗はオフラインの状態になる（4.11.5）', async () => {
    const { loader } = setup(() => Promise.reject(new TypeError('Failed to fetch')), false);
    const { kinds, onStatus } = recorder();

    const result = await loader.load(CODE, onStatus);

    expect(result).toEqual({ kind: 'offline' });
    expect(kinds()).toEqual(['loading', 'offline']);
  });

  test('F-MUNI-05: 同じ県の2回目は fetch しない', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));
    await loader.load(CODE, recorder().onStatus);
    const second = recorder();

    const result = await loader.load(CODE, second.onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS * 2);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('loaded');
    expect(second.kinds()).toEqual(['loaded']);
  });

  test('F-MUNI-05: 失敗の後の再読み込みは fetch し直す（再試行）', async () => {
    const responses = [httpResponse(404), okResponse()];
    const { fetch, loader } = setup(() => Promise.resolve(responses.shift() as MuniResponse));

    const first = await loader.load(CODE, recorder().onStatus);
    const second = await loader.load(CODE, recorder().onStatus);

    expect(first.kind).toBe('failed');
    expect(second.kind).toBe('loaded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('F-MUNI-05: 読み込み中の同じ県は fetch を1回にまとめる', async () => {
    const response = deferred<MuniResponse>();
    const { fetch, loader } = setup(() => response.promise);
    const a = recorder();
    const b = recorder();

    const first = loader.load(CODE, a.onStatus);
    const second = loader.load(CODE, b.onStatus);
    response.resolve(okResponse());
    const results = await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.map(result => result.kind)).toEqual(['loaded', 'loaded']);
    expect(a.kinds()).toEqual(['loading', 'loaded']);
    expect(b.kinds()).toEqual(['loading', 'loaded']);
  });

  test('F-MUNI-05: 自動では再試行しない', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(httpResponse(404)));
    await loader.load(CODE, recorder().onStatus);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(['48', '00', '../x', '2', '200', 'constructor'])('県コードでない値（%s）は fetch せずに例外にする', async code => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await expect(loader.load(code, recorder().onStatus)).rejects.toThrow(/県コード/u);

    expect(fetch).not.toHaveBeenCalled();
  });

  /** signal が中断されたら、AbortError で reject する（応答が来ないままの fetch） */
  const hangUntilAborted = (_url: string, { signal }: FetchInit) =>
    new Promise<MuniResponse>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });

  test('4.11.5: 応答が15秒を超えたら打ち切り、失敗（network）になる', async () => {
    const { loader } = setup(hangUntilAborted, true);
    const { kinds, onStatus } = recorder();

    const done = loader.load(CODE, onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(kinds()).toEqual(['loading', 'slow']);
    await vi.advanceTimersByTimeAsync(1);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
    expect(kinds()).toEqual(['loading', 'slow', 'failed']);
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
  });

  test('4.11.5: 打ち切りのとき、オフラインならオフラインの状態になる（4.11.5）', async () => {
    const { loader } = setup(hangUntilAborted, false);

    const done = loader.load(CODE, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

    expect(await done).toEqual({ kind: 'offline' });
  });

  test('4.11.5: 本文の読み込み中に15秒を超えても打ち切り、失敗（invalid ではなく network）になる', async () => {
    const stalledBody = (_url: string, { signal }: FetchInit): Promise<MuniResponse> =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          })
      });
    const { loader } = setup(stalledBody, true);

    const done = loader.load(CODE, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
  });

  test('4.11.5: 上限は deps で変えられる', async () => {
    const { loader } = setup(hangUntilAborted, true, 1000);

    const done = loader.load(CODE, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await done).toEqual({ kind: 'failed', reason: 'network' });
  });

  test('4.11.5: 時間内に終わったら中断しない（タイマーは止まる）', async () => {
    let signal: AbortSignal | undefined;
    const { loader } = setup((_url, init) => {
      signal = init.signal;
      return Promise.resolve(okResponse());
    });

    await loader.load(CODE, recorder().onStatus);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * 2);

    expect(signal?.aborted).toBe(false);
  });

  test('F-MUNI-05: 読み込み中の Promise が reject しても残らず、次の load は fetch し直す', async () => {
    let isOnlineCalls = 0;
    const isOnline = () => {
      isOnlineCalls += 1;
      if (isOnlineCalls === 1) throw new Error('isOnline が例外');
      return true;
    };
    const responses = [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(okResponse())];
    const { fetch, loader } = setup(() => (responses.shift() as () => Promise<MuniResponse>)(), isOnline);

    await expect(loader.load(CODE, recorder().onStatus)).rejects.toThrow('isOnline が例外');
    const second = await loader.load(CODE, recorder().onStatus);

    expect(second.kind).toBe('loaded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('F-MUNI-05: 読み込み中の Promise を共有した2つ目の呼び出しにも、300ms後に slow が届く', async () => {
    const response = deferred<MuniResponse>();
    const { loader } = setup(() => response.promise);
    const a = recorder();
    const b = recorder();

    const first = loader.load(CODE, a.onStatus);
    await vi.advanceTimersByTimeAsync(100);
    const second = loader.load(CODE, b.onStatus);
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

  test('URL は /geo/muni/NN.topo.json', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await loader.load('01', recorder().onStatus);

    expect(MUNI_BASE_PATH).toBe('/geo/muni/');
    expect(fetch).toHaveBeenCalledWith('/geo/muni/01.topo.json', { signal: expect.any(AbortSignal) });
  });
});

describe('validateMuniTopology', () => {
  const withProperties = (properties: unknown) => {
    const topology = validTopology();
    topology.objects.municipalities.geometries = [{ type: 'Polygon', arcs: [], properties } as never];
    return topology;
  };
  const muni = { code: '20201', name: { ja: '長野市', en: 'Nagano-shi' }, kana: 'ながのし' };

  test('F-MUNI-05: geometries が空なら不正', () => {
    const topology = validTopology();
    topology.objects.municipalities.geometries = [];

    expect(validateMuniTopology(topology, CODE)).toBeNull();
  });

  test.each(['2020a', '２０２０１', '20 01', '20.01'])('F-MUNI-05: code が数字5桁でなければ不正：%s', code => {
    expect(validateMuniTopology(withProperties({ ...muni, code }), CODE)).toBeNull();
  });

  test('F-MUNI-05: cityName は文字列か、なくてもよい。文字列でなければ不正', () => {
    expect(validateMuniTopology(withProperties({ ...muni, cityName: '長野市' }), CODE)).not.toBeNull();
    expect(validateMuniTopology(withProperties({ ...muni, cityName: undefined }), CODE)).not.toBeNull();
    expect(validateMuniTopology(withProperties({ ...muni, cityName: 1 }), CODE)).toBeNull();
    expect(validateMuniTopology(withProperties({ ...muni, cityName: null }), CODE)).toBeNull();
  });

  test('県コードで始まる5桁の code を持つ TopoJSON をそのまま返す', () => {
    const topology = validTopology();

    expect(validateMuniTopology(topology, CODE)).toBe(topology);
  });

  test('配列・文字列・undefined は null にする', () => {
    expect(validateMuniTopology([], CODE)).toBeNull();
    expect(validateMuniTopology('Topology', CODE)).toBeNull();
    expect(validateMuniTopology(undefined, CODE)).toBeNull();
  });
});
