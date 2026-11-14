import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { CardSwitch } from '@/components/CardSwitch';
import { MapInteraction } from '@/components/MapInteraction';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { MapZoomContext, type MapZoomControls } from '@/components/MapZoom';

// 地図（svg）とカードを小さく組む。県のパスはサーバーの出力と同じく aria-pressed="false" で始める
function Fixture() {
  return (
    <MapStateProvider>
      <MapInteraction>
        <svg>
          <rect data-testid="sea" />
          <path data-testid="tokyo" data-pref="13" aria-pressed="false" />
          <path data-testid="hokkaido" data-pref="01" aria-pressed="false" />
        </svg>
      </MapInteraction>
      <CardSwitch>
        <p data-card-guide>案内文</p>
        <p data-card-pref="13" hidden>
          東京都
        </p>
        <p data-card-pref="01" hidden>
          北海道
        </p>
      </CardSwitch>
    </MapStateProvider>
  );
}

const mouseOver = (element: Element) => fireEvent.pointerOver(element, { pointerType: 'mouse' });
const mouseOut = (element: Element, relatedTarget: Element | null = null) => fireEvent.pointerOut(element, { pointerType: 'mouse', relatedTarget });

/** マウスでの1回のクリック（pointerdown → click） */
function mouseClick(element: Element) {
  fireEvent.pointerDown(element, { pointerType: 'mouse' });
  fireEvent.click(element);
}

function touchTap(element: Element) {
  fireEvent.pointerDown(element, { pointerType: 'touch' });
  fireEvent.click(element);
}

const visibleCard = () => [...document.querySelectorAll<HTMLElement>('[data-card-pref]')].filter(card => !card.hidden).map(card => card.textContent);

describe('MapInteraction', () => {
  test('F-CARD-01：マウスで県にのると、カードの県名が変わる', () => {
    render(<Fixture />);
    expect(screen.getByText('案内文')).toBeVisible();

    mouseOver(screen.getByTestId('tokyo'));
    expect(visibleCard()).toEqual(['東京都']);
    expect(screen.getByText('案内文')).not.toBeVisible();

    mouseOut(screen.getByTestId('tokyo'));
    mouseOver(screen.getByTestId('hokkaido'));
    expect(visibleCard()).toEqual(['北海道']);
  });

  test('4.11.1：県から海へマウスを動かしても、カードは残る', () => {
    render(<Fixture />);
    mouseOver(screen.getByTestId('tokyo'));

    mouseOut(screen.getByTestId('tokyo'), screen.getByTestId('sea'));

    expect(visibleCard()).toEqual(['東京都']);
  });

  test('F-CARD-07：クリックで固定すると aria-pressed が true になり、別の県にのってもカードが変わらない', () => {
    render(<Fixture />);

    mouseClick(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'pinned');
    mouseOver(screen.getByTestId('hokkaido'));

    expect(visibleCard()).toEqual(['東京都']);
    expect(screen.getByTestId('hokkaido')).toHaveAttribute('aria-pressed', 'false');
  });

  test('4.11.2：同じ県のクリックと海のクリックで固定が解除される', () => {
    render(<Fixture />);
    mouseClick(screen.getByTestId('tokyo'));
    mouseClick(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');

    mouseClick(screen.getByTestId('tokyo'));
    mouseClick(screen.getByTestId('sea'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('tokyo')).not.toHaveAttribute('data-state');
  });

  test('F-ZOOM-04：ダブルクリックで最大化と固定になる', () => {
    render(<Fixture />);

    fireEvent.pointerDown(screen.getByTestId('tokyo'), { pointerType: 'mouse' });
    fireEvent.dblClick(screen.getByTestId('tokyo'));

    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'maximized');
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
    expect(visibleCard()).toEqual(['東京都']);
  });

  test('4.11.3：タッチでは、のってもカードが変わらず、ダブルクリックしても最大化しない', () => {
    render(<Fixture />);

    fireEvent.pointerOver(screen.getByTestId('tokyo'), { pointerType: 'touch' });
    expect(visibleCard()).toEqual([]);

    touchTap(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'pinned');
    fireEvent.dblClick(screen.getByTestId('tokyo'));

    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'pinned');
  });

  test('マウントすると data-map-ready が付く', () => {
    const { container } = render(<Fixture />);

    expect(container.querySelector('[data-map-ready]')).not.toBeNull();
  });
});

