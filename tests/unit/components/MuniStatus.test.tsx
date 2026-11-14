import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { MuniStatus } from '@/components/MuniStatus';
import type { MuniLoader, MuniStatus as LoadStatus } from '@/features/map/muniLoader';
import { getMessages } from '@/i18n/messages';

const labels = getMessages('ja').muni;

type Call = { readonly code: string; readonly notify: (status: LoadStatus) => void };

/** 読み込みが終わらない読み込み部品。呼ばれた記録と、状態を通知する関数を残す */
function fakeLoader() {
  const calls: Call[] = [];
  const load = vi.fn((code: string, onStatus: (status: LoadStatus) => void) => {
    calls.push({ code, notify: onStatus });
    onStatus({ kind: 'loading' });
    return new Promise<never>(() => undefined);
  });
  return { calls, load, loader: { load } as unknown as MuniLoader };
}

/** 最大化の状態を変える小さな部品 */
function Probe() {
  const { dispatch } = useMapState();
  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '20' })}>
        maximize-20
      </button>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '21' })}>
        maximize-21
      </button>
    </>
  );
}

function renderStatus(loader: MuniLoader) {
  const view = render(
    <MapStateProvider>
      <MuniStatus labels={labels} loader={loader} />
      <Probe />
    </MapStateProvider>
  );
  const root = () => view.container.querySelector('[data-muni-root]') as HTMLElement;
  return { ...view, root };
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const live = () => screen.getByRole('status');
const failed: LoadStatus = { kind: 'failed', reason: 'http' };

describe('MuniStatus', () => {
  test('F-MUNI-05: 最大化していなければ読み込まない。live 領域は最初から DOM にあり、空である', () => {
    const { load, loader } = fakeLoader();

    const { root } = renderStatus(loader);

    expect(load).not.toHaveBeenCalled();
    expect(live().getAttribute('aria-live')).toBe('polite');
    expect(live().textContent).toBe('');
    expect(root().hasAttribute('data-muni-status')).toBe(false);
  });

  test('F-MUNI-05: 最大化すると、その県を読み込む', () => {
    const { load, loader } = fakeLoader();
    const { root } = renderStatus(loader);

    press('maximize-20');

    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toBe('20');
    expect(root().getAttribute('data-muni-status')).toBe('loading');
    expect(live().textContent).toBe('');
  });

  test('4.11.5: slow になると「読み込み中」を aria-live="polite" の領域に出す', () => {
    const { calls, loader } = fakeLoader();
    renderStatus(loader);
    press('maximize-20');

    act(() => calls[0]?.notify({ kind: 'slow' }));

    expect(live().getAttribute('aria-live')).toBe('polite');
    expect(live().textContent).toContain('読');
    expect(live().textContent).toContain('中');
  });

  test('4.11.5: 失敗すると文言と「再試行」ボタンを出し、押すと読み込み直す', () => {
    const { calls, load, loader } = fakeLoader();
    const { root } = renderStatus(loader);
    press('maximize-20');

    act(() => calls[0]?.notify(failed));

    expect(root().getAttribute('data-muni-status')).toBe('failed');
    expect(live().textContent).toContain('市区町村');
    const retry = root().querySelector('[data-muni-retry]') as HTMLButtonElement;
    expect(retry.getAttribute('type')).toBe('button');
    // ボタンは live 領域の外
    expect(live().contains(retry)).toBe(false);

    fireEvent.click(retry);

    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.[0]).toBe('20');
    // 読み込み直すと、失敗の表示は消える
    expect(root().getAttribute('data-muni-status')).toBe('loading');
    expect(live().textContent).toBe('');
    expect(root().querySelector('[data-muni-retry]')).toBeNull();
  });

  test('4.11.5: オフラインなら「オフラインのため表示できません」と「再試行」', () => {
    const { calls, loader } = fakeLoader();
    const { root } = renderStatus(loader);
    press('maximize-20');

    act(() => calls[0]?.notify({ kind: 'offline' }));

    expect(root().getAttribute('data-muni-status')).toBe('offline');
    expect(live().textContent).toContain('オフライン');
    expect(root().querySelector('[data-muni-retry]')).not.toBeNull();
  });

  test('成功したら何も出さない（data-muni-status="loaded"）', () => {
    const { calls, loader } = fakeLoader();
    const { root } = renderStatus(loader);
    press('maximize-20');
    act(() => calls[0]?.notify({ kind: 'slow' }));

    act(() => calls[0]?.notify({ kind: 'loaded', data: {} as never }));

    expect(root().getAttribute('data-muni-status')).toBe('loaded');
    expect(live().textContent).toBe('');
    expect(root().querySelector('[data-muni-retry]')).toBeNull();
  });

  test('最大化を解除すると表示を消し、古い結果は使わない', () => {
    const { calls, loader } = fakeLoader();
    const { root } = renderStatus(loader);
    press('maximize-20');
    act(() => calls[0]?.notify({ kind: 'slow' }));

    press('maximize-20');
    expect(root().hasAttribute('data-muni-status')).toBe(false);
    expect(live().textContent).toBe('');
    act(() => calls[0]?.notify(failed));

    expect(root().hasAttribute('data-muni-status')).toBe(false);
    expect(live().textContent).toBe('');
    expect(root().querySelector('[data-muni-retry]')).toBeNull();
  });

  test('別の県に切り替えると、前の県の結果は使わない', () => {
    const { calls, loader } = fakeLoader();
    const { root } = renderStatus(loader);
    press('maximize-20');
    press('maximize-21');
    expect(calls.map(call => call.code)).toEqual(['20', '21']);

    act(() => calls[0]?.notify(failed));

    expect(root().getAttribute('data-muni-status')).toBe('loading');
    expect(live().textContent).toBe('');
  });

  test('読み込み部品が例外を返したら、失敗として表示する（握りつぶさない）', async () => {
    const load = vi.fn(() => Promise.reject(new Error('県コードではありません')));
    const { root } = renderStatus({ load } as unknown as MuniLoader);

    press('maximize-20');
    await act(() => Promise.resolve());

    expect(root().getAttribute('data-muni-status')).toBe('failed');
    expect(root().querySelector('[data-muni-retry]')).not.toBeNull();
  });
});
