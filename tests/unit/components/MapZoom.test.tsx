import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { MapZoom, useMapZoom, type PrefBounds } from '@/components/MapZoom';
import { VIEWBOX } from '@/features/map/projection';
import { FIT_PADDING, fitTransform, ZOOM_STEP } from '@/features/map/viewport';
import { getMessages } from '@/i18n/messages';

const messages = getMessages('ja');
const NAGANO_BOUNDS = { x0: 483, y0: 542, x1: 549, y1: 647 } as const;
const NAGANO: PrefBounds = { fit: NAGANO_BOUNDS, focus: NAGANO_BOUNDS, pan: NAGANO_BOUNDS };
// 東京都：県全体（本土と伊豆諸島）は縦に長く、寄る範囲（23区）はその北の端の小さな範囲（D51）
const TOKYO: PrefBounds = {
  fit: { x0: 558, y0: 606, x1: 633, y1: 917 },
  focus: { x0: 580, y0: 606, x1: 620, y1: 640 },
  pan: { x0: 558, y0: 606, x1: 760, y1: 1500 }
};
const bounds = { '13': TOKYO, '20': NAGANO };

/** 状態を見て・変える小さな部品 */
function Probe() {
  const { state, dispatch } = useMapState();
  return (
    <div>
      <output data-testid="maximized">{state.maximized ?? ''}</output>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '20' })}>
        maximize
      </button>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: '13' })}>
        maximize-tokyo
      </button>
      <button type="button" onClick={() => dispatch({ type: 'doubleClick', pref: 'constructor' })}>
        maximize-unknown
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

/** `useMapZoom()` の値を、ボタンから呼べるようにする（キーボードから呼ぶのと同じ関数） */
function ZoomProbe() {
  const zoom = useMapZoom();
  return (
    <div>
      <button type="button" onClick={() => zoom?.step(1)}>
        probe-in
      </button>
      <button type="button" onClick={() => zoom?.step(-1)}>
        probe-out
      </button>
      <button type="button" onClick={() => zoom?.reset()}>
        probe-reset
      </button>
    </div>
  );
}

