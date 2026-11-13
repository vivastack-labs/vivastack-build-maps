import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapLegend } from '@/components/MapLegend';
import { REGIONS } from '@/features/map/regions';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

describe('MapLegend', () => {
  for (const lang of LANGS) {
    test(`F-MAP-03：凡例に8地方が地方の順にある（${lang}）`, () => {
      // Arrange・Act
      const { container } = render(<MapLegend lang={lang} />);

      // Assert
      const items = [...container.querySelectorAll('li[data-legend-region]')];
      expect(items.map(item => item.getAttribute('data-legend-region'))).toEqual([...REGIONS]);
      expect(items.map(item => textWithoutRuby(item))).toEqual(REGIONS.map(region => plainText(getMessages(lang).regions[region])));
    });
  }

  test('F-MAP-03：色見本は地方の色（@theme の変数）で塗り、スクリーンリーダーには読ませない', () => {
    const { container } = render(<MapLegend lang="ja" />);

    for (const region of REGIONS) {
      const swatch = container.querySelector(`li[data-legend-region="${region}"] [data-swatch]`);
      expect(swatch?.getAttribute('class')).toContain(`bg-region-${region}`);
      expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
