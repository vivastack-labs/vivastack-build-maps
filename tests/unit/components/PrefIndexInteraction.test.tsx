import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { CardSwitch } from '@/components/CardSwitch';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { PrefIndexInteraction } from '@/components/PrefIndexInteraction';

/** ホバー中の県（`hovered`）を文字にして出す。カードは `displayed` なので、ホバーの解除はこれで確かめる */
function HoveredProbe() {
  return <output data-testid="hovered">{useMapState().state.hovered ?? ''}</output>;
}

// さくいん（項目の外にも要素がある）とカードを小さく組む。項目はサーバーの出力と同じく aria-pressed="false" で始める
function Fixture() {
  return (
    <MapStateProvider>
      <PrefIndexInteraction>
        <h3>関東地方</h3>
        <ul data-testid="gap">
          <li>
            <a data-testid="tokyo" href="#pref-13" role="button" tabIndex={0} aria-pressed="false" data-pref="13">
              東京都
            </a>
          </li>
          <li>
            <a data-testid="chiba" href="#pref-12" role="button" tabIndex={0} aria-pressed="false" data-pref="12">
              千葉県
            </a>
          </li>
        </ul>
      </PrefIndexInteraction>
      <CardSwitch>
        <p data-card-guide>案内文</p>
        <p data-card-pref="13" hidden>
          東京都
        </p>
        <p data-card-pref="12" hidden>
          千葉県
        </p>
      </CardSwitch>
      <HoveredProbe />
    </MapStateProvider>
  );
}

const mouseOver = (element: Element) => fireEvent.pointerOver(element, { pointerType: 'mouse' });
const visibleCard = () => [...document.querySelectorAll<HTMLElement>('[data-card-pref]')].filter(card => !card.hidden).map(card => card.textContent);

/** マウスでの1回のクリック（pointerdown → click）。click の既定の動作が止められたかを返す */
function mouseClick(element: Element): boolean {
  fireEvent.pointerDown(element, { pointerType: 'mouse' });
  return fireEvent.click(element);
}

/** `fireEvent.keyDown` の戻り値は「既定の動作が止められていない」。止められたかに読み替える */
function pressKey(element: Element, init: KeyboardEventInit): boolean {
  return !fireEvent.keyDown(element, init);
}

