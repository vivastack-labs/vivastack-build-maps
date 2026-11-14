import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { MapZoom, type PrefBounds } from '@/components/MapZoom';
import { VIEWBOX } from '@/features/map/projection';
import { FIT_PADDING, fitTransform, ZOOM_STEP } from '@/features/map/viewport';
import { getMessages } from '@/i18n/messages';

const messages = getMessages('ja');
const NAGANO: PrefBounds = { fit: { x0: 483, y0: 542, x1: 549, y1: 647 }, pan: { x0: 483, y0: 542, x1: 549, y1: 647 } };
const bounds = { '20': NAGANO };

/** 状態を見て・変える小さな部品 */
function Probe() {
  const { state, dispatch } = useMapState();
  return (
    <div>
      <output data-testid="maximized">{state.maximized ?? ''}</output>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '20' })}>
        maximize
      </button>
    </div>
  );
}

function Fixture() {
  return (
    <MapStateProvider>
      <MapZoom bounds={bounds} labels={messages.zoom}>
        <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}>
          <rect data-map-sea width={VIEWBOX.width} height={VIEWBOX.height} />
          <g data-map-layer>
            <path data-pref="20" />
          </g>
        </svg>
      </MapZoom>
      <Probe />
    </MapStateProvider>
  );
}

const stubReducedMotion = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matches && query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
};

const scaleOf = (container: HTMLElement): number => Number(container.querySelector('[data-map-layer]')?.getAttribute('data-zoom-scale'));
const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('MapZoom', () => {
  beforeEach(() => stubReducedMotion(true));
  afterEach(() => vi.unstubAllGlobals());

  test('「＋」「−」「全体」のボタンが aria-label・文字付きで出る（F-ZOOM-01・02）', () => {
    render(<Fixture />);

    expect(button('拡大').textContent).toBe('+');
    expect(button('縮小').textContent).toBe('−');
    expect(button(/全体/u).textContent).toContain('全体');
    for (const name of ['拡大', '縮小']) expect(button(name).getAttribute('type')).toBe('button');
  });

  test('全体表示で始まり、data-zoom-scale が 1 である（F-ZOOM-02）', () => {
    const { container } = render(<Fixture />);

    expect(scaleOf(container)).toBe(1);
  });

  test('動きを減らす設定では「＋」の直後に倍率が上がっている（F-ZOOM-05）', () => {
    const { container } = render(<Fixture />);

    fireEvent.click(button('拡大'));

    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP);
    expect(container.querySelector('[data-map-layer]')?.getAttribute('transform')).toMatch(/^translate\(.*\) scale\(1\.5\)$/u);
  });

  test('「−」は倍率を下げ、1 より小さくならない（F-ZOOM-01）', () => {
    const { container } = render(<Fixture />);

    fireEvent.click(button('拡大'));
    fireEvent.click(button('拡大'));
    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP ** 2);
    fireEvent.click(button('縮小'));
    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP);
    fireEvent.click(button('縮小'));
    fireEvent.click(button('縮小'));
    expect(scaleOf(container)).toBe(1);
  });

  test('「＋」は 8 倍で止まる（F-ZOOM-01）', () => {
    const { container } = render(<Fixture />);

    for (let i = 0; i < 8; i += 1) fireEvent.click(button('拡大'));

    expect(scaleOf(container)).toBe(8);
  });

  test('「全体」で resetView を渡し、倍率が1に戻る（F-ZOOM-02）', () => {
    const { container } = render(<Fixture />);
    fireEvent.click(button('maximize'));
    expect(screen.getByTestId('maximized').textContent).toBe('20');

    fireEvent.click(button(/全体/u));

    expect(screen.getByTestId('maximized').textContent).toBe('');
    expect(scaleOf(container)).toBe(1);
  });

  test('「全体」は最大化していなくても、拡大した表示を全体表示に戻す（F-ZOOM-02）', () => {
    const { container } = render(<Fixture />);
    fireEvent.click(button('拡大'));

    fireEvent.click(button(/全体/u));

    expect(scaleOf(container)).toBe(1);
    expect(container.querySelector('[data-map-layer]')?.getAttribute('transform')).toBe('translate(0,0) scale(1)');
  });

  test('最大化すると、その県の範囲に寄る（F-ZOOM-04）', () => {
    const { container } = render(<Fixture />);

    fireEvent.click(button('maximize'));

    const expected = fitTransform(NAGANO.fit, VIEWBOX, FIT_PADDING);
    expect(scaleOf(container)).toBeCloseTo(expected.k, 2);
  });

  test('最大化中は、県全体が収まる倍率より縮小できず、収まる倍率の4倍まで拡大できる（4.11.2）', () => {
    const { container } = render(<Fixture />);
    fireEvent.click(button('maximize'));
    const fitScale = scaleOf(container);

    fireEvent.click(button('縮小'));
    expect(scaleOf(container)).toBeCloseTo(fitScale, 2);
    for (let i = 0; i < 10; i += 1) fireEvent.click(button('拡大'));
    expect(scaleOf(container)).toBeCloseTo(fitScale * 4, 2);
  });

  test('最大化の「全体」以外の解除でも、全体表示に戻る（F-ZOOM-04）', () => {
    const { container } = render(<Fixture />);
    fireEvent.click(button('maximize'));
    // もう一度ダブルクリック＝最大化の解除（4.11.2）
    fireEvent.click(button('maximize'));

    expect(screen.getByTestId('maximized').textContent).toBe('');
    expect(scaleOf(container)).toBe(1);
  });

  test('動きを減らさない設定でも、ボタンの操作が終わると最終の倍率になる（F-ZOOM-05）', async () => {
    stubReducedMotion(false);
    const { container } = render(<Fixture />);

    fireEvent.click(button('拡大'));

    await vi.waitFor(() => expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP), { timeout: 2000 });
  });
});