/** 県のパスはサーバーの出力と同じく、北海道だけ tabindex=0 で始める。キーボードの操作の確かめに使う */
function KeyboardFixture({ zoom = null }: { readonly zoom?: MapZoomControls | null }) {
  return (
    <MapZoomContext value={zoom}>
      <MapStateProvider>
        <button type="button" data-testid="outside">
          外
        </button>
        <MapInteraction>
          <svg>
            <path data-testid="hokkaido" data-pref="01" tabIndex={0} aria-pressed="false" />
            <path data-testid="aomori" data-pref="02" tabIndex={-1} aria-pressed="false" />
            <path data-testid="tokyo" data-pref="13" tabIndex={-1} aria-pressed="false" />
            <path data-testid="okinawa" data-pref="47" tabIndex={-1} aria-pressed="false" />
          </svg>
        </MapInteraction>
        <CardSwitch>
          <p data-card-guide>案内文</p>
          <p data-card-pref="02" hidden>
            青森県
          </p>
        </CardSwitch>
      </MapStateProvider>
    </MapZoomContext>
  );
}

const byId = (id: string) => screen.getByTestId(id);
const focus = (id: string) => act(() => byId(id).focus());
/** キーを押す。既定の動作が止められたかを返す（`fireEvent` の戻り値は「止められていない」） */
const press = (id: string, key: string, init: KeyboardEventInit = {}): boolean => !fireEvent.keyDown(byId(id), { key, ...init });
const tabStops = () => [...document.querySelectorAll('[data-pref]')].filter(path => path.getAttribute('tabindex') === '0').map(path => path.getAttribute('data-pref'));

