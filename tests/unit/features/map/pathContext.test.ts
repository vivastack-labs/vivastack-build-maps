import { describe, expect, test } from 'vitest';
import { createRelativePathContext } from '@/features/map/pathContext';
import { absolutePoints } from './path-helpers';

/** リングを書く（moveTo の後に lineTo、closePath） */
function writeRing(context: ReturnType<typeof createRelativePathContext>, points: readonly (readonly [number, number])[]) {
  points.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
  context.closePath();
}

describe('createRelativePathContext', () => {
  test('F-MAP-01：小さな正方形が、絶対座標の M と、差分の l と、z の文字列になる', () => {
    // Arrange
    const context = createRelativePathContext();

    // Act
    writeRing(context, [
      [10, 20],
      [30, 20],
      [30, 40],
      [10, 40]
    ]);

    // Assert
    expect(context.toString()).toBe('M10,20l20,0,0,20-20,0z');
  });

  test('座標は 0.1 単位に丸め、先頭の0と、負の数・小数点の前の区切りを省く', () => {
    const context = createRelativePathContext();

    writeRing(context, [
      [0.5, 0.3],
      [0.84, 0.3],
      [0.2, 1.04],
      [0.5, 1.5]
    ]);

    // 丸めた絶対座標は (0.5, 0.3)・(0.8, 0.3)・(0.2, 1.0)・(0.5, 1.5)。差分は (.3, 0)・(-.6, .7)・(.3, .5)
    expect(context.toString()).toBe('M.5.3l.3,0-.6.7.3.5z');
    expect(absolutePoints(context.toString())).toEqual([
      [0.5, 0.3],
      [0.8, 0.3],
      [0.2, 1],
      [0.5, 1.5]
    ]);
  });

  test('0.1 の丸めの誤差が、差分を足してもたまらない（最後の点が絶対座標で丸めた値と同じ）', () => {
    // Arrange：1つずつ 0.0333 進む1000点。差分は丸めた絶対座標の差なので、誤差は1点ぶん（0.05）を超えない
    const context = createRelativePathContext();
    const points = Array.from({ length: 1000 }, (_, i) => [i * 0.0333, 500 - i * 0.0171] as const);

    // Act
    writeRing(context, points);

    // Assert
    const restored = absolutePoints(context.toString());
    const last = points[points.length - 1] as readonly [number, number];
    // 同じ座標に丸められた続きの点は省かれるので、最後の点は元の最後の点の丸めと同じ
    expect(restored[restored.length - 1]).toEqual([Math.round(last[0] * 10) / 10, Math.round(last[1] * 10) / 10]);
    for (const [x, y] of restored) {
      expect(Math.abs(x * 10 - Math.round(x * 10))).toBeLessThan(1e-9);
      expect(Math.abs(y * 10 - Math.round(y * 10))).toBeLessThan(1e-9);
    }
  });

  test('丸めて同じ座標になった続きの点は書かない', () => {
    const context = createRelativePathContext();

    writeRing(context, [
      [0, 0],
      [0.01, 0.02],
      [10, 0],
      [10, 10]
    ]);

    expect(context.toString()).toBe('M0,0l10,0,0,10z');
  });

  test('丸めると3点に満たないリングは書かない', () => {
    const context = createRelativePathContext();

    writeRing(context, [
      [0, 0],
      [0.01, 0.01],
      [0.02, 0.02]
    ]);
    writeRing(context, [
      [0, 0],
      [5, 0]
    ]);

    expect(context.toString()).toBe('');
  });

  test('複数のリングは、それぞれ M の絶対座標から書き始める', () => {
    const context = createRelativePathContext();

    writeRing(context, [
      [0, 0],
      [10, 0],
      [10, 10]
    ]);
    writeRing(context, [
      [50, 50],
      [60, 50],
      [60, 60]
    ]);

    expect(context.toString()).toBe('M0,0l10,0,0,10zM50,50l10,0,0,10z');
  });

  test('始点に戻る最後の点（閉じる点）は書かない', () => {
    const context = createRelativePathContext();

    writeRing(context, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0]
    ]);

    expect(context.toString()).toBe('M0,0l10,0,0,10z');
  });

  test('d3 が点（arc）を描こうとしたら例外にする（県の形には点がない）', () => {
    expect(() => createRelativePathContext().arc(0, 0, 1, 0, 1)).toThrow(/点/u);
  });
});
