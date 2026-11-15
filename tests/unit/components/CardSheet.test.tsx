import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CardSheet } from '@/components/CardSheet';
import { CardSwitch } from '@/components/CardSwitch';
import { HashSync } from '@/components/HashSync';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { SHEET_QUERY } from '@/features/map/sheet';
import { getMessages } from '@/i18n/messages';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 768px 未満かどうかを差し替える（jsdom には matchMedia がない） */
const stubSheetWidth = (isNarrow: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: isNarrow && query === SHEET_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
};

/** 状態（固定・最大化）を文字にして出す。操作は、サーバーの出力の県の要素の代わりのボタンから送る */
function Probe() {
  const { state, dispatch } = useMapState();
  return (
    <div>
      <output data-testid="state">{`pinned=${state.pinned ?? ''} maximized=${state.maximized ?? ''}`}</output>
      <button type="button" onClick={() => dispatch({ type: 'hover', pref: '13' })}>
        hover-13
      </button>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '13' })}>
        pin-13
      </button>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '01' })}>
        pin-01
      </button>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '13' })}>
        maximize-13
      </button>
    </div>
  );
}

/** サーバーの出力と同じ形（カードは hidden で始まる）。地図の県のパス・さくいんの項目の代わりに、`data-pref` を持つ要素を置く */
function Fixture() {
  return (
    <MapStateProvider>
      <svg>
        <path data-pref="13" tabIndex={0} />
      </svg>
      <a href="#pref-13" data-pref="13" data-testid="index-13">
        東京都
      </a>
      <a href="#pref-01" data-pref="01" data-testid="index-01">
        北海道
      </a>
      <CardSheet labels={getMessages('en').sheet}>
        <CardSwitch>
          <p data-card-guide>案内文</p>
          <article data-card-pref="13" hidden>
            <h2 data-card-name tabIndex={-1}>
              東京都
            </h2>
          </article>
          <article data-card-pref="01" hidden>
            <h2 data-card-name tabIndex={-1}>
              北海道
            </h2>
          </article>
        </CardSwitch>
      </CardSheet>
      <Probe />
    </MapStateProvider>
  );
}

const panel = (container: HTMLElement) => container.querySelector('[data-area="card"]') as HTMLElement;
const state = () => screen.getByTestId('state').textContent;
const pin = (code: '13' | '01' = '13') => fireEvent.click(screen.getByText(`pin-${code}`));

