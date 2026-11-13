import { describe, expect, test } from 'vitest';
import { buildPrefPaths, LABEL_FONT_SIZE, LABEL_OFFSETS, loadPrefPaths, type PrefPath } from '@/features/map/prefPaths';
import { OKINAWA_FRAME, projectPoint, VIEWBOX } from '@/features/map/projection';
import { LANGS } from '@/i18n/lang';
import { absolutePoints } from './path-helpers';

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
      expect(d, `県 ${code} のパス`).toMatch(/^M[^l]*l/u);
      expect(absolutePoints(d).length, `県 ${code} の点の数`).toBeGreaterThan(3);
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

  test('U16：今のデータでは、どの県のパスの座標も viewBox の外に出ない', () => {
    for (const { code, d } of paths) {
      const outside = absolutePoints(d).filter(point => !insideViewBox(point));
      expect(outside, `県 ${code} の viewBox の外の点`).toEqual([]);
    }
  });

  test('U16：東京都の形に、viewBox の中の父島が残る', () => {
    // 父島は viewBox の座標で (738, 1110) の付近
    const nearChichijima = absolutePoints(byCode('13').d).some(([x, y]) => Math.abs(x - 738) < 5 && Math.abs(y - 1110) < 5);
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

  test('F-MAP-01：パスは M の絶対座標と、l の差分でできていて、元の座標と 0.1 以内で同じである', () => {
    // 139.5〜140.5°E・35.5〜36.5°N の四角（d3 の向きに合わせて時計回り）を、東京都として描く
    const ring = [
      [139.5, 35.5],
      [139.5, 36.5],
      [140.5, 36.5],
      [140.5, 35.5],
      [139.5, 35.5]
    ];
    const topology = { type: 'Topology', arcs: [ring], objects: { prefectures: { type: 'GeometryCollection', geometries: [prefecture({ code: '13', label: [140, 36] })] } } };

    const [path] = buildPrefPaths(topology);

    expect(path?.d).toMatch(/^M[^l]+l[^lMz]+z$/u);
    const corners = [
      [139.5, 35.5],
      [139.5, 36.5],
      [140.5, 36.5],
      [140.5, 35.5]
    ].map(([lon, lat]) => projectPoint([lon as number, lat as number], '13'));
    const restored = absolutePoints(path?.d ?? '');
    // 縁の点（辺の途中に d3 が足す点）を含むので、角が復元した点のどれかと 0.1 以内で一致することを確かめる
    for (const [x, y] of corners) {
      expect(restored.some(([rx, ry]) => Math.abs(rx - x) <= 0.1 && Math.abs(ry - y) <= 0.1)).toBe(true);
    }
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

  describe('U16：viewBox の外に出る島を除く', () => {
    /** 1辺 size 度の四角。d3 の向き（外側のリングは時計回り）に合わせる */
    const island = (lon: number, lat: number, size = 0.1) => [
      [lon, lat],
      [lon, lat + size],
      [lon + size, lat + size],
      [lon + size, lat],
      [lon, lat]
    ];
    /** 東京都（13）の MultiPolygon。島ごとに arc を1つ持つ */
    const tokyoWith = (islands: readonly (readonly (readonly number[])[])[]) => ({
      type: 'Topology',
      arcs: islands,
      objects: {
        prefectures: {
          type: 'GeometryCollection',
          geometries: [{ type: 'MultiPolygon', arcs: islands.map((_, i) => [[i]]), properties: { code: '13', label: [139.7, 35.7] } }]
        }
      }
    });
    const ringCount = (d: string) => (d.match(/M/gu) ?? []).length;

    test('(a) viewBox の内側の島と外側の島を持つとき、内側の島だけが残る', () => {
      const inside = island(139.7, 35.6);
      const outside = island(160, 20); // viewBox の外（右下）

      const [path] = buildPrefPaths(tokyoWith([inside, outside]));

      expect(ringCount(path?.d ?? '')).toBe(1);
      expect(absolutePoints(path?.d ?? '').every(point => insideViewBox(point))).toBe(true);
    });

    test('(b) 一部だけ viewBox からはみ出す島は残る', () => {
      // 緯度 26〜27°N の島は、viewBox の下の端（y=1130）をまたぐ
      const [, topY] = projectPoint([142.2, 27], '13');
      const [, bottomY] = projectPoint([142.2, 26], '13');
      expect(topY).toBeLessThan(VIEWBOX.height);
      expect(bottomY).toBeGreaterThan(VIEWBOX.height);

      const [path] = buildPrefPaths(tokyoWith([island(139.7, 35.6), island(142.1, 26, 1)]));

      expect(ringCount(path?.d ?? '')).toBe(2);
      expect(absolutePoints(path?.d ?? '').some(([, y]) => y > VIEWBOX.height)).toBe(true);
    });

    test('(c) 県の形が全部 viewBox の外にあると例外にする', () => {
      expect(() => buildPrefPaths(tokyoWith([island(160, 20)]))).toThrow(/viewBox/u);
    });
  });
});
