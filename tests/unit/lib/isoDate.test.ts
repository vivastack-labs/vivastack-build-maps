import { describe, expect, test } from 'vitest';

import { parseIsoDate } from '@/lib/isoDate';

describe('parseIsoDate', () => {
  test('9.3：YYYY-MM-DD を UTC の 0 時の日付にする', () => {
    expect(parseIsoDate('2026-11-15')?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(parseIsoDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  test('9.3：0〜99年も、その年のまま扱う', () => {
    expect(parseIsoDate('0050-03-04')?.getUTCFullYear()).toBe(50);
  });

  test.each(['', '2026-1-1', '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '2026/11/15', '2026-11-15T00:00:00Z', ' 2026-11-15'])(
    '9.3：形が合わない・存在しない日は null（%j）',
    value => {
      expect(parseIsoDate(value)).toBeNull();
    }
  );
});
