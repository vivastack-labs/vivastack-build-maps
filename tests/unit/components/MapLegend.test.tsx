import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapLegend } from '@/components/MapLegend';
import { REGIONS } from '@/features/map/regions';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { textWithoutRuby } from './base-text';

// 準備中の県がない（プレビュー）と、ある（フィクスチャの本番）
const preview = publishedPrefectures(FIXTURE_DIR, 'preview');
const production = publishedPrefectures(FIXTURE_DIR, 'production');

describe('MapLegend', () => {
  for (const lang of LANGS) {
    test(`F-MAP-03：凡例に8地方が地方の順にある（${lang}）`, () => {
      // Arrange・Act
      const { container } = render(<MapLegend lang={lang} prefectures={preview} />);

      // Assert
      const items = [...container.querySelectorAll('li[data-legend-region]')];
      expect(items.map(item => item.getAttribute('data-legend-region'))).toEqual([...REGIONS]);
      expect(items.map(item => textWithoutRuby(item))).toEqual(REGIONS.map(region => plainText(getMessages(lang).regions[region])));
    });
  }

  test('F-MAP-03：色見本は地方の色（@theme の変数）で塗り、スクリーンリーダーには読ませない', () => {
    const { container } = render(<MapLegend lang="ja" prefectures={preview} />);

    for (const region of REGIONS) {
      const swatch = container.querySelector(`li[data-legend-region="${region}"] [data-swatch]`);
      expect(swatch?.getAttribute('class')).toContain(`bg-region-${region}`);
      expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  for (const lang of LANGS) {
    test(`4.11.4: 準備中の県があるときだけ「準備中」の項目を、地方の後ろに出す（${lang}）`, () => {
      // Arrange・Act
      const withPending = render(<MapLegend lang={lang} prefectures={production} />);
      const items = [...withPending.container.querySelectorAll('li')];

      // Assert
      expect(items).toHaveLength(9);
      const pending = items[8] as HTMLElement;
      expect(pending.hasAttribute('data-legend-pending')).toBe(true);
      expect(textWithoutRuby(pending)).toBe(plainText(getMessages(lang).comingSoon.label));
      expect(pending.querySelector('[data-swatch]')?.getAttribute('class')).toContain('bg-pending-hatch');
      expect(pending.querySelector('[data-swatch]')?.getAttribute('aria-hidden')).toBe('true');

      withPending.unmount();
      const withoutPending = render(<MapLegend lang={lang} prefectures={preview} />);
      expect(withoutPending.container.querySelectorAll('li')).toHaveLength(8);
      expect(withoutPending.container.querySelector('[data-legend-pending]')).toBeNull();
    });
  }
});
