import { describe, expect, test } from 'vitest';
import { zoomInvariant } from '@/features/map/zoomInvariant';

describe('zoomInvariant', () => {
  test('F-ZOOM-01：基準の大きさを --zoom-k で割る calc() になり、変数がなければ基準のまま', () => {
    expect(zoomInvariant(16)).toBe('calc(16px / var(--zoom-k, 1))');
  });
});