describe('MapInteraction: キーボード', () => {
  test('F-KB-01: 最初の停止位置は北海道だけ', () => {
    render(<KeyboardFixture />);

    expect(tabStops()).toEqual(['01']);
  });

  test('F-KB-01: 固定中の県が Tab の停止位置になり、固定を外すと北海道に戻る', () => {
    render(<KeyboardFixture />);

    mouseClick(byId('tokyo'));
    expect(tabStops()).toEqual(['13']);

    mouseClick(byId('tokyo'));
    expect(tabStops()).toEqual(['01']);
  });

  test('F-KB-01: → で次の県にフォーカスが移り、停止位置も移る', () => {
    render(<KeyboardFixture />);
    focus('hokkaido');

    const isPrevented = press('hokkaido', 'ArrowRight');

    expect(isPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('aomori'));
    expect(tabStops()).toEqual(['02']);
  });

  test('4.11.6: ← ↑ は前の県、↓ は次の県、Home は北海道、End は沖縄県に移る。端では止まる', () => {
    render(<KeyboardFixture />);
    focus('aomori');

    press('aomori', 'End');
    expect(document.activeElement).toBe(byId('okinawa'));
    press('okinawa', 'ArrowRight');
    expect(document.activeElement).toBe(byId('okinawa'));
    press('okinawa', 'Home');
    expect(document.activeElement).toBe(byId('hokkaido'));
    press('hokkaido', 'ArrowLeft');
    expect(document.activeElement).toBe(byId('hokkaido'));
    press('hokkaido', 'ArrowDown');
    expect(document.activeElement).toBe(byId('aomori'));
    press('aomori', 'ArrowUp');
    expect(document.activeElement).toBe(byId('hokkaido'));
  });

  test('4.11.6: 要素のない県（このフィクスチャの 03）へは移らず、フォーカスは残る', () => {
    render(<KeyboardFixture />);
    focus('aomori');

    press('aomori', 'ArrowRight');

    expect(document.activeElement).toBe(byId('aomori'));
  });

  test('F-KB-01: 矢印で移ると、移った先の県のカードが出る（フォーカス＝ホバー）', () => {
    render(<KeyboardFixture />);
    focus('hokkaido');

    press('hokkaido', 'ArrowRight');

    expect(visibleCard()).toEqual(['青森県']);
  });

  test('F-KB-01: 地図の外にフォーカスが出たら、停止位置は固定中の県（なければ北海道）に戻る', () => {
    render(<KeyboardFixture />);
    focus('hokkaido');
    press('hokkaido', 'ArrowRight');
    expect(tabStops()).toEqual(['02']);

    focus('outside');
    expect(tabStops()).toEqual(['01']);

    mouseClick(byId('tokyo'));
    focus('okinawa');
    expect(tabStops()).toEqual(['47']);
    focus('outside');
    expect(tabStops()).toEqual(['13']);
  });

  test('F-KB-02: Enter・Space で固定する', () => {
    render(<KeyboardFixture />);
    focus('tokyo');

    expect(press('tokyo', 'Enter')).toBe(true);
    expect(byId('tokyo')).toHaveAttribute('aria-pressed', 'true');

    expect(press('tokyo', ' ')).toBe(true);
    expect(byId('tokyo')).toHaveAttribute('aria-pressed', 'false');
  });

  test('F-KB-03: Shift + Enter で最大化する', () => {
    render(<KeyboardFixture />);
    focus('tokyo');

    press('tokyo', 'Enter', { shiftKey: true });

    expect(byId('tokyo')).toHaveAttribute('data-state', 'maximized');
  });

  test('4.11.2: 最大化中も矢印で別の県に移り、Shift + Enter で切り替えられる', () => {
    render(<KeyboardFixture />);
    focus('tokyo');
    press('tokyo', 'Enter', { shiftKey: true });

    press('tokyo', 'End');
    press('okinawa', 'Enter', { shiftKey: true });

    expect(byId('okinawa')).toHaveAttribute('data-state', 'maximized');
    expect(byId('tokyo')).not.toHaveAttribute('data-state');
  });

  test('F-KB-05: Esc で最大化を解除し、もう1回で固定を解除する', () => {
    render(<KeyboardFixture />);
    focus('tokyo');
    press('tokyo', 'Enter', { shiftKey: true });

    press('tokyo', 'Escape');
    expect(byId('tokyo')).toHaveAttribute('data-state', 'pinned');

    press('tokyo', 'Escape');
    expect(byId('tokyo')).not.toHaveAttribute('data-state');
    expect(byId('tokyo')).toHaveAttribute('aria-pressed', 'false');
  });

  test('F-KB-04: + - 0 で useMapZoom の step(1)・step(-1)・reset を呼ぶ', () => {
    const zoom = { step: vi.fn(), reset: vi.fn() };
    render(<KeyboardFixture zoom={zoom} />);
    focus('tokyo');

    expect(press('tokyo', '+', { shiftKey: true })).toBe(true);
    expect(zoom.step).toHaveBeenLastCalledWith(1);
    press('tokyo', '-');
    expect(zoom.step).toHaveBeenLastCalledWith(-1);
    press('tokyo', '0');
    expect(zoom.reset).toHaveBeenCalledTimes(1);
    expect(zoom.step).toHaveBeenCalledTimes(2);
  });

  test('F-KB-04: MapZoom の外（useMapZoom が null）でも + - 0 で例外にならない', () => {
    render(<KeyboardFixture />);
    focus('tokyo');

    expect(() => press('tokyo', '+')).not.toThrow();
  });

  test('Ctrl・Meta・Alt つき・キーの繰り返しは無視する', () => {
    const zoom = { step: vi.fn(), reset: vi.fn() };
    render(<KeyboardFixture zoom={zoom} />);
    focus('tokyo');

    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
      expect(press('tokyo', 'Enter', init)).toBe(false);
      expect(press('tokyo', '+', init)).toBe(false);
      expect(press('tokyo', 'ArrowRight', init)).toBe(false);
    }
    expect(byId('tokyo')).toHaveAttribute('aria-pressed', 'false');
    expect(zoom.step).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(byId('tokyo'));
  });

  test('ほかのキー（Tab・英字）は止めない', () => {
    render(<KeyboardFixture />);
    focus('tokyo');

    expect(press('tokyo', 'Tab')).toBe(false);
    expect(press('tokyo', 'a')).toBe(false);
  });
});

describe('useMapState', () => {
  test('useMapState を Provider の外で使うと例外になる', () => {
    function Orphan() {
      useMapState();
      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Orphan />)).toThrow(/MapStateProvider/u);
    vi.restoreAllMocks();
  });
});
