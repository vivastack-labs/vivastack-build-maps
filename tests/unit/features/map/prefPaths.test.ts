import { describe, expect, test } from 'vitest';
import { buildPrefPaths, LABEL_FONT_SIZE, LABEL_OFFSETS, loadPrefPaths, type PrefPath } from '@/features/map/prefPaths';
import { OKINAWA_FRAME, VIEWBOX } from '@/features/map/projection';
import { LANGS } from '@/i18n/lang';

/** パスの文字列（"Mx,yLx,y…Z"）から、座標の組を取り出す。d3 の geoPath は絶対座標で出す */
function pathPoints(d: string): readonly (readonly [number, number])[] {
  const numbers = (d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gu) ?? []).map(Number);
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i] as number, numbers[i + 1] as number]);
  return points;
}

const insideViewBox = ([x, y]: readonly [number, number]) => x >= 0 && x <= VIEWBOX.width && y >= 0 && y <= VIEWBOX.height;

describe('loadPrefPaths', () => {
  const paths = loadPrefPaths();
  const byCode = (code: string): PrefPath => {
    const found = paths.find(p => p.code === code);
    if (!found) throw new Error(`県 ${code} がない`);
    return found;
  };

  test('F-MAP-01：47県のパスがあり、どれも空でない', () => {
    expect(paths).toHaveLength(47);
    for (const { code, d } of paths) {
      expect(d, `県 ${code} のパス`).toMatch(/^M/u);
      expect(pathPoints(d).length, `県 ${code} の点の数`).toBeGreaterThan(3);
    }
  });

  test('F-MAP-01：県コードが 01〜47 の順に1つずつある', () => {
    const expected = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));
    expect(paths.map(p => p.code)).toEqual(expected);
  });

  test('F-MAP-01：県名ラベルの位置がすべて viewBox の中にある（ja・en・zh）', () => {
    for (const { code, labels } of paths) {
      for (const lang of LANGS) {
        const { x, y } = labels[lang];
        expect(insideViewBox([x, y]), `県 ${code} のラベル（${lang}：${x}, ${y}）`).toBe(true);
      }
    }
  });

  test('F-MAP-02：沖縄県の県名ラベルが点線枠の中にある（ja・en・zh）', () => {
    for (const lang of LANGS) {
      const { x, y } = byCode('47').labels[lang];
      expect(x).toBeGreaterThan(OKINAWA_FRAME.x);
      expect(x).toBeLessThan(OKINAWA_FRAME.x + OKINAWA_FRAME.width);
      expect(y).toBeGreaterThan(OKINAWA_FRAME.y);
      expect(y).toBeLessThan(OKINAWA_FRAME.y + OKINAWA_FRAME.height);
    }
  });

  test('F-MAP-01：重なりを避けるずらしは、県コードを指し、小さい量である', () => {
    for (const lang of LANGS) {
      for (const [code, [dx, dy]] of Object.entries(LABEL_OFFSETS[lang])) {
        expect(
          paths.map(p => p.code),
          `${lang} のずらし ${code}`
        ).toContain(code);
        expect(Math.hypot(dx, dy), `${lang} の県 ${code} のずらし`).toBeLessThanOrEqual(30);
      }
    }
  });

  test('F-MAP-01：県名ラベルの文字の大きさは、横に長い英語のほうが小さい', () => {
    expect(LABEL_FONT_SIZE.ja).toBe(LABEL_FONT_SIZE.zh);
    expect(LABEL_FONT_SIZE.en).toBeLessThan(LABEL_FONT_SIZE.ja);
  });

  test('U16：どの県のパスの座標も viewBox の外に出ない', () => {
    for (const { code, d } of paths) {
      const outside = pathPoints(d).filter(point => !insideViewBox(point));
      expect(outside, `県 ${code} の viewBox の外の点`).toEqual([]);
    }
  });

  test('U16：東京都の形に、viewBox の中の父島が残る', () => {
    // 父島は viewBox の座標で (738, 1110) の付近
    const nearChichijima = pathPoints(byCode('13').d).some(([x, y]) => Math.abs(x - 738) < 5 && Math.abs(y - 1110) < 5);
    expect(nearChichijima).toBe(true);
  });
});

describe('buildPrefPaths', () => {
  const square = [
    [139, 35],
    [140, 35],
    [140, 36],
    [139, 35]
  ];
  const topologyWith = (objects: unknown) => ({ type: 'Topology', arcs: [square], objects });
  const prefecture = (properties: unknown) => ({ type: 'Polygon', arcs: [[0]], properties });

  test('F-MAP-01：県の形と県名ラベルの位置を返す', () => {
    const topology = topologyWith({ prefectures: { type: 'GeometryCollection', geometries: [prefecture({ code: '13', label: [139.6, 35.4] })] } });

    const [path] = buildPrefPaths(topology);

    expect(path?.code).toBe('13');
    expect(path?.d).toMatch(/^M/u);
  });

  test('prefs.topo.json の形が違うと例外にする：オブジェクト名 prefectures がない', () => {
    expect(() => buildPrefPaths(topologyWith({ other: {} }))).toThrow(/prefectures/u);
  });

  test('prefs.topo.json の形が違うと例外にする：Topology でない', () => {
    expect(() => buildPrefPaths({ type: 'FeatureCollection' })).toThrow(/Topology/u);
    expect(() => buildPrefPaths(null)).toThrow(/Topology/u);
  });

  test('prefs.topo.json の形が違うと例外にする：code がない・label が経緯度でない', () => {
    const withProps = (properties: unknown) => topologyWith({ prefectures: { type: 'GeometryCollection', geometries: [prefecture(properties)] } });

    expect(() => buildPrefPaths(withProps({ label: [139.6, 35.4] }))).toThrow(/code/u);
    expect(() => buildPrefPaths(withProps({ code: '13' }))).toThrow(/label/u);
    expect(() => buildPrefPaths(withProps({ code: '13', label: [139.6] }))).toThrow(/label/u);
  });

  test('prefs.topo.json の形が違うと例外にする：形が Polygon・MultiPolygon でない', () => {
    const topology = topologyWith({
      prefectures: { type: 'GeometryCollection', geometries: [{ type: 'LineString', arcs: [0], properties: { code: '13', label: [139.6, 35.4] } }] }
    });

    expect(() => buildPrefPaths(topology)).toThrow(/Polygon/u);
  });
});
