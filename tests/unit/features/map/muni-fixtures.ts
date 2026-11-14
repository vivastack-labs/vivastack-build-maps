// 市区町村の描画のテストで使う、小さな TopoJSON
import type { MuniTopology } from '@/features/map/muniLoader';

type Props = MuniTopology['objects']['municipalities']['geometries'][number]['properties'];

export const props = (code: string): Props => ({ code, name: { ja: `市${code}`, en: `City ${code}` }, kana: 'し' });

/**
 * 経緯度 (139, 35) を左下にした 2×2 の格子（1マス 0.1°。北西・北東・南西・南東）。隣り合う市区町村は弧を共有する。
 * 外周は時計回り（d3-geo の向き）。コードは配列の順とは逆（xx104 から始める）にして、並べ替えを確かめる。
 */
export function gridTopology(prefix = '13'): MuniTopology {
  const [A, B, C, D, E, F, G, H, I] = [
    [139, 35],
    [139.1, 35],
    [139.2, 35],
    [139, 35.1],
    [139.1, 35.1],
    [139.2, 35.1],
    [139, 35.2],
    [139.1, 35.2],
    [139.2, 35.2]
  ] as const;
  return {
    type: 'Topology',
    arcs: [
      [B, E],
      [D, E],
      [E, F],
      [E, H],
      [A, B],
      [D, A],
      [B, C],
      [C, F],
      [F, I],
      [I, H],
      [H, G],
      [G, D]
    ].map(arc => arc.map(point => [...point])),
    objects: {
      municipalities: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', arcs: [[3, -10, -9, -3]], properties: props(`${prefix}104`) },
          { type: 'Polygon', arcs: [[-12, -11, -4, -2]], properties: props(`${prefix}103`) },
          { type: 'Polygon', arcs: [[0, 2, -8, -7]], properties: props(`${prefix}102`) },
          { type: 'Polygon', arcs: [[-6, 1, -1, -5]], properties: props(`${prefix}101`) }
        ]
      }
    }
  } as unknown as MuniTopology;
}
