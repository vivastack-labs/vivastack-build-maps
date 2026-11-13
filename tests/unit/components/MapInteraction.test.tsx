import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { CardSwitch } from '@/components/CardSwitch';
import { MapInteraction } from '@/components/MapInteraction';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';

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
