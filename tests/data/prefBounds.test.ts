// T2-06：実データの県の「寄る範囲」（fitBounds）と「移動できる範囲」（panBounds）を検査する（D36、U16）。
import { describe, expect, test } from 'vitest';
import { loadPrefPaths, type PrefPath } from '@/features/map/prefPaths';
import { VIEWBOX } from '@/features/map/projection';

const paths = loadPrefPaths();
const byCode = (code: string): PrefPath => {
  const found = paths.find(p => p.code === code);
  if (!found) throw new Error(`県 ${code} がない`);
  return found;
};

// 父島の viewBox の座標（prefPaths.test.ts の U16 と同じ。約 (738, 1110)）
const CHICHIJIMA_Y = 1110;

describe('県の範囲（fitBounds・panBounds）', () => {
  test('D36：東京都の fitBounds は父島（北緯28度より南）を除く', () => {
    const { fitBounds } = byCode('13');

    expect(fitBounds.y1).toBeLessThan(CHICHIJIMA_Y - 50);
    expect(fitBounds.y1).toBeGreaterThan(0);
  });

  test('D36：東京都の panBounds は viewBox の外の小笠原村まで入る', () => {
    const { panBounds } = byCode('13');

    expect(panBounds.y1).toBeGreaterThan(VIEWBOX.height);
    expect(panBounds.y1).toBeGreaterThan(CHICHIJIMA_Y);
  });

  test('D36：東京都以外の fitBounds・panBounds は viewBox の中にある', () => {
    for (const { code, fitBounds, panBounds } of paths.filter(p => p.code !== '13')) {
      for (const [name, bounds] of [
        ['fitBounds', fitBounds],
        ['panBounds', panBounds]
      ] as const) {
        expect(bounds.x0, `県 ${code} の ${name}.x0`).toBeGreaterThanOrEqual(0);
        expect(bounds.y0, `県 ${code} の ${name}.y0`).toBeGreaterThanOrEqual(0);
        expect(bounds.x1, `県 ${code} の ${name}.x1`).toBeLessThanOrEqual(VIEWBOX.width);
        expect(bounds.y1, `県 ${code} の ${name}.y1`).toBeLessThanOrEqual(VIEWBOX.height);
      }
    }
  });

  test('D36：東京都以外では fitBounds と panBounds が同じである', () => {
    for (const { code, fitBounds, panBounds } of paths.filter(p => p.code !== '13')) {
      expect(panBounds, `県 ${code}`).toEqual(fitBounds);
    }
  });

  test('F-ZOOM-04：どの県も fitBounds の幅・高さが正である', () => {
    for (const { code, fitBounds } of paths) {
      expect(fitBounds.x1 - fitBounds.x0, `県 ${code} の幅`).toBeGreaterThan(0);
      expect(fitBounds.y1 - fitBounds.y0, `県 ${code} の高さ`).toBeGreaterThan(0);
    }
  });
});
