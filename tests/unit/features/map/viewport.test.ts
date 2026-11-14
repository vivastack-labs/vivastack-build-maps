import { describe, expect, test } from 'vitest';
import { BASE_SCALE_EXTENT, constrainTransform, fitTransform, MAXIMIZED_ZOOM_IN_RATIO, panExtent, scaleExtent, stepScale, ZOOM_STEP, type Bounds } from '@/features/map/viewport';

const SIZE = { width: 1000, height: 1000 } as const;
const IDENTITY = { k: 1, x: 0, y: 0 } as const;

describe('fitTransform', () => {
  test('fitTransform は横長の範囲を表示領域の中央に収める（F-ZOOM-04）', () => {
    // Arrange：幅200・高さ100、中心 (200, 250)
    const bounds: Bounds = { x0: 100, y0: 200, x1: 300, y1: 300 };

    // Act
    const { k, x, y } = fitTransform(bounds, SIZE, 0.05);

    // Assert：幅で倍率が決まる（900 / 200）。中心が表示領域の中心（500, 500）に来る
    expect(k).toBeCloseTo(4.5);
    expect(k * 200 + x).toBeCloseTo(500);
    expect(k * 250 + y).toBeCloseTo(500);
  });

  test('fitTransform は縦長の範囲を表示領域の中央に収める（F-ZOOM-04）', () => {
    const bounds: Bounds = { x0: 400, y0: 100, x1: 500, y1: 500 };

    const { k, x, y } = fitTransform(bounds, SIZE, 0.05);

    // 高さで倍率が決まる（900 / 400）
    expect(k).toBeCloseTo(2.25);
    expect(k * 450 + x).toBeCloseTo(500);
    expect(k * 300 + y).toBeCloseTo(500);
  });

  test('fitTransform は余白を各辺の割合で残す（F-ZOOM-04）', () => {
    const bounds: Bounds = { x0: 0, y0: 0, x1: 100, y1: 100 };

    const { k } = fitTransform(bounds, SIZE, 0.1);

    expect(k * 100).toBeCloseTo(800);
  });

  test('fitTransform は幅・高さが0以下の範囲、表示領域、数が有限でない入力を例外にする', () => {
    expect(() => fitTransform({ x0: 0, y0: 0, x1: 0, y1: 10 }, SIZE, 0.05)).toThrow();
    expect(() => fitTransform({ x0: 0, y0: 0, x1: 10, y1: -1 }, SIZE, 0.05)).toThrow();
    expect(() => fitTransform({ x0: 0, y0: 0, x1: Number.NaN, y1: 10 }, SIZE, 0.05)).toThrow();
    expect(() => fitTransform({ x0: 0, y0: 0, x1: 10, y1: 10 }, { width: 0, height: 100 }, 0.05)).toThrow();
    expect(() => fitTransform({ x0: 0, y0: 0, x1: 10, y1: 10 }, SIZE, 0.5)).toThrow();
    expect(() => fitTransform({ x0: 0, y0: 0, x1: 10, y1: 10 }, SIZE, -0.1)).toThrow();
  });
});

