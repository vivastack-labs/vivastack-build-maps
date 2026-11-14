import { describe, expect, test } from 'vitest';
import type { MuniTopology } from '@/features/map/muniLoader';
import { selectLabels, visibleLabels } from '@/features/map/labels';
import { cachedMuniShapes, muniShapes } from '@/features/map/muniShapes';
import { gridTopology, props } from './muni-fixtures';
import { OKINAWA_FRAME, projectPoint } from '@/features/map/projection';

/** 長方形1つ（時計回り）を1つのポリゴンにする。座標は経緯度 */
const ring = (x0: number, y0: number, x1: number, y1: number): number[][] => [
  [x0, y0],
  [x0, y1],
  [x1, y1],
  [x1, y0],
  [x0, y0]
];

/** 大きな本島（0.2°角）と、離れた小さな島（0.01°角）を持つ MultiPolygon 1つ */
function islandTopology(lon: number, lat: number): MuniTopology {
  return {
    type: 'Topology',
    arcs: [ring(lon + 0.3, lat + 0.3, lon + 0.31, lat + 0.31), ring(lon, lat, lon + 0.2, lat + 0.2)],
    objects: { municipalities: { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1]]], properties: props(`${lon > 120 && lon < 130 ? '47' : '13'}101`) }] } }
  } as unknown as MuniTopology;
}

/** L字（腕の太さ 0.1°、長さ 1°）の市区町村 1つ。外接矩形は大きいが、ラベルを置ける広さは腕の太さしかない */
function lShapeTopology(): MuniTopology {
  const [lon, lat] = [139, 35];
  const l = [
    [lon, lat],
    [lon, lat + 1],
    [lon + 0.1, lat + 1],
    [lon + 0.1, lat + 0.1],
    [lon + 1, lat + 0.1],
    [lon + 1, lat],
    [lon, lat]
  ];
  return {
    type: 'Topology',
    arcs: [l],
    objects: { municipalities: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]], properties: props('13101') }] } }
  } as unknown as MuniTopology;
}

