import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { MapArea } from '@/components/MapArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { VIEWBOX } from '@/features/map/projection';
import { publishedPrefectures } from '../lib/published-helpers';

const renderMapArea = () =>
  render(
    <MapStateProvider>
      <MapArea lang="ja" prefectures={publishedPrefectures()} />
    </MapStateProvider>
  );

describe('MapArea', () => {
  test('4.11.7：地図の箱の縦横比が地図の viewBox と同じである', () => {
    // Arrange・Act
    const { container } = renderMapArea();

    // Assert
    const box = container.querySelector('[data-area="map"] [data-map-box]') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.classList.contains(`aspect-[${VIEWBOX.width}/${VIEWBOX.height}]`)).toBe(true);
    expect(box.querySelector('svg')).not.toBeNull();
  });

  test("5.5：サーバーで描く地図の領域の HTML に style 属性がない（style-src 'self' で止まるため。クラスで書く）", () => {
    // Arrange・Act：サーバーの出力（effect が動かない）。MapZoom がブラウザで書く style（CSSOM）は対象外
    const html = renderToStaticMarkup(
      <MapStateProvider>
        <MapArea lang="ja" prefectures={publishedPrefectures()} />
      </MapStateProvider>
    );

    // Assert
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/\sstyle=/u);
  });

  test('T2-11：地図の箱は overflow-clip（スクロールできない箱にして、フォーカスで地図がずれないようにする）', () => {
    const { container } = renderMapArea();

    const className = container.querySelector('[data-map-box]')?.getAttribute('class') ?? '';
    expect(className).toContain('overflow-clip');
    expect(className).not.toContain('overflow-hidden');
  });

  test('T2-05：地図は MapInteraction で包まれ、マウントすると data-map-ready が付く', () => {
    const { container } = renderMapArea();

    expect(container.querySelector('[data-map-box] [data-map-ready] svg')).not.toBeNull();
  });

  test('T2-06：地図の箱の中に、拡大・縮小・全体のボタンがあり、MapInteraction の外にある（F-ZOOM-01・02）', () => {
    const { container } = renderMapArea();

    const box = container.querySelector('[data-map-box]') as HTMLElement;
    expect([...box.querySelectorAll('button[data-zoom]')].map(b => b.getAttribute('data-zoom'))).toEqual(['in', 'out', 'reset']);
    // ボタンのクリックが海のクリック（固定の解除）にならないよう、MapInteraction の外に置く
    expect(box.querySelector('[data-map-ready] button')).toBeNull();
  });

  test('T2-06：動かす層（<g data-map-layer>）に県のパスが入り、海の矩形はその外にある。倍率は 1 で始まる（F-ZOOM-01）', () => {
    const { container } = renderMapArea();

    const layer = container.querySelector('[data-map-layer]') as SVGGElement;
    expect(layer.querySelector('path[data-pref]')).not.toBeNull();
    expect(layer.getAttribute('data-zoom-scale')).toBe('1');
    expect(layer.contains(container.querySelector('[data-map-sea]'))).toBe(false);
  });

  test('T2-07：地図の箱の中に、市区町村データの読み込みの状態の領域があり、MapInteraction の外にある（F-MUNI-05）', () => {
    const { container } = renderMapArea();

    const box = container.querySelector('[data-map-box]') as HTMLElement;
    expect(box.className).toContain('relative');
    expect(box.querySelector('[data-muni-root] [role="status"][aria-live="polite"]')).not.toBeNull();
    // 再試行ボタンのクリックが海のクリック（固定の解除）にならないよう、MapInteraction の外に置く
    expect(box.querySelector('[data-map-ready] [data-muni-root]')).toBeNull();
    // 最大化していないので、読み込みの状態は出ない
    expect(box.querySelector('[data-muni-status]')).toBeNull();
  });

  test('F-MAP-03：地図の箱の下に凡例がある', () => {
    const { container } = renderMapArea();

    const area = container.querySelector('[data-area="map"]') as HTMLElement;
    expect(area.querySelectorAll('li[data-legend-region]')).toHaveLength(8);
    expect(area.querySelector('[data-map-box]')?.querySelector('li[data-legend-region]')).toBeNull();
  });
});
