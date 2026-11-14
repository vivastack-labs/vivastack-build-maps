import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useMuniShapes } from '@/components/useMuniShapes';
import type { MuniLoader, MuniLoadStatus, MuniTopology } from '@/features/map/muniLoader';
import { gridTopology } from '../features/map/muni-fixtures';

/** 呼ばれたら、決めた結果をすぐに通知する読み込み部品（県コードごとのデータを `make` で作る） */
function loaderReturning(make: (code: string) => MuniTopology) {
  const load = vi.fn((code: string, onStatus: (status: MuniLoadStatus) => void) => {
    const result = { kind: 'loaded', data: make(code) } as const;
    onStatus(result);
    return Promise.resolve(result);
  });
  return { load, loader: { load } as unknown as MuniLoader };
}

/** 変換（setTimeout(0)）を進める */
const runConversion = () => act(() => vi.advanceTimersByTime(0));

describe('useMuniShapes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('最大化していなければ、状態は null', () => {
    const { loader } = loaderReturning(gridTopology);

    const { result } = renderHook(() => useMuniShapes(null, loader));

    expect(result.current.status).toBeNull();
  });

  test('F-MUNI-01: 読み込めたら、描画の外（次のタスク）で変換し、描くもの（shapes）を付けて loaded にする', () => {
    const data = gridTopology('20');
    const { loader } = loaderReturning(() => data);

    const { result } = renderHook(() => useMuniShapes('20', loader));

    // 変換が終わるまでは、loaded でも shapes がない（読み込み中のまま）
    expect(result.current.status).toEqual({ kind: 'loading' });
    runConversion();
    const { status } = result.current;
    expect(status?.kind).toBe('loaded');
    if (status?.kind === 'loaded') {
      expect(status.data).toBe(data);
      expect(status.shapes.shapes).toHaveLength(4);
    }
  });

  test('T2-07：変換に失敗したら、変換の後に failed（invalid）になる', () => {
    const { loader } = loaderReturning(code => ({ ...gridTopology(code), arcs: [] }) as unknown as MuniTopology);

    const { result } = renderHook(() => useMuniShapes('20', loader));
    expect(result.current.status).toEqual({ kind: 'loading' });
    runConversion();

    expect(result.current.status).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  test('同じデータをすでに変換していたら、待たずに loaded になる（2つ目の部品・同じ県をもう一度最大化したとき）', () => {
    const data = gridTopology('20');
    const { loader } = loaderReturning(() => data);
    const first = renderHook(() => useMuniShapes('20', loader));
    runConversion();
    expect(first.result.current.status?.kind).toBe('loaded');

    const second = renderHook(() => useMuniShapes('20', loader));

    expect(second.result.current.status?.kind).toBe('loaded');
  });

  test('最大化を解除すると、変換を止め、古い結果を使わない', () => {
    const { loader } = loaderReturning(gridTopology);
    const { result, rerender } = renderHook(({ pref }) => useMuniShapes(pref, loader), { initialProps: { pref: '20' as string | null } });
    expect(vi.getTimerCount()).toBe(1);

    rerender({ pref: null });
    runConversion();

    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.status).toBeNull();
  });

  test('別の県に切り替えると、前の県の結果ではなく、その県の結果になる', () => {
    const { loader } = loaderReturning(gridTopology);
    const { result, rerender } = renderHook(({ pref }) => useMuniShapes(pref, loader), { initialProps: { pref: '20' as string | null } });
    runConversion();
    expect(result.current.status?.kind).toBe('loaded');

    rerender({ pref: '21' });
    expect(result.current.status?.kind).not.toBe('loaded');
    runConversion();

    const { status } = result.current;
    expect(status?.kind === 'loaded' && status.shapes.shapes.every(shape => shape.code.startsWith('21'))).toBe(true);
  });

  test('アンマウントすると、変換の待ちを止める', () => {
    const { loader } = loaderReturning(gridTopology);
    const { unmount } = renderHook(() => useMuniShapes('20', loader));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  test('読み込み中などの状態は、そのまま返す', () => {
    const load = vi.fn((_code: string, onStatus: (status: MuniLoadStatus) => void) => {
      onStatus({ kind: 'loading' });
      return new Promise<never>(() => undefined);
    });
    const loader = { load } as unknown as MuniLoader;

    const { result } = renderHook(() => useMuniShapes('20', loader));

    expect(result.current.status).toEqual({ kind: 'loading' });
    expect(result.current.isRetrying).toBe(false);
  });
});