describe('CardSheet', () => {
  test('マウントすると、バーのボタンの hidden が外れる（data-sheet は最初から closed）', () => {
    // Arrange・Act
    const { container } = render(<Fixture />);

    // Assert
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
    const bar = container.querySelector('[data-sheet-bar]') as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  test('F-MAP-05：マウントしてしばらくしてから data-sheet-motion を付ける（最初の配置の切り替えを動かさない）', async () => {
    // Arrange・Act
    const { container } = render(<Fixture />);

    // Assert：マウントの直後にはまだない。数フレーム後に付く
    expect(panel(container).hasAttribute('data-sheet-motion')).toBe(false);
    await waitFor(() => expect(panel(container).hasAttribute('data-sheet-motion')).toBe(true));
  });

  test('F-MAP-05（CLS を出さない）：サーバーの出力（JavaScript の前）に data-sheet="closed" があり、バーは hidden', () => {
    // Arrange・Act：ハイドレーションの前の HTML を、サーバーの描画で確かめる
    const html = renderToStaticMarkup(<Fixture />);

    // Assert
    expect(html).toMatch(/<section[^>]*data-area="card"[^>]*data-sheet="closed"|<section[^>]*data-sheet="closed"[^>]*data-area="card"/u);
    expect(html).toMatch(/<div[^>]*data-sheet-bar[^>]*hidden/u);
  });

  test('サーバーの出力とハイドレーションで食い違わず、警告が出ない', async () => {
    // Arrange：サーバーの HTML を作り、その上にハイドレーションする
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Fixture />);
    document.body.append(container);

    // Act
    await act(async () => {
      hydrateRoot(container, <Fixture />);
    });

    // Assert
    expect(errors).not.toHaveBeenCalled();
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
    expect((container.querySelector('[data-sheet-bar]') as HTMLElement).hidden).toBe(false);
    errors.mockRestore();
    container.remove();
  });

  test('4.11.3：固定するとパネルが peek で開き、固定を外すと closed になる', () => {
    // Arrange
    const { container } = render(<Fixture />);

    // Act・Assert
    pin();
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
    pin();
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
  });

  test('4.11.3：マウスのホバー（固定なし）ではパネルは開かない', () => {
    // Arrange
    const { container } = render(<Fixture />);

    // Act
    fireEvent.click(screen.getByText('hover-13'));

    // Assert
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
  });

  test('「くわしく」で full、「たたむ」で peek（aria-expanded）。閉じて開き直すと peek に戻る', () => {
    // Arrange
    const { container } = render(<Fixture />);
    pin();

    // Act・Assert：広げる
    const toggle = screen.getByRole('button', { name: 'More' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(panel(container).getAttribute('data-sheet')).toBe('full');
    expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');

    // Act・Assert：たたむ
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');

    // Act・Assert：広げたまま閉じ、開き直すと peek
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    pin();
    pin();
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
  });

  test('固定したまま別の県に切り替えても、広げた状態は変わらない', () => {
    // Arrange
    const { container } = render(<Fixture />);
    pin('13');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    // Act：固定中に別の県をクリックすると、固定がその県に移る
    pin('01');

    // Assert
    expect(state()).toBe('pinned=01 maximized=');
    expect(panel(container).getAttribute('data-sheet')).toBe('full');
  });

  test('4.11.3：「とじる」で closeCard を送り、固定も最大化も解除する', () => {
    // Arrange
    const { container } = render(<Fixture />);
    fireEvent.click(screen.getByText('maximize-13'));
    expect(state()).toBe('pinned=13 maximized=13');

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(state()).toBe('pinned= maximized=');
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
  });

  test('4.11.6：開くと県名の見出しにフォーカスし、閉じると開く前にフォーカスがあった要素に戻す', () => {
    // Arrange：さくいんの項目にフォーカスがある
    stubSheetWidth(true);
    render(<Fixture />);
    const indexItem = screen.getByTestId('index-13');
    indexItem.focus();

    // Act・Assert：開く
    pin();
    expect(document.activeElement).toBe(document.querySelector('[data-card-pref="13"] h2'));

    // Act・Assert：パネルの中のボタンから閉じる
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(indexItem);
  });

  test('4.11.6：開く前にフォーカスのあった県の要素がなければ、地図の県のパスに戻す', () => {
    // Arrange：フォーカスはどこにもない
    stubSheetWidth(true);
    render(<Fixture />);

    // Act
    pin();
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(document.activeElement).toBe(document.querySelector('path[data-pref="13"]'));
  });

  test('4.11.6：閉じる前にフォーカスがパネルの外にあれば、フォーカスを奪わない', () => {
    // Arrange：開いたあと、フォーカスをパネルの外のボタンへ移す（海のタップで閉じる場合と同じ）
    stubSheetWidth(true);
    render(<Fixture />);
    pin();
    const outside = screen.getByText('pin-01');
    outside.focus();

    // Act：固定を外す（同じ県の click）
    pin('13');

    // Assert
    expect(document.activeElement).toBe(outside);
  });

  test('768px 以上ではフォーカスを動かさない', () => {
    // Arrange
    stubSheetWidth(false);
    render(<Fixture />);
    const indexItem = screen.getByTestId('index-13');
    indexItem.focus();

    // Act
    pin();

    // Assert
    expect(document.activeElement).toBe(indexItem);
  });

  test('matchMedia がない環境でも、フォーカスを動かさずに動く', () => {
    // Arrange・Act・Assert
    vi.stubGlobal('matchMedia', undefined);
    const { container } = render(<Fixture />);
    pin();
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
  });

  test('4.11.3：パネルの中で Esc を押すと、固定を解除して閉じる（修飾キーつき・繰り返しは無視）', () => {
    // Arrange
    stubSheetWidth(true);
    const { container } = render(<Fixture />);
    pin();
    const heading = document.querySelector('[data-card-pref="13"] h2') as HTMLElement;

    // Act・Assert：Ctrl つき・繰り返しは無視する
    fireEvent.keyDown(heading, { key: 'Escape', ctrlKey: true });
    fireEvent.keyDown(heading, { key: 'Escape', repeat: true });
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
    fireEvent.keyDown(heading, { key: 'a' });
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');

    // Act・Assert：Esc で閉じる
    fireEvent.keyDown(heading, { key: 'Escape' });
    expect(state()).toBe('pinned= maximized=');
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
  });

  test('4.11.2：最大化中のパネルの Esc は、最大化だけを解く（パネルは開いたまま）', () => {
    // Arrange
    stubSheetWidth(true);
    const { container } = render(<Fixture />);
    fireEvent.click(screen.getByText('maximize-13'));

    // Act
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });

    // Assert
    expect(state()).toBe('pinned=13 maximized=');
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
  });

  test('パネルにならない幅（768px 以上）では、パネルの中の Esc は何もしない', () => {
    // Arrange
    stubSheetWidth(false);
    render(<Fixture />);
    pin();

    // Act
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });

    // Assert
    expect(state()).toBe('pinned=13 maximized=');
  });

  test('4.11.6：開いたまま別の県に固定を移したとき、フォーカスが外の県の要素にあれば、戻り先をそれに更新する', () => {
    // Arrange：さくいんの項目（13）から開く
    stubSheetWidth(true);
    render(<Fixture />);
    screen.getByTestId('index-13').focus();
    pin('13');

    // Act：地図の別の県の要素にフォーカスして、固定をその県に移し、パネルの「とじる」で閉じる
    const other = screen.getByTestId('index-01');
    other.focus();
    pin('01');
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert：最初の項目（13）ではなく、直前の県の要素（01）に戻る
    expect(document.activeElement).toBe(other);
  });

  test('4.11.6：覚えた要素が DOM から消えていたら、地図の県のパスに戻す', () => {
    // Arrange
    stubSheetWidth(true);
    render(<Fixture />);
    // React の管理の外の要素（消しても片付けで失敗しない）にフォーカスして、固定する
    const indexItem = document.createElement('a');
    indexItem.setAttribute('data-pref', '13');
    indexItem.tabIndex = 0;
    document.body.append(indexItem);
    indexItem.focus();
    pin();
    indexItem.remove();

    // Act
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(document.activeElement).toBe(document.querySelector('path[data-pref="13"]'));
  });

  test('768px 以上で固定してから狭くして「とじる」を押しても、地図の県のパスに戻る（覚えた要素なし）', () => {
    // Arrange：広い幅で固定する（フォーカスは動かない）
    stubSheetWidth(false);
    render(<Fixture />);
    pin();

    // Act：狭くして、パネルの中のボタンから閉じる
    stubSheetWidth(true);
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(document.activeElement).toBe(document.querySelector('path[data-pref="13"]'));
  });

  test('--sheet-h：開いている間、パネルの高さを html に書き、閉じたら消す', () => {
    // Arrange：jsdom には ResizeObserver がないので、通知を自分で起こす
    let notify: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const { container, unmount } = render(<Fixture />);
    Object.defineProperty(panel(container), 'offsetHeight', { configurable: true, value: 180 });

    // Act・Assert
    pin();
    notify();
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('180px');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('');
  });

  test('T3-07・WCAG 3.2.1：ハッシュの復元で開いたときは、パネルを開くがフォーカスを移さない', () => {
    // Arrange：768px 未満で、ハッシュつきの URL を開く（利用者の操作はまだない）
    stubSheetWidth(true);
    window.history.replaceState(null, '', '/en/#pref-13');
    const before = document.activeElement;

    // Act
    const { container } = render(
      <MapStateProvider>
        <HashSync />
        <CardSheet labels={getMessages('en').sheet}>
          <CardSwitch>
            <article data-card-pref="13" hidden>
              <h2 data-card-name tabIndex={-1}>
                東京都
              </h2>
            </article>
          </CardSwitch>
        </CardSheet>
      </MapStateProvider>
    );

    // Assert
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');
    expect(document.activeElement).toBe(before);
    expect(document.activeElement).toBe(document.body);
    window.history.replaceState(null, '', '/');
  });

  test('T3-07：復元で開いたあと、利用者が閉じて固定し直したときは、フォーカスを移す', () => {
    // Arrange：ハッシュで復元して開いている
    stubSheetWidth(true);
    window.history.replaceState(null, '', '/en/#pref-13');
    const { container } = render(
      <MapStateProvider>
        <HashSync />
        <CardSheet labels={getMessages('en').sheet}>
          <CardSwitch>
            <article data-card-pref="13" hidden>
              <h2 data-card-name tabIndex={-1}>
                東京都
              </h2>
            </article>
          </CardSwitch>
        </CardSheet>
        <Probe />
      </MapStateProvider>
    );
    expect(panel(container).getAttribute('data-sheet')).toBe('peek');

    // Act：利用者の操作で閉じ、また固定する
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(panel(container).getAttribute('data-sheet')).toBe('closed');
    pin();

    // Assert
    expect(document.activeElement).toBe(document.querySelector('[data-card-pref="13"] h2'));
    window.history.replaceState(null, '', '/');
  });
});
