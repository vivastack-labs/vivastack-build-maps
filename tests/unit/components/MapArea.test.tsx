import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapArea } from '@/components/MapArea';
import { VIEWBOX } from '@/features/map/projection';
import { loadContent } from '@/lib/content';

describe('MapArea', () => {
  test('4.11.7：地図の箱の縦横比が地図の viewBox と同じである', () => {
    // Arrange・Act
    const { container } = render(<MapArea lang="ja" prefectures={loadContent()} />);

    // Assert
    const box = container.querySelector('[data-area="map"] [data-map-box]') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe(`${VIEWBOX.width}/${VIEWBOX.height}`);
    expect(box.querySelector('svg')).not.toBeNull();
  });

  test('F-MAP-03：地図の箱の下に凡例がある', () => {
    const { container } = render(<MapArea lang="ja" prefectures={loadContent()} />);

    const area = container.querySelector('[data-area="map"]') as HTMLElement;
    expect(area.querySelectorAll('li[data-legend-region]')).toHaveLength(8);
    expect(area.querySelector('[data-map-box]')?.querySelector('li[data-legend-region]')).toBeNull();
  });
});
