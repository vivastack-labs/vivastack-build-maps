import { describe, expect, test } from 'vitest';
import { REGIONS, REGION_FILL_CLASS, REGION_SWATCH_CLASS } from '@/features/map/regions';
import { getMessages } from '@/i18n/messages';

describe('REGIONS', () => {
  test('F-MAP-03：8地方があり、辞書の地方名と同じ順に並ぶ', () => {
    expect(REGIONS).toHaveLength(8);
    expect([...REGIONS]).toEqual(Object.keys(getMessages('ja').regions));
  });

  test('F-MAP-01：地方ごとに、@theme の色の変数に対応する塗りと色見本のクラスがある', () => {
    for (const region of REGIONS) {
      expect(REGION_FILL_CLASS[region]).toBe(`fill-region-${region}`);
      expect(REGION_SWATCH_CLASS[region]).toBe(`bg-region-${region}`);
    }
  });
});
