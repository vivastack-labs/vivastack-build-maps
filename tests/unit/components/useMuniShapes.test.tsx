import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useMuniShapes } from '@/components/useMuniShapes';
import type { MuniLoader, MuniLoadStatus, MuniTopology } from '@/features/map/muniLoader';
import { gridTopology } from '../features/map/muni-fixtures';

/** 呼ばれたら、決めた結果を通知する読み込み部品 */
function loaderReturning(data: MuniTopology) {
  const load = vi.fn((_code: string, onStatus: (status: MuniLoadStatus) => void) => {
    onStatus({ kind: 'loaded', data });
    return Promise.resolve({ kind: 'loaded', data } as const);
  });
  return { load, loader: { load } as unknown as MuniLoader };
}

describe('useMuniShapes', () => {
  test('最大化していなければ、状態は null', () => {
    const { loader } = loaderReturning(gridTopology('20'));

    const { result } = renderHook(() => useMuniShapes(null, loader));

    expect(result.current.status).toBeNull();
  });

  test('F-MUNI-01: 読み込めたら、描くもの（shapes）を付けて loaded にする', async () => {
    const data = gridTopology('20');
    const { loader } = loaderReturning(data);

    const { result } = renderHook(() => useMuniShapes('20', loader));
    await act(async () => undefined);

    const { status } = result.current;
    expect(status?.kind).toBe('loaded');
    if (status?.kind === 'loaded') {
      expect(status.data).toBe(data);
      expect(status.shapes.shapes).toHaveLength(4);
    }
  });

  test('T2-07：変換に失敗したら failed（invalid）になる', async () => {
    const broken = { ...gridTopology('20'), arcs: [] } as unknown as MuniTopology;
    const { loader } = loaderReturning(broken);

    const { result } = renderHook(() => useMuniShapes('20', loader));
    await act(async () => undefined);

    expect(result.current.status).toEqual({ kind: 'failed', reason: 'invalid' });
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
