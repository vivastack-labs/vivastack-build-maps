import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MapStateProvider } from '@/components/MapStateProvider';
import { MuniLayer } from '@/components/MuniLayer';
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

  test('F-MUNI-01: 読み込めたら、市区町村の形を件数ぶん描き、県の外周の線と県コードを持つ（スクリーンリーダーには読ませない）', () => {
    const { container } = renderLayer();

    toggleMaximize();

    const group = container.querySelector('[data-muni-layer]');
    expect(group?.getAttribute('data-muni-pref')).toBe('20');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    const shapes = [...container.querySelectorAll('path[data-muni]')];
    expect(shapes.map(shape => shape.getAttribute('data-muni'))).toEqual(['20101', '20102', '20103', '20104']);
    expect(shapes.every(shape => /^[0-4]$/u.test(shape.getAttribute('data-shade') ?? '') && (shape.getAttribute('d') ?? '').startsWith('M'))).toBe(true);
    expect(container.querySelector('path[data-muni-outline]')?.getAttribute('d')).toMatch(/^M/u);
  });

  test('最大化を解除すると、市区町村の形は消える', () => {
    const { container } = renderLayer();
    toggleMaximize();

    toggleMaximize();

    expect(container.querySelector('[data-muni-layer]')).toBeNull();
  });

  test('F-MUNI-02: data-zoom-scale が変わると、表示するラベルが変わる', async () => {
    const { layer, labels, visibleLabels } = renderLayer();
    toggleMaximize();
    expect(labels().length).toBeGreaterThan(0);
    expect(visibleLabels()).toHaveLength(0);

    act(() => layer.setAttribute('data-zoom-scale', '64'));

    await waitFor(() => expect(visibleLabels().length).toBeGreaterThan(0));
    act(() => layer.setAttribute('data-zoom-scale', '1'));
    await waitFor(() => expect(visibleLabels()).toHaveLength(0));
  });

  test('F-I18N-05: 日本語のページのラベルは区名の文言で、lang は付けない', () => {
    const { labels } = renderLayer('ja');
    toggleMaximize();

    expect(labels()[0]?.textContent).toBe('市20101');
    expect(labels()[0]?.hasAttribute('lang')).toBe(false);
  });

  test('F-I18N-05: 英語のページのラベルはローマ字', () => {
    const { labels } = renderLayer('en');
    toggleMaximize();

    expect(labels()[0]?.textContent).toBe('City 20101');
  });

  test('F-I18N-05: 中国語のページのラベルは日本語の漢字表記で、lang="ja" が付く', () => {
    const { labels } = renderLayer('zh');
    toggleMaximize();

    expect(labels()[0]?.textContent).toBe('市20101');
    expect(labels()[0]?.getAttribute('lang')).toBe('ja');
  });
});
