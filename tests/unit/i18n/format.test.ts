import { afterEach, describe, expect, test, vi } from 'vitest';

import { formatDate } from '@/i18n/format';

describe('formatDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('formatDate：確認日を言語の書式にする（F-SRC-02）', () => {
    // Arrange・Act・Assert
    expect(formatDate('ja', '2026-11-15')).toBe('2026年11月15日');
    expect(formatDate('zh', '2026-11-15')).toBe('2026年11月15日');
    expect(formatDate('en', '2026-11-15')).toBe('November 15, 2026');
  });

  test('formatDate：端末のタイムゾーンで日がずれない（F-SRC-02）', async () => {
    // Arrange：UTC-11 の端末。Intl.DateTimeFormat は作る時点のタイムゾーンを覚えるので、TZ を変えてからモジュールを読み込み直す
    vi.stubEnv('TZ', 'Pacific/Pago_Pago');
    vi.resetModules();
    const { formatDate: formatInPagoPago } = await import('@/i18n/format');

    // Act
    const results = (['ja', 'en', 'zh'] as const).map(lang => formatInPagoPago(lang, '2026-01-01'));

    // Assert：UTC の暦で書式にするので、前の日（2025年12月31日）にならない
    expect(results).toEqual(['2026年1月1日', 'January 1, 2026', '2026年1月1日']);
  });

  test('formatDate：うるう日と0〜99年を扱える', () => {
    expect(formatDate('en', '2024-02-29')).toBe('February 29, 2024');
    expect(formatDate('ja', '0050-03-04')).toBe('50年3月4日');
  });

  test.each(['2026-1-1', '2026-02-30', '', '2026/11/15', '2026-13-01', '2026-11-15T00:00:00Z'])('formatDate：形が合わない・存在しない日は例外にする（%j）', value => {
    expect(() => formatDate('ja', value)).toThrow();
  });
});
