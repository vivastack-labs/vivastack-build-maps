import { describe, expect, test } from 'vitest';

import { formatDate } from '@/i18n/format';

describe('formatDate', () => {
  test('formatDate：確認日を言語の書式にする（F-SRC-02）', () => {
    // Arrange・Act・Assert
    expect(formatDate('ja', '2026-11-15')).toBe('2026年11月15日');
    expect(formatDate('zh', '2026-11-15')).toBe('2026年11月15日');
    expect(formatDate('en', '2026-11-15')).toBe('November 15, 2026');
  });

  test('formatDate：タイムゾーンで日がずれない（F-SRC-02）', () => {
    // Arrange・Act（UTC の 0 時を、UTC の暦で書式にするので、端末のタイムゾーンに関係なく同じ日になる）
    const results = (['ja', 'en', 'zh'] as const).map(lang => formatDate(lang, '2026-01-01'));

    // Assert
    expect(results).toEqual(['2026年1月1日', 'January 1, 2026', '2026年1月1日']);
  });

  test('formatDate：うるう日を扱える', () => {
    expect(formatDate('en', '2024-02-29')).toBe('February 29, 2024');
  });

  test.each(['2026-1-1', '2026-02-30', '', '2026/11/15', '2026-13-01', '2026-11-15T00:00:00Z'])('formatDate：形が合わない・存在しない日は例外にする（%j）', value => {
    expect(() => formatDate('ja', value)).toThrow();
  });
});
