import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapArea } from '@/components/MapArea';
import { VIEWBOX } from '@/features/map/projection';

describe('MapArea', () => {
  test('4.11.7：MapArea の縦横比が地図の viewBox と同じである', () => {
    // Arrange・Act
    const { container } = render(<MapArea />);

    // Assert
    const box = container.querySelector('[data-area="map"]') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe(`${VIEWBOX.width}/${VIEWBOX.height}`);
  });
});
