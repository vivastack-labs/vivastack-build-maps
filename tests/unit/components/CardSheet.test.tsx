import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CardSheet } from '@/components/CardSheet';
import { CardSwitch } from '@/components/CardSwitch';
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
  test('マウントすると data-sheet が付き、バーのボタンの hidden が外れる', () => {
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

  test('F-MAP-05：サーバーの出力（JavaScript の前）には data-sheet がなく、バーは hidden', () => {
    // Arrange・Act：ハイドレーションの前の HTML を、サーバーの描画で確かめる
    const html = renderToStaticMarkup(<Fixture />);

    // Assert
    expect(html).not.toContain('data-sheet=');
    expect(html).toMatch(/<div[^>]*data-sheet-bar[^>]*hidden/u);
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
});
