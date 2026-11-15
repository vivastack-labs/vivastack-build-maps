import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cardData } from '@/features/card/cardData';
import { CARD_BASE_PATH, cardUrl, createCardLoader } from '@/features/card/cardLoader';
import { FETCH_TIMEOUT_MS, SLOW_THRESHOLD_MS, type LoadResponse, type LoadStatus } from '@/features/loader/resourceLoader';
import type { CardData } from '@/features/card/cardData';
import type { PublishedPrefecture } from '@/lib/publish';
import { FIXTURE_DIR } from '../../lib/content-helpers';
import { publishedPrefectures } from '../../lib/published-helpers';

const hokkaido = publishedPrefectures(FIXTURE_DIR, 'production').find(p => p.code === '01') as PublishedPrefecture;
const body = () => JSON.parse(JSON.stringify(cardData(hokkaido, 'ja'))) as CardData;
const okResponse = (json: unknown = body()): LoadResponse => ({ ok: true, status: 200, json: () => Promise.resolve(json) });

function recorder() {
  const statuses: LoadStatus<CardData>[] = [];
  return { statuses, kinds: () => statuses.map(status => status.kind), onStatus: (status: LoadStatus<CardData>) => void statuses.push(status) };
}

function setup(fetchImpl: (url: string, init: { readonly signal: AbortSignal }) => Promise<LoadResponse>, isOnline = true, lang: 'ja' | 'en' | 'zh' = 'ja') {
  const fetch = vi.fn(fetchImpl);
  const loader = createCardLoader(lang, {
    fetch,
    isOnline: () => isOnline,
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
  });
  return { fetch, loader };
}

describe('createCardLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('D38：/cards/{lang}/NN.json を読み、loading → loaded を通知する', async () => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()), true, 'en');
    const { kinds, statuses, onStatus } = recorder();

    const result = await loader.load('01', onStatus);

    expect(fetch).toHaveBeenCalledWith('/cards/en/01.json', { signal: expect.any(AbortSignal) });
    expect(kinds()).toEqual(['loading', 'loaded']);
    expect(result.kind).toBe('loaded');
    expect(statuses.at(-1)).toEqual(result);
    expect(CARD_BASE_PATH).toBe('/cards/');
  });

  test('D38：300ms を超えると slow', async () => {
    let resolve!: (value: LoadResponse) => void;
    const { loader } = setup(() => new Promise<LoadResponse>(res => (resolve = res)));
    const { kinds, onStatus } = recorder();

    const done = loader.load('01', onStatus);
    await vi.advanceTimersByTimeAsync(SLOW_THRESHOLD_MS);
    expect(kinds()).toEqual(['loading', 'slow']);
    resolve(okResponse());
    await done;

    expect(kinds()).toEqual(['loading', 'slow', 'loaded']);
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
  });

  test('D38：HTTP の誤り・形の誤り・オフラインを分ける', async () => {
    const http = setup(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('x')) }));
    const invalid = setup(() => Promise.resolve(okResponse({ code: '02', specialties: [], spots: [] })));
    const offline = setup(() => Promise.reject(new TypeError('Failed to fetch')), false);

    expect(await http.loader.load('01', recorder().onStatus)).toEqual({ kind: 'failed', reason: 'http' });
    expect(await invalid.loader.load('01', recorder().onStatus)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await offline.loader.load('01', recorder().onStatus)).toEqual({ kind: 'offline' });
  });

  test('D38：同じ県の読み込みは1回にまとめ、成功だけを残す', async () => {
    const responses = [{ ok: false, status: 500, json: () => Promise.reject(new Error('x')) } as LoadResponse, okResponse()];
    const { fetch, loader } = setup(() => Promise.resolve(responses.shift() as LoadResponse));

    const failed = await loader.load('01', recorder().onStatus);
    const [a, b] = await Promise.all([loader.load('01', recorder().onStatus), loader.load('01', recorder().onStatus)]);
    const cached = recorder();
    await loader.load('01', cached.onStatus);

    expect(failed.kind).toBe('failed');
    expect([a.kind, b.kind]).toEqual(['loaded', 'loaded']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cached.kinds()).toEqual(['loaded']);
  });

  test.each(['00', '48', '1', '001', '../01', '01/../02', 'constructor', '01.json', ' 01'])('D38：県コードの許可リストにない値（%s）は fetch せずに例外にする', async code => {
    const { fetch, loader } = setup(() => Promise.resolve(okResponse()));

    await expect(loader.load(code, recorder().onStatus)).rejects.toThrow(/県コード/u);

    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(['fr', '../ja', 'ja/', '', 'JA'])('D38：言語でない値（%s）の読み込み部品は作れない（URL に自由な文字列を入れない）', lang => {
    expect(() => createCardLoader(lang as never, { fetch: vi.fn(), isOnline: () => true, setTimeout: vi.fn(), clearTimeout: vi.fn() })).toThrow(/言語/u);
  });
});

describe('cardUrl', () => {
  test('D38：URL は /cards/{lang}/NN.json', () => {
    expect(cardUrl('zh', '47')).toBe('/cards/zh/47.json');
  });

  test('D38：言語・県コードの形が合わなければ例外にする', () => {
    expect(() => cardUrl('xx' as never, '01')).toThrow();
    expect(() => cardUrl('ja', '99')).toThrow();
  });
});