describe('PrefIndexInteraction', () => {
  test('F-IDX-02: マウスで項目にのせると hover（カードの県が変わる）', () => {
    render(<Fixture />);
    expect(screen.getByText('案内文')).toBeVisible();

    mouseOver(screen.getByTestId('tokyo'));
    expect(visibleCard()).toEqual(['東京都']);

    fireEvent.pointerOut(screen.getByTestId('tokyo'), { pointerType: 'mouse', relatedTarget: screen.getByTestId('chiba') });
    mouseOver(screen.getByTestId('chiba'));
    expect(visibleCard()).toEqual(['千葉県']);
  });

  test('F-IDX-02: クリックで固定し、項目の aria-pressed が true になる。もう1回で解除する', () => {
    render(<Fixture />);

    mouseClick(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'pinned');
    expect(screen.getByTestId('chiba')).toHaveAttribute('aria-pressed', 'false');

    mouseClick(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('tokyo')).not.toHaveAttribute('data-state');
  });

  test('F-IDX-02: ダブルクリックで最大化＋固定（data-state="maximized"）', () => {
    render(<Fixture />);
    fireEvent.pointerDown(screen.getByTestId('tokyo'), { pointerType: 'mouse' });

    fireEvent.dblClick(screen.getByTestId('tokyo'));

    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'maximized');
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
  });

  test('4.11.3: タッチでは pointerover でホバーしない。タップで固定する', () => {
    render(<Fixture />);

    fireEvent.pointerOver(screen.getByTestId('tokyo'), { pointerType: 'touch' });
    expect(visibleCard()).toEqual([]);

    fireEvent.pointerDown(screen.getByTestId('tokyo'), { pointerType: 'touch' });
    fireEvent.click(screen.getByTestId('tokyo'));
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
  });

  test('4.11.3: タッチのダブルタップ（dblclick）では最大化しない', () => {
    render(<Fixture />);
    fireEvent.pointerDown(screen.getByTestId('tokyo'), { pointerType: 'touch' });

    fireEvent.dblClick(screen.getByTestId('tokyo'));

    expect(screen.getByTestId('tokyo')).not.toHaveAttribute('data-state');
  });

  test('判断 4: 項目の外のクリックでは固定が外れない', () => {
    render(<Fixture />);
    mouseClick(screen.getByTestId('tokyo'));

    mouseClick(screen.getByTestId('gap'));
    mouseClick(screen.getByRole('heading', { name: '関東地方' }));

    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'true');
  });

  test('判断 2: 項目のクリックでリンクの移動を止める（defaultPrevented）。項目の外は止めない', () => {
    render(<Fixture />);

    expect(mouseClick(screen.getByTestId('tokyo'))).toBe(false);
    expect(mouseClick(screen.getByTestId('gap'))).toBe(true);
  });

  test('4.11.2: Enter・Space で固定し、keydown の既定の動作を止める', () => {
    render(<Fixture />);

    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter' })).toBe(true);
    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'pinned');

    expect(pressKey(screen.getByTestId('tokyo'), { key: ' ' })).toBe(true);
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');
  });

  test('4.11.2: Shift + Enter で最大化し、keydown の既定の動作を止める', () => {
    render(<Fixture />);

    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter', shiftKey: true })).toBe(true);

    expect(screen.getByTestId('tokyo')).toHaveAttribute('data-state', 'maximized');
  });

  test('ほかのキー・修飾キーつきの Enter は何もせず、既定の動作を止めない', () => {
    render(<Fixture />);

    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Tab' })).toBe(false);
    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter', ctrlKey: true })).toBe(false);
    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter', metaKey: true })).toBe(false);
    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter', altKey: true })).toBe(false);
    expect(pressKey(screen.getByTestId('tokyo'), { key: 'Enter', repeat: true })).toBe(false);

    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');
  });

  test.each([['ctrlKey'], ['metaKey'], ['shiftKey'], ['altKey']])('修飾キー（%s）つきのクリックは、既定の動き（新しいタブなど）に任せ、状態を変えない', modifier => {
    render(<Fixture />);
    fireEvent.pointerDown(screen.getByTestId('tokyo'), { pointerType: 'mouse' });

    const isNotPrevented = fireEvent.click(screen.getByTestId('tokyo'), { [modifier]: true });

    expect(isNotPrevented).toBe(true);
    expect(screen.getByTestId('tokyo')).toHaveAttribute('aria-pressed', 'false');
  });

  test('項目の外のキー操作は無視する', () => {
    render(<Fixture />);

    expect(pressKey(screen.getByTestId('gap'), { key: 'Enter' })).toBe(false);
  });

  test('4.11.2: キーボードのフォーカスでホバー、フォーカスが外れると hoverEnd', () => {
    render(<Fixture />);

    act(() => screen.getByTestId('tokyo').focus());
    expect(visibleCard()).toEqual(['東京都']);
    expect(screen.getByTestId('hovered')).toHaveTextContent('13');

    act(() => screen.getByTestId('tokyo').blur());
    expect(screen.getByTestId('hovered')).toBeEmptyDOMElement();
  });

  test('4.11.3: :focus-visible に一致しないフォーカス（タップなど）ではホバーしない', () => {
    render(<Fixture />);
    const tokyo = screen.getByTestId('tokyo');
    const matches = vi.spyOn(tokyo, 'matches').mockImplementation(selector => selector !== ':focus-visible');

    act(() => tokyo.focus());

    expect(matches).toHaveBeenCalledWith(':focus-visible');
    expect(screen.getByTestId('hovered')).toBeEmptyDOMElement();
    expect(visibleCard()).toEqual([]);
  });

  test('4.11.2: 別の項目へフォーカスが移ると、カードの県が変わる', () => {
    render(<Fixture />);

    act(() => screen.getByTestId('tokyo').focus());
    act(() => screen.getByTestId('chiba').focus());

    expect(visibleCard()).toEqual(['千葉県']);
    expect(screen.getByTestId('hovered')).toHaveTextContent('12');
  });

  test('マウスで押して移ったフォーカスの blur では、マウスのホバーを解除しない', () => {
    render(<Fixture />);
    act(() => screen.getByTestId('tokyo').focus());
    mouseOver(screen.getByTestId('chiba'));

    fireEvent.blur(screen.getByTestId('tokyo'), { relatedTarget: screen.getByTestId('chiba') });

    expect(screen.getByTestId('hovered')).toHaveTextContent('12');
  });

  test('マウントすると data-index-ready が付く', () => {
    const { container } = render(<Fixture />);

    expect(container.querySelector('[data-index-ready]')).not.toBeNull();
  });
});
