import { describe, expect, test, vi } from 'vitest';
import { createMuniLoader, MUNI_BASE_PATH, validateMuniTopology, type MuniResponse, type MuniLoadStatus } from '@/features/map/muniLoader';

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
  test('F-MUNI-05: 成功すると、検証を通った TopoJSON を loaded で返す', async () => {
    const { loader } = setup(() => Promise.resolve(okResponse()));
    const { statuses, onStatus } = recorder();

    const result = await loader.load(CODE, onStatus);

    expect(result.kind).toBe('loaded');
    expect(result).toEqual(statuses.at(-1));
    if (result.kind === 'loaded') expect(result.data.objects.municipalities.geometries).toHaveLength(2);
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

  test.each(['48', '00', '../x', '2', '200', 'constructor'])('県コードでない値（%s）は fetch せずに例外にする', async code => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await expect(loader.load(code, recorder().onStatus)).rejects.toThrow(/県コード/u);

    expect(fetch).not.toHaveBeenCalled();
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