describe('scaleExtent', () => {
  test('scaleExtent は通常 1〜8 を返す（F-ZOOM-01）', () => {
    expect(scaleExtent(null)).toEqual([1, 8]);
    expect(BASE_SCALE_EXTENT).toEqual([1, 8]);
  });

  test('scaleExtent は最大化中、県全体が収まる倍率より小さくならない（4.11.2）', () => {
    // 倍率が大きい県（香川県など）：上限は fitScale の4倍
    expect(scaleExtent(15)).toEqual([15, 15 * MAXIMIZED_ZOOM_IN_RATIO]);
    // 倍率が小さい県：上限は 8 を下回らない
    expect(scaleExtent(1.5)).toEqual([1.5, 8]);
  });

  test('scaleExtent は fitScale が0以下・有限でないとき例外にする', () => {
    expect(() => scaleExtent(0)).toThrow();
    expect(() => scaleExtent(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('stepScale', () => {
  const extent = [1, 8] as const;

  test('stepScale は1回で 1.5 倍・1/1.5 倍にし、範囲を超えない（F-ZOOM-01）', () => {
    expect(stepScale(2, 1, extent)).toBeCloseTo(2 * ZOOM_STEP);
    expect(stepScale(3, -1, extent)).toBeCloseTo(3 / ZOOM_STEP);
    expect(stepScale(6, 1, extent)).toBe(8);
    expect(stepScale(8, 1, extent)).toBe(8);
    expect(stepScale(1.2, -1, extent)).toBe(1);
    expect(stepScale(1, -1, extent)).toBe(1);
  });

  test('stepScale は倍率が有限でない・0以下のとき例外にする', () => {
    expect(() => stepScale(0, 1, extent)).toThrow();
    expect(() => stepScale(Number.NaN, 1, extent)).toThrow();
  });
});

describe('panExtent', () => {
  const viewBox: Bounds = { x0: 0, y0: 0, x1: 1000, y1: 1130 };

  test('panExtent は最大化していなければ viewBox、していれば viewBox と県の範囲を合わせる（D36）', () => {
    expect(panExtent(null)).toEqual(viewBox);
    // viewBox の中にある範囲：viewBox のまま
    expect(panExtent({ x0: 100, y0: 100, x1: 200, y1: 200 })).toEqual(viewBox);
    // 下に出る範囲（東京都の小笠原村など）：下へ広がる
    expect(panExtent({ x0: 700, y0: 900, x1: 1100, y1: 2000 })).toEqual({ x0: 0, y0: 0, x1: 1100, y1: 2000 });
    // 左上に出る範囲
    expect(panExtent({ x0: -50, y0: -30, x1: 10, y1: 10 })).toEqual({ x0: -50, y0: -30, x1: 1000, y1: 1130 });
  });

  test('panExtent は県の範囲が不正なとき例外にする', () => {
    expect(() => panExtent({ x0: 5, y0: 0, x1: 5, y1: 10 })).toThrow();
  });
});

describe('constrainTransform', () => {
  const extent: Bounds = { x0: 0, y0: 0, x1: 1000, y1: 1000 };

  test('constrainTransform は範囲の中の変換をそのまま返す（F-ZOOM-03）', () => {
    // k=2、表示領域は世界の (100..600, 200..700)
    const t = { k: 2, x: -200, y: -400 };

    expect(constrainTransform(t, SIZE, extent)).toEqual(t);
  });

  test('constrainTransform は範囲の外に出た変換を、端に合わせる（F-ZOOM-03）', () => {
    // 左上へ出すぎ：表示領域の左上が世界の (-100, -50)
    const over = constrainTransform({ k: 2, x: 200, y: 100 }, SIZE, extent);
    expect(over).toEqual({ k: 2, x: 0, y: 0 });
    // 右下へ出すぎ：k=2 の表示領域の幅は 500、右端が 1000 に合う
    const under = constrainTransform({ k: 2, x: -1900, y: -1900 }, SIZE, extent);
    expect(under).toEqual({ k: 2, x: -1000, y: -1000 });
  });

  test('constrainTransform は範囲より表示領域が大きいとき、中央に置く（4.11.2）', () => {
    // k=0.5：表示領域は世界の 2000 四方で、範囲 1000 四方より大きい
    const { k, x, y } = constrainTransform({ k: 0.5, x: 0, y: 0 }, SIZE, extent);

    expect(k).toBe(0.5);
    // 範囲の中心 (500, 500) が表示領域の中心 (500, 500) に来る
    expect(k * 500 + x).toBeCloseTo(500);
    expect(k * 500 + y).toBeCloseTo(500);
  });

  test('constrainTransform は恒等変換を viewBox と同じ範囲のとき動かさない（F-ZOOM-02）', () => {
    expect(constrainTransform(IDENTITY, SIZE, extent)).toEqual(IDENTITY);
  });
});
