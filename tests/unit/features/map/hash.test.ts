import { describe, expect, test } from 'vitest';

import { hashForPref, prefFromHash } from '@/features/map/hash';

// 4.11.2：固定している県をハッシュ（#pref-NN）で引き継ぐ。正しくないハッシュは無視する
describe('prefFromHash', () => {
  test('4.11.2：#pref-13 は 13', () => {
    // Act
    const result = prefFromHash('#pref-13');

    // Assert
    expect(result).toBe('13');
  });

  test.each(['#pref-01', '#pref-47'])('4.11.2：範囲の端 %s は県コードにする', hash => {
    expect(prefFromHash(hash)).toBe(hash.slice('#pref-'.length));
  });

  test.each(['#pref-99', '#pref-00', '#pref-48', '#pref-1', '#pref-013', '#pref-', '#pref-ab', '#foo', '#', '', 'pref-13', '#Pref-13', '#pref-13x', '#pref-13#x', ' #pref-13'])(
    '4.11.2：正しくないハッシュ "%s" は null',
    hash => {
      // Act
      const result = prefFromHash(hash);

      // Assert
      expect(result).toBeNull();
    }
  );
});

describe('hashForPref', () => {
  test('4.11.2：13 は #pref-13、null は空（ハッシュなし）', () => {
    // Act・Assert
    expect(hashForPref('13')).toBe('#pref-13');
    expect(hashForPref(null)).toBe('');
  });

  test('4.11.2：prefFromHash と往復できる', () => {
    expect(prefFromHash(hashForPref('47'))).toBe('47');
  });
});