function NullProbe() {
  return <output data-testid="zoom-null">{String(useMapZoom() === null)}</output>;
}

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

  test('5.2：「全体」ボタンの名前は見える文字（読みを含まない）。aria-label は付けない（WCAG 2.5.3）', () => {
    render(<Fixture />);

    const reset = button('全体');
    expect(reset.hasAttribute('aria-label')).toBe(false);
    expect(reset.textContent).toContain('全体');
    expect(reset.querySelector('rt')?.getAttribute('aria-hidden')).toBe('true');
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

  test('D51：寄る範囲（focus）が県全体より狭い県（東京都）は、最大化で focus に寄り、縮小は県全体（fit）まで、拡大は focus の4倍までできる', () => {
    const { container } = render(<Fixture />);
    const focus = fitTransform(TOKYO.focus, VIEWBOX, FIT_PADDING);
    const fit = fitTransform(TOKYO.fit, VIEWBOX, FIT_PADDING);

    fireEvent.click(button('maximize-tokyo'));
    expect(scaleOf(container)).toBeCloseTo(focus.k, 2);
    // 寄る範囲の中心が表示の中心に来る
    const match = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/u.exec(container.querySelector('[data-map-layer]')?.getAttribute('transform') ?? '');
    const [x, y, k] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
    expect(k * ((TOKYO.focus.x0 + TOKYO.focus.x1) / 2) + x).toBeCloseTo(VIEWBOX.width / 2, 0);
    expect(k * ((TOKYO.focus.y0 + TOKYO.focus.y1) / 2) + y).toBeCloseTo(VIEWBOX.height / 2, 0);

    for (let i = 0; i < 20; i += 1) fireEvent.click(button('縮小'));
    expect(scaleOf(container)).toBeCloseTo(fit.k, 2);
    for (let i = 0; i < 20; i += 1) fireEvent.click(button('拡大'));
    expect(scaleOf(container)).toBeCloseTo(focus.k * 4, 2);
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

  test('動きの途中でもう一度「＋」を押すと、目標の倍率から1回分進む（F-ZOOM-01）', async () => {
    stubReducedMotion(false);
    const { container } = render(<Fixture />);

    fireEvent.click(button('拡大'));
    fireEvent.click(button('拡大'));

    await vi.waitFor(() => expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP ** 2), { timeout: 2000 });
  });

  test('動きの途中の「＋」でも、寄っている県の中心が表示の中心から外れない（F-ZOOM-04）', async () => {
    stubReducedMotion(false);
    const { container } = render(<Fixture />);
    const fit = fitTransform(NAGANO.fit, VIEWBOX, FIT_PADDING);

    fireEvent.click(button('maximize'));
    fireEvent.click(button('拡大'));

    // 目標は「県に寄った変換を、表示の中心のまわりで1.5倍にしたもの」。県の中心は表示の中心（500, 565）に残る
    await vi.waitFor(() => expect(scaleOf(container)).toBeCloseTo(fit.k * ZOOM_STEP, 1), { timeout: 2000 });
    const match = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/u.exec(container.querySelector('[data-map-layer]')?.getAttribute('transform') ?? '');
    const [x, y, k] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
    expect(k * ((NAGANO.fit.x0 + NAGANO.fit.x1) / 2) + x).toBeCloseTo(VIEWBOX.width / 2, 0);
    expect(k * ((NAGANO.fit.y0 + NAGANO.fit.y1) / 2) + y).toBeCloseTo(VIEWBOX.height / 2, 0);
  });

  test('寄る動きを途中で止めても、倍率が下限（県全体が収まる倍率）より小さいまま残らない（4.11.2）', async () => {
    stubReducedMotion(false);
    const { container } = render(<Fixture />);
    const fit = fitTransform(NAGANO.fit, VIEWBOX, FIT_PADDING);
    const svg = container.querySelector('svg') as SVGSVGElement;

    // 寄り始めた直後（倍率が1に近いまま）に、動かさずにクリックして動きを止める
    fireEvent.click(button('maximize'));
    // jsdom は MouseEvent の view に Window しか受け付けず、テストの window はそれと別物なので、後から view を足す
    const view = svg.ownerDocument.defaultView as Window;
    const down = new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 });
    Object.defineProperty(down, 'view', { value: view });
    fireEvent(svg, down);
    const up = new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 });
    Object.defineProperty(up, 'view', { value: view });
    fireEvent(view, up);

    expect(scaleOf(container)).toBeGreaterThanOrEqual(fit.k - 0.01);
  });

  test('倍率を CSS 変数 --zoom-k に書く（線・文字の画面の上の大きさを保つため。F-ZOOM-01）', () => {
    const { container } = render(<Fixture />);
    const layer = container.querySelector('[data-map-layer]') as SVGGElement;
    expect(layer.style.getPropertyValue('--zoom-k')).toBe('1');

    fireEvent.click(button('拡大'));

    expect(layer.style.getPropertyValue('--zoom-k')).toBe('1.5');
  });

  test('県の範囲にないコード（Object.prototype のキーを含む）を最大化しても、何も動かさず例外にならない', () => {
    const { container } = render(<Fixture />);

    fireEvent.click(button('maximize-unknown'));

    expect(scaleOf(container)).toBe(1);
  });

  test('StrictMode（マウント・後片付け・再マウント）でも、全体表示で始まり、ボタンが効く（F-ZOOM-01）', () => {
    const { container } = render(
      <StrictMode>
        <Fixture />
      </StrictMode>
    );
    expect(scaleOf(container)).toBe(1);

    fireEvent.click(button('拡大'));

    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP);
  });
});

describe('useMapZoom', () => {
  beforeEach(() => stubReducedMotion(true));
  afterEach(() => vi.unstubAllGlobals());

  test('F-KB-04: step・reset はボタンと同じ動きをする', () => {
    const { container } = render(
      <MapStateProvider>
        <MapZoom bounds={bounds} labels={messages.zoom}>
          <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}>
            <g data-map-layer>
              <path data-pref="20" />
            </g>
          </svg>
          <ZoomProbe />
        </MapZoom>
        <Probe />
      </MapStateProvider>
    );

    fireEvent.click(screen.getByText('probe-in'));
    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP);
    fireEvent.click(screen.getByText('probe-in'));
    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP ** 2);
    fireEvent.click(screen.getByText('probe-out'));
    expect(scaleOf(container)).toBeCloseTo(ZOOM_STEP);

    fireEvent.click(screen.getByText('maximize'));
    expect(screen.getByTestId('maximized').textContent).toBe('20');
    fireEvent.click(screen.getByText('probe-reset'));
    expect(screen.getByTestId('maximized').textContent).toBe('');
    expect(scaleOf(container)).toBe(1);
  });

  test('useMapZoom は MapZoom の外では null', () => {
    render(<NullProbe />);

    expect(screen.getByTestId('zoom-null').textContent).toBe('true');
  });
});
