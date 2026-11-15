import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { iconLayout, iconSvg, ICON_SIZES, mainlandShape } from '../../../scripts/make-icons';

// T4-02：仮のアイコン。日本の形（47県のうち沖縄県を除く）を、色のついた正方形の上に描く
const topology: unknown = JSON.parse(readFileSync('geo/data/prefs.topo.json', 'utf8'));

describe('mainlandShape', () => {
  test('5.4：沖縄県の枠と、viewBox の外に出る島（小笠原村）を含まない外接矩形の中に収まる', () => {
    // Act
    const { d, bounds } = mainlandShape(topology);

    // Assert：北海道から九州までが入り、左上の沖縄の枠（x 20〜520・y 20〜325）には入らない
    expect(d.startsWith('M')).toBe(true);
    expect(bounds.x0).toBeGreaterThanOrEqual(0);
    expect(bounds.y0).toBeGreaterThanOrEqual(0);
    expect(bounds.x1).toBeLessThanOrEqual(1000);
    expect(bounds.y1).toBeLessThanOrEqual(1130);
    expect(bounds.x1 - bounds.x0).toBeGreaterThan(500);
    expect(bounds.y1 - bounds.y0).toBeGreaterThan(800);
  });

  test('5.4：TopoJSON でない入力は例外にする', () => {
    expect(() => mainlandShape({ type: 'FeatureCollection' })).toThrow('TopoJSON');
    expect(() => mainlandShape({ type: 'Topology', objects: {} })).toThrow('prefectures');
  });
});

describe('iconLayout', () => {
  const bounds = { x0: 100, y0: 50, x1: 500, y1: 850 };

  test('5.4：any は縦の80%に収め、中央に置く', () => {
    // Act
    const { scale, translate } = iconLayout(bounds, 'any');

    // Assert
    expect((bounds.y1 - bounds.y0) * scale).toBeCloseTo(512 * 0.8);
    const centerX = ((bounds.x0 + bounds.x1) / 2) * scale + translate[0];
    const centerY = ((bounds.y0 + bounds.y1) / 2) * scale + translate[1];
    expect(centerX).toBeCloseTo(256);
    expect(centerY).toBeCloseTo(256);
  });

  test('5.4：maskable は形の外接矩形の四隅が、中央の直径80%の円（セーフゾーン）に入る', () => {
    // Act
    const { scale, translate } = iconLayout(bounds, 'maskable');

    // Assert
    const corners = [
      [bounds.x0, bounds.y0],
      [bounds.x1, bounds.y0],
      [bounds.x0, bounds.y1],
      [bounds.x1, bounds.y1]
    ] as const;
    for (const [x, y] of corners) {
      const distance = Math.hypot(x * scale + translate[0] - 256, y * scale + translate[1] - 256);
      expect(distance).toBeLessThanOrEqual(512 * 0.4 + 0.001);
    }
  });
});

describe('iconSvg', () => {
  const shape = { d: 'M0,0L10,0L10,10Z', bounds: { x0: 0, y0: 0, x1: 10, y1: 10 } };

  test('5.4：any は角丸の背景、maskable・apple は全面の背景（角を丸めない）', () => {
    expect(iconSvg(shape, 'any')).toContain('rx=');
    expect(iconSvg(shape, 'maskable')).not.toContain('rx=');
    expect(iconSvg(shape, 'maskable')).toContain('viewBox="0 0 512 512"');
  });

  test('5.4：パスを含み、style 属性・スクリプトを含まない', () => {
    // Act
    const svg = iconSvg(shape, 'any');

    // Assert
    expect(svg).toContain('d="M0,0L10,0L10,10Z"');
    expect(svg).not.toMatch(/style=|<script/u);
  });
});

describe('ICON_SIZES', () => {
  test('5.4：manifest・apple-touch-icon が使うファイルを出す', () => {
    expect(ICON_SIZES.map(icon => icon.file)).toEqual(['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']);
  });
});
