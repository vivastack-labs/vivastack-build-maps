import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MapStateProvider } from '@/components/MapStateProvider';
import { MuniLayer } from '@/components/MuniLayer';
import { MUNI_LABEL_FONT_SIZE } from '@/features/map/labels';
import type { Lang } from '@/i18n/lang';
import { loadedLoader, Probe, toggleMaximize } from './muni-test-helpers';

function renderLayer(lang: Lang = 'ja') {
  const { loader } = loadedLoader();
  const view = render(
    <MapStateProvider>
      <svg>
        <g data-map-layer data-zoom-scale="1">
          <MuniLayer lang={lang} loader={loader} />
        </g>
      </svg>
      <Probe />
    </MapStateProvider>
  );
  const layer = view.container.querySelector('[data-map-layer]') as SVGGElement;
  const labels = () => [...view.container.querySelectorAll('[data-muni-label]')];
  const visibleLabels = () => labels().filter(label => label.getAttribute('visibility') !== 'hidden');
  return { ...view, layer, labels, visibleLabels };
}

describe('MuniLayer', () => {
  test('最大化していなければ何も描かない', () => {
    const { container } = renderLayer();

    expect(container.querySelector('[data-muni-layer]')).toBeNull();
  });

  test('F-MUNI-01: 読み込めたら、市区町村の形を件数ぶん描き、県の外周の線と県コードを持つ（スクリーンリーダーには読ませない）', async () => {
    const { container } = renderLayer();

    await toggleMaximize();

    const group = container.querySelector('[data-muni-layer]');
    expect(group?.getAttribute('data-muni-pref')).toBe('20');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    const shapes = [...container.querySelectorAll('path[data-muni]')];
    expect(shapes.map(shape => shape.getAttribute('data-muni'))).toEqual(['20101', '20102', '20103', '20104']);
    expect(shapes.every(shape => /^[0-4]$/u.test(shape.getAttribute('data-shade') ?? '') && (shape.getAttribute('d') ?? '').startsWith('M'))).toBe(true);
    expect(container.querySelector('path[data-muni-outline]')?.getAttribute('d')).toMatch(/^M/u);
  });

  test('5.5：線の太さは --zoom-k、ラベルの文字の大きさは --zoom-k と --map-px で割る値をクラスで書く（style 属性を使わない）', async () => {
    const { container } = renderLayer();

    await toggleMaximize();

    const group = container.querySelector('[data-muni-layer]') as SVGGElement;
    expect(group.querySelectorAll('[style]')).toHaveLength(0);
    expect(group.querySelector('g.stroke-muni-border')?.classList.contains('[stroke-width:calc(0.5px/var(--zoom-k,1))]')).toBe(true);
    expect(group.querySelector('path[data-muni-outline]')?.classList.contains('[stroke-width:calc(1.4px/var(--zoom-k,1))]')).toBe(true);
    expect(group.querySelector('[data-muni-labels]')?.classList.contains(`[font-size:calc(${MUNI_LABEL_FONT_SIZE}px/var(--zoom-k,1)/var(--map-px,1))]`)).toBe(true);
  });

  test('T2-08：変換が終わるまで、市区町村の形は描かない（地図は県の形のまま）', async () => {
    const { container } = renderLayer();

    fireEvent.click(screen.getByRole('button', { name: 'toggle-20' }));
    expect(container.querySelector('[data-muni-layer]')).toBeNull();
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

    expect(container.querySelector('[data-muni-layer]')).not.toBeNull();
  });

  test('最大化を解除すると、市区町村の形は消える', async () => {
    const { container } = renderLayer();
    await toggleMaximize();

    await toggleMaximize();

    expect(container.querySelector('[data-muni-layer]')).toBeNull();
  });

  test('F-MUNI-02: data-zoom-scale が変わると、表示するラベルが変わる', async () => {
    const { layer, labels, visibleLabels } = renderLayer();
    await toggleMaximize();
    expect(labels().length).toBeGreaterThan(0);
    expect(visibleLabels()).toHaveLength(0);

    act(() => layer.setAttribute('data-zoom-scale', '64'));

    await waitFor(() => expect(visibleLabels().length).toBeGreaterThan(0));
    act(() => layer.setAttribute('data-zoom-scale', '1'));
    await waitFor(() => expect(visibleLabels()).toHaveLength(0));
  });

  describe('#147：ラベルの文字の大きさを、地図の表示幅にかかわらず画面の上で一定にする', () => {
    let notifyResize: () => void = () => undefined;

    /** jsdom には ResizeObserver も大きさもないので、地図の幅と通知を自分で与える */
    function stubMapWidth(container: HTMLElement, width: number) {
      const svg = container.querySelector('svg') as SVGSVGElement;
      let current = width;
      vi.spyOn(svg, 'getBoundingClientRect').mockImplementation(() => ({ width: current }) as DOMRect);
      return {
        resize(next: number) {
          current = next;
          act(() => notifyResize());
        }
      };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function stubResizeObserver() {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            notifyResize = callback;
          }
          observe() {}
          disconnect() {}
        }
      );
    }

    test('地図の 1 単位の画面の大きさ（地図の幅 ÷ 1000）を --map-px に書き、幅が変われば書き直す', async () => {
      stubResizeObserver();
      const { container } = renderLayer();
      const map = stubMapWidth(container, 350);

      await toggleMaximize();

      const group = container.querySelector('[data-muni-layer]') as SVGGElement;
      expect(group.style.getPropertyValue('--map-px')).toBe('0.35');
      map.resize(800);
      expect(group.style.getPropertyValue('--map-px')).toBe('0.8');
    });

    test('拡大・移動の毎フレーム（data-zoom-scale の変化）では、地図の幅を測り直さない（レイアウトを読まない）', async () => {
      stubResizeObserver();
      const { container, layer } = renderLayer();
      stubMapWidth(container, 350);
      await toggleMaximize();
      const svg = container.querySelector('svg') as SVGSVGElement;
      const measured = vi.mocked(svg.getBoundingClientRect).mock.calls.length;

      act(() => layer.setAttribute('data-zoom-scale', '8'));
      await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

      expect(vi.mocked(svg.getBoundingClientRect).mock.calls.length).toBe(measured);
    });

    test('F-MUNI-02：地図の幅が狭いほど、同じ拡大の倍率で出すラベルが少ない（文字が大きくなる分、重ならないようにする）', async () => {
      stubResizeObserver();
      const { container, layer, visibleLabels } = renderLayer();
      const map = stubMapWidth(container, 1000);
      await toggleMaximize();
      act(() => layer.setAttribute('data-zoom-scale', '64'));
      await waitFor(() => expect(visibleLabels().length).toBeGreaterThan(0));
      const wide = visibleLabels().length;

      map.resize(1);

      expect(visibleLabels().length).toBeLessThan(wide);
    });
  });

  test('最大化を解除した後に data-zoom-scale が変わっても、例外にならない（倍率の監視は止まっている）', async () => {
    const { layer, labels } = renderLayer();
    await toggleMaximize();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener('error', onError);
    await toggleMaximize();
    expect(labels()).toHaveLength(0);

    act(() => layer.setAttribute('data-zoom-scale', '64'));
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(layer.querySelector('[data-muni-label]')).toBeNull();
  });

  test('F-I18N-05: 日本語のページのラベルは区名の文言で、lang は付けない', async () => {
    const { labels } = renderLayer('ja');
    await toggleMaximize();

    expect(labels()[0]?.textContent).toBe('市20101');
    expect(labels()[0]?.hasAttribute('lang')).toBe(false);
  });

  test('F-I18N-05: 英語のページのラベルはローマ字', async () => {
    const { labels } = renderLayer('en');
    await toggleMaximize();

    expect(labels()[0]?.textContent).toBe('City 20101');
  });

  test('F-I18N-05: 中国語のページのラベルは日本語の漢字表記で、lang="ja" が付く', async () => {
    const { labels } = renderLayer('zh');
    await toggleMaximize();

    expect(labels()[0]?.textContent).toBe('市20101');
    expect(labels()[0]?.getAttribute('lang')).toBe('ja');
  });
});
