import { describe, expect, test } from 'vitest';
import type { MuniTopology } from '@/features/map/muniLoader';
import { muniShapes } from '@/features/map/muniShapes';
import { OKINAWA_FRAME, projectPoint } from '@/features/map/projection';

type Props = MuniTopology['objects']['municipalities']['geometries'][number]['properties'];

const props = (code: string): Props => ({ code, name: { ja: `市${code}`, en: `City ${code}` }, kana: 'し' });

/**
 * 経緯度 (139, 35) を左下にした 2×2 の格子（北西・北東・南西・南東）。隣り合う市区町村は弧を共有する。
 * 外周は時計回り（d3-geo の向き）。コードは配列の順とは逆（13104 から始める）にして、並べ替えを確かめる。
 */
function gridTopology(): MuniTopology {
  const [A, B, C, D, E, F, G, H, I] = [
    [139, 35], [139.02, 35], [139.04, 35],
    [139, 35.02], [139.02, 35.02], [139.04, 35.02],
    [139, 35.04], [139.02, 35.04], [139.04, 35.04]
  ] as const;
  return {
    type: 'Topology',
    arcs: [[B, E], [D, E], [E, F], [E, H], [A, B], [D, A], [B, C], [C, F], [F, I], [I, H], [H, G], [G, D]].map(arc => arc.map(point => [...point])),
    objects: {
      municipalities: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', arcs: [[3, -10, -9, -3]], properties: props('13104') },
          { type: 'Polygon', arcs: [[-12, -11, -4, -2]], properties: props('13103') },
          { type: 'Polygon', arcs: [[0, 2, -8, -7]], properties: props('13102') },
          { type: 'Polygon', arcs: [[-6, 1, -1, -5]], properties: props('13101') }
        ]
      }
    }
  } as unknown as MuniTopology;
}

/** 長方形1つ（時計回り）を1つのポリゴンにする。座標は経緯度 */
const ring = (x0: number, y0: number, x1: number, y1: number): number[][] => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];

/** 大きな本島（0.2°角）と、離れた小さな島（0.01°角）を持つ MultiPolygon 1つ */
function islandTopology(lon: number, lat: number): MuniTopology {
  return {
    type: 'Topology',
    arcs: [ring(lon + 0.3, lat + 0.3, lon + 0.31, lat + 0.31), ring(lon, lat, lon + 0.2, lat + 0.2)],
    objects: { municipalities: { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1]]], properties: props(`${lon > 120 && lon < 130 ? '47' : '13'}101`) }] } }
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
    for (const [a, b] of [['13101', '13102'], ['13101', '13103'], ['13102', '13104'], ['13103', '13104']] as const) {
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

  test('ラベルの位置と外接矩形は、いちばん大きなポリゴンのもの', () => {
    const label = muniShapes(islandTopology(139, 35), '13')?.shapes[0]?.label;
    const corners = [projectPoint([139, 35], '13'), projectPoint([139.2, 35], '13'), projectPoint([139, 35.2], '13'), projectPoint([139.2, 35.2], '13')];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);

    expect(label?.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 5);
    expect(label?.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 5);
    expect(label?.x).toBeGreaterThan(Math.min(...xs));
    expect(label?.x).toBeLessThan(Math.max(...xs));
    expect(label?.y).toBeGreaterThan(Math.min(...ys));
    expect(label?.y).toBeLessThan(Math.max(...ys));
    expect(label?.area).toBeGreaterThan(0);
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

  test('元のデータを変えない', () => {
    const topology = gridTopology();
    const before = JSON.stringify(topology);

    muniShapes(topology, '13');

    expect(JSON.stringify(topology)).toBe(before);
  });
});