describe('muniShapes', () => {
  test('F-MUNI-01: 市区町村ごとに1つのパスを作り、code・名前を持つ（code の順）', () => {
    const result = muniShapes(gridTopology(), '13');

    expect(result?.shapes.map(shape => shape.code)).toEqual(['13101', '13102', '13103', '13104']);
    expect(result?.shapes[0]?.properties.name.ja).toBe('市13101');
    expect(result?.shapes.every(shape => shape.d.startsWith('M') && shape.d.length > 10)).toBe(true);
  });

  test('F-MUNI-01: 隣り合う市区町村は同じ濃淡にならない（0〜4）', () => {
    const shade = new Map(muniShapes(gridTopology(), '13')?.shapes.map(shape => [shape.code, shape.shade]));

    // 弧を共有する組（対角は接しない）
    for (const [a, b] of [
      ['13101', '13102'],
      ['13101', '13103'],
      ['13102', '13104'],
      ['13103', '13104']
    ] as const) {
      expect(shade.get(a)).not.toBe(shade.get(b));
    }
    expect([...shade.values()].every(value => value >= 0 && value <= 4)).toBe(true);
  });

  test('F-MUNI-01: 県の外周の線を作る', () => {
    const result = muniShapes(gridTopology(), '13');

    expect(result?.outline.startsWith('M')).toBe(true);
  });

  test('沖縄県（47）は点線枠の中に投影する', () => {
    const result = muniShapes(islandTopology(127.6, 26.1), '47');
    const label = result?.shapes[0]?.label;

    expect(label).toBeDefined();
    expect(label?.x).toBeGreaterThan(OKINAWA_FRAME.x);
    expect(label?.x).toBeLessThan(OKINAWA_FRAME.x + OKINAWA_FRAME.width);
    expect(label?.y).toBeGreaterThan(OKINAWA_FRAME.y);
    expect(label?.y).toBeLessThan(OKINAWA_FRAME.y + OKINAWA_FRAME.height);
  });

  test('ラベルの位置と大きさは、いちばん大きなポリゴンのもの（小さな島ではない）', () => {
    const label = muniShapes(islandTopology(139, 35), '13')?.shapes[0]?.label;
    const corners = [projectPoint([139, 35], '13'), projectPoint([139.2, 35], '13'), projectPoint([139, 35.2], '13'), projectPoint([139.2, 35.2], '13')];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const [boxWidth, boxHeight] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];

    expect(label?.x).toBeGreaterThan(Math.min(...xs));
    expect(label?.x).toBeLessThan(Math.max(...xs));
    expect(label?.y).toBeGreaterThan(Math.min(...ys));
    expect(label?.y).toBeLessThan(Math.max(...ys));
    // 点を通る水平・垂直の線が形の内側にある長さは、ほぼ四角の幅・高さ（投影で少し傾く）
    expect((label?.width ?? 0) / boxWidth).toBeGreaterThan(0.9);
    expect((label?.width ?? 0) / boxWidth).toBeLessThan(1.01);
    expect((label?.height ?? 0) / boxHeight).toBeGreaterThan(0.9);
    expect((label?.height ?? 0) / boxHeight).toBeLessThan(1.01);
    expect(label?.area).toBeGreaterThan(0);
  });

  test('F-MUNI-02: 凹んだ形（L字）は、外接矩形ではなく、点を通る線が内側にある長さをラベルの大きさにする', () => {
    const label = muniShapes(lShapeTopology(), '13')?.shapes[0]?.label;
    const [lowerLeft, upperRight] = [projectPoint([139, 35], '13'), projectPoint([140, 36], '13')];
    const boxWidth = Math.abs(upperRight[0] - lowerLeft[0]);

    expect(label).toBeDefined();
    // 腕の太さ（0.1° ≒ 外接矩形の 1/10）ほど。外接矩形の幅・高さよりずっと小さい
    expect(label?.width).toBeLessThan(boxWidth * 0.3);
    expect(label?.height).toBeLessThan(boxWidth * 0.3);
  });

  test('F-MUNI-02: L字の市区町村は、外接矩形に入る長さのラベルでも、倍率1では選ばれない（同じ外接矩形の四角は選ばれる）', () => {
    const label = muniShapes(lShapeTopology(), '13')?.shapes[0]?.label as NonNullable<ReturnType<typeof muniShapes>>['shapes'][number]['label'];
    const [lowerLeft, upperRight] = [projectPoint([139, 35], '13'), projectPoint([140, 36], '13')];
    const boxWidth = Math.abs(upperRight[0] - lowerLeft[0]);
    const candidate = { code: 'a', text: '市区町村', ...label };

    const lShaped = visibleLabels(selectLabels([candidate], 'ja'), 1);
    const rectangle = visibleLabels(selectLabels([{ ...candidate, width: boxWidth, height: boxWidth }], 'ja'), 1);

    expect(lShaped).toHaveLength(0);
    expect(rectangle).toHaveLength(1);
  });

  test('座標が有限の数でなければ、例外にせず null を返す（invalid）', () => {
    const topology = lShapeTopology();
    const broken = { ...topology, arcs: [[[Number.NaN, 35], ...(topology.arcs[0] as number[][]).slice(1)]] } as unknown as MuniTopology;

    expect(muniShapes(broken, '13')).toBeNull();
  });

  test('T2-07：geometry が壊れていたら例外にせず null を返す', () => {
    const broken = gridTopology();
    const geometries = [{ type: 'Polygon', arcs: [[99]], properties: props('13101') }];

    const result = muniShapes({ ...broken, objects: { municipalities: { type: 'GeometryCollection', geometries } } } as unknown as MuniTopology, '13');

    expect(result).toBeNull();
  });

  test('県コードが正しくなければ例外にする', () => {
    expect(() => muniShapes(gridTopology(), '99')).toThrow();
  });

  test('同じ TopoJSON は1回だけ計算する', () => {
    const topology = gridTopology();

    expect(muniShapes(topology, '13')).toBe(muniShapes(topology, '13'));
  });

  test('cachedMuniShapes：計算の前は undefined、後は結果（壊れていれば null）。計算はしない', () => {
    const topology = gridTopology();
    const broken = { ...gridTopology(), arcs: [] } as unknown as MuniTopology;

    expect(cachedMuniShapes(topology, '13')).toBeUndefined();
    const result = muniShapes(topology, '13');
    muniShapes(broken, '13');

    expect(cachedMuniShapes(topology, '13')).toBe(result);
    expect(cachedMuniShapes(broken, '13')).toBeNull();
    expect(cachedMuniShapes(topology, '14')).toBeUndefined();
  });

  test('元のデータを変えない', () => {
    const topology = gridTopology();
    const before = JSON.stringify(topology);

    muniShapes(topology, '13');

    expect(JSON.stringify(topology)).toBe(before);
  });
});
