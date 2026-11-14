import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MuniLoader } from '@/features/map/muniLoader';

// L-3：アプリで1つの既定の読み込み部品 `muniLoader` を、ブラウザの `fetch`・`navigator.onLine` の置き換えで動かす。
// キャッシュがテストの間で残らないよう、毎回モジュールを読み込み直す。

const validBody = {
  type: 'Topology',
  arcs: [],
  objects: { municipalities: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [], properties: { code: '20201', name: { ja: '長野市', en: 'Nagano-shi' }, kana: 'ながのし' } }] } }
};

async function freshLoader(): Promise<MuniLoader> {
  vi.resetModules();
  return (await import('@/features/map/muniLoader')).muniLoader;
}

describe('muniLoader（既定のインスタンス）', () => {
  beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('F-MUNI-05: ブラウザの fetch で /geo/muni/NN.topo.json を読み、signal を渡す', async () => {
    const fetchStub = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(validBody) }));
    vi.stubGlobal('fetch', fetchStub);
    const loader = await freshLoader();

    const result = await loader.load('20', () => undefined);

    expect(result.kind).toBe('loaded');
    expect(fetchStub).toHaveBeenCalledWith('/geo/muni/20.topo.json', { signal: expect.any(AbortSignal) });
  });

  test('4.11.5: navigator.onLine が false のときの fetch の失敗はオフラインになる', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('navigator', { onLine: false });
    const loader = await freshLoader();

    expect(await loader.load('20', () => undefined)).toEqual({ kind: 'offline' });
  });

  test('navigator がない環境での fetch の失敗は通信エラーになる', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('navigator', undefined);
    const loader = await freshLoader();

    expect(await loader.load('20', () => undefined)).toEqual({ kind: 'failed', reason: 'network' });
  });
});
