import { act, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { useMapState } from '@/components/MapStateProvider';
import type { MuniLoader, MuniLoadStatus, MuniTopology } from '@/features/map/muniLoader';
import { gridTopology } from '../features/map/muni-fixtures';

/** 呼ばれたら、すぐに読み込めたと通知する読み込み部品。県コードで格子の TopoJSON を作る */
export function loadedLoader(make: (code: string) => MuniTopology = gridTopology) {
  const load = vi.fn((code: string, onStatus: (status: MuniLoadStatus) => void) => {
    const result = { kind: 'loaded', data: make(code) } as const;
    onStatus(result);
    return Promise.resolve(result);
  });
  return { load, loader: { load } as unknown as MuniLoader };
}

/** 県を最大化・解除する小さな部品（`MapStateProvider` の中に置く） */
export function Probe() {
  const { dispatch } = useMapState();
  return (
    <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '20' })}>
      toggle-20
    </button>
  );
}

/** `Probe` のボタンを押し、変換（`useMuniShapes` が setTimeout(0) で行う）が終わるまで待つ */
export async function toggleMaximize(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'toggle-20' }));
  await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}
