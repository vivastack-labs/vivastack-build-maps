import { describe, expect, test } from 'vitest';
import { createProjection, OKINAWA_FRAME, OKINAWA_TRANSFORM, projectPoint, VIEWBOX, type LonLat } from '@/features/map/projection';

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Box = readonly [west: number, south: number, east: number, north: number];

// N03 2026年版の形の外接矩形（T1-03 で .shp から県ごとに集計。小数第2位で外側に丸めた）。
// 東京都は小笠原村を除く（U16）。所属未定地（伊豆諸島の南の岩礁など）は含める
const PREF_BOXES: readonly (readonly [code: string, name: string, box: Box])[] = [
  ['01', '北海道（北方領土を含む）', [139.32, 41.34, 148.9, 45.57]],
  ['02', '青森県', [139.49, 40.21, 141.69, 41.57]],
  ['03', '岩手県', [140.64, 38.74, 142.08, 40.46]],
  ['04', '宮城県', [140.26, 37.76, 141.69, 39.01]],
  ['05', '秋田県', [139.68, 38.86, 141.01, 40.52]],
  ['06', '山形県', [139.51, 37.72, 140.66, 39.23]],
  ['07', '福島県', [139.15, 36.78, 141.06, 37.99]],
  ['08', '茨城県', [139.68, 35.73, 140.86, 36.96]],
  ['09', '栃木県', [139.32, 36.19, 140.3, 37.17]],
  ['10', '群馬県', [138.39, 35.98, 139.68, 37.07]],
  ['11', '埼玉県', [138.7, 35.74, 139.91, 36.29]],
  ['12', '千葉県', [139.73, 34.89, 140.89, 36.11]],
  ['13', '東京都（小笠原村を除く）', [138.81, 29.78, 140.35, 35.91]],
  ['14', '神奈川県', [138.91, 35.12, 139.85, 35.68]],
  ['15', '新潟県', [137.62, 36.73, 139.91, 38.56]],
  ['16', '富山県', [136.76, 36.26, 137.77, 36.99]],
  ['17', '石川県', [136.23, 36.06, 137.37, 37.87]],
  ['18', '福井県', [135.44, 35.33, 136.84, 36.31]],
  ['19', '山梨県', [138.17, 35.16, 139.14, 35.98]],
  ['20', '長野県', [137.31, 35.19, 138.75, 37.04]],
  ['21', '岐阜県', [136.27, 35.12, 137.66, 36.48]],
  ['22', '静岡県', [137.46, 34.56, 139.19, 35.66]],
  ['23', '愛知県', [136.66, 34.56, 137.85, 35.43]],
  ['24', '三重県', [135.84, 33.71, 137.0, 35.27]],
  ['25', '滋賀県', [135.75, 34.78, 136.47, 35.71]],
  ['26', '京都府', [134.84, 34.7, 136.07, 35.79]],
  ['27', '大阪府', [135.08, 34.26, 135.76, 35.06]],
  ['28', '兵庫県', [134.24, 34.15, 135.48, 35.68]],
  ['29', '奈良県', [135.53, 33.85, 136.24, 34.79]],
  ['30', '和歌山県', [134.99, 33.42, 136.02, 34.39]],
  ['31', '鳥取県', [133.13, 35.05, 134.53, 35.62]],
  ['32', '島根県（竹島を含む）', [131.66, 34.29, 133.4, 37.26]],
  ['33', '岡山県', [133.26, 34.29, 134.42, 35.36]],
  ['34', '広島県', [132.03, 34.02, 133.48, 35.12]],
  ['35', '山口県', [130.76, 33.7, 132.5, 34.81]],
  ['36', '徳島県', [133.65, 33.53, 134.83, 34.26]],
  ['37', '香川県', [133.44, 34.0, 134.46, 34.57]],
  ['38', '愛媛県', [132.0, 32.87, 133.7, 34.31]],
  ['39', '高知県', [132.47, 32.69, 134.32, 33.89]],
  ['40', '福岡県', [129.97, 32.99, 131.2, 34.26]],
  ['41', '佐賀県', [129.73, 32.94, 130.55, 33.63]],
  ['42', '長崎県', [128.09, 31.96, 130.4, 34.74]],
  ['43', '熊本県', [129.93, 32.08, 131.34, 33.21]],
  ['44', '大分県', [130.81, 32.7, 132.19, 33.75]],
  ['45', '宮崎県', [130.69, 31.35, 131.9, 32.85]],
  ['46', '鹿児島県（奄美群島を含む）', [128.39, 27.01, 131.22, 32.32]]
];
const OKINAWA_BOX: Box = [122.92, 24.04, 131.34, 27.9];

// 外接矩形の四隅と各辺の中点（円錐図法では緯線が弧になり、辺の途中が端になることがあるため）
function samplePoints([west, south, east, north]: Box): readonly LonLat[] {
  const midLon = (west + east) / 2;
  const midLat = (south + north) / 2;
  return [
    [west, south],
    [west, north],
    [east, south],
    [east, north],
    [midLon, south],
    [midLon, north],
    [west, midLat],
    [east, midLat]
  ];
}

function isInside([x, y]: readonly [number, number], rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

const VIEWBOX_RECT: Rect = { x: 0, y: 0, ...VIEWBOX };

describe('projectPoint：本体の枠（F-MAP-01）', () => {
  test.each([
    ['東京都庁', '13', [139.6917, 35.6895]],
    ['北海道庁', '01', [141.3469, 43.0642]],
    ['鹿児島県庁', '46', [130.5581, 31.5602]]
  ] as const)('F-MAP-01：%s の位置が viewBox の中に入る', (_name, prefCode, lonLat) => {
    // Act
    const point = projectPoint(lonLat, prefCode);

    // Assert
    expect(isInside(point, VIEWBOX_RECT)).toBe(true);
  });

  test.each(PREF_BOXES)('F-MAP-01：%s %s の形の外接矩形が viewBox の中に入る', (prefCode, _name, box) => {
    // Act
    const points = samplePoints(box).map(lonLat => projectPoint(lonLat, prefCode));

    // Assert
    expect(points.every(point => isInside(point, VIEWBOX_RECT))).toBe(true);
  });
});

describe('projectPoint：沖縄の点線枠（F-MAP-02）', () => {
  test('F-MAP-02：沖縄県庁の位置は点線枠の中に移る', () => {
    // Act
    const point = projectPoint([127.6809, 26.2124], '47');

    // Assert
    expect(isInside(point, OKINAWA_FRAME)).toBe(true);
  });

  test('F-MAP-02：沖縄県の形の外接矩形（与那国島・波照間島・尖閣諸島・大東諸島・硫黄鳥島）も点線枠の中に移る', () => {
    // Act
    const points = samplePoints(OKINAWA_BOX).map(lonLat => projectPoint(lonLat, '47'));

    // Assert
    expect(points.every(point => isInside(point, OKINAWA_FRAME))).toBe(true);
  });

  test.each([
    ['沖縄県庁', [127.6809, 26.2124]],
    ['与那国島', [122.93, 24.45]],
    ['北大東島', [131.3, 25.95]]
  ] as const)('F-MAP-02：沖縄県は等倍のまま平行移動する（%s で、本体の位置との差が OKINAWA_TRANSFORM の移動に等しい）', (_name, lonLat) => {
    // Act
    const [x, y] = projectPoint(lonLat, '47');
    const [mainX, mainY] = projectPoint(lonLat, '01');

    // Assert：3点で差が同じなら、縮尺は変わっていない
    expect(OKINAWA_TRANSFORM.scale).toBe(1);
    expect(x - mainX).toBeCloseTo(OKINAWA_TRANSFORM.dx, 9);
    expect(y - mainY).toBeCloseTo(OKINAWA_TRANSFORM.dy, 9);
  });

  test('F-MAP-02：点線枠は viewBox の中にある', () => {
    // Act
    const corners = [
      [OKINAWA_FRAME.x, OKINAWA_FRAME.y],
      [OKINAWA_FRAME.x + OKINAWA_FRAME.width, OKINAWA_FRAME.y + OKINAWA_FRAME.height]
    ] as const;

    // Assert
    expect(corners.every(corner => isInside(corner, VIEWBOX_RECT))).toBe(true);
  });

  test.each(PREF_BOXES)('F-MAP-02：点線枠は %s %s の形の外接矩形と重ならない', (prefCode, _name, box) => {
    // Act
    const points = samplePoints(box).map(lonLat => projectPoint(lonLat, prefCode));

    // Assert：すべての点が枠の右、またはすべての点が枠の下にある
    const right = OKINAWA_FRAME.x + OKINAWA_FRAME.width;
    const bottom = OKINAWA_FRAME.y + OKINAWA_FRAME.height;
    const isSeparated = points.every(([x]) => x > right) || points.every(([, y]) => y > bottom);
    expect(isSeparated).toBe(true);
  });
});

describe('projectPoint と createProjection（6.6 (1)）', () => {
  // 投影の設定を変えると、ビルド時に作った都道府県の形と、実行時に描く市区町村の形がずれる。
  // 設定を変えるときは、この値も意図して直す（T1-03）
  test.each([
    ['東京都庁', '13', [139.6917, 35.6895], [593.473, 617.352]],
    ['北海道庁', '01', [141.3469, 43.0642], [650.576, 191.737]],
    ['鹿児島県庁', '46', [130.5581, 31.5602], [151.27, 845.733]],
    ['沖縄県庁', '47', [127.6809, 26.2124], [304.738, 164.956]]
  ] as const)('6.6 (1)：%s の座標は決めた値から変わらない', (_name, prefCode, lonLat, [expectedX, expectedY]) => {
    // Act
    const [x, y] = projectPoint(lonLat, prefCode);

    // Assert
    expect(x).toBeCloseTo(expectedX, 2);
    expect(y).toBeCloseTo(expectedY, 2);
  });

  const lonLat: LonLat = [128.4, 27.05];

  test.each(['13', '46'])('6.6 (1)：沖縄県以外（%s）の位置は、沖縄の変換を受けない', prefCode => {
    // Act
    const point = projectPoint(lonLat, prefCode);
    const mainPoint = projectPoint(lonLat, '01');

    // Assert
    expect(point).toEqual(mainPoint);
  });

  test('6.6 (1)：同じ経緯度でも、沖縄県（47）は沖縄の変換を受けて別の位置になる', () => {
    // Act
    const okinawa = projectPoint(lonLat, '47');
    const kagoshima = projectPoint(lonLat, '46');

    // Assert
    expect(okinawa).not.toEqual(kagoshima);
  });

  test.each(['47', '13'])('6.6 (1)：同じ入力には、いつも同じ座標を返す（%s）', prefCode => {
    // Act
    const first = projectPoint([139.6917, 35.6895], prefCode);
    const second = projectPoint([139.6917, 35.6895], prefCode);
    const fromNewProjection = createProjection(prefCode)([139.6917, 35.6895]);

    // Assert
    expect(second).toEqual(first);
    expect(fromNewProjection).toEqual(first);
  });

  test.each(['47', '01'])('6.6 (1)：createProjection の投影（%s）は projectPoint と同じ座標を返す', prefCode => {
    // Arrange
    const projection = createProjection(prefCode);

    // Act
    const fromProjection = projection([127.6809, 26.2124]);
    const fromPoint = projectPoint([127.6809, 26.2124], prefCode);

    // Assert
    expect(fromProjection).toEqual(fromPoint);
  });

  test('6.6 (1)：返した投影の設定を変えても、次に作る投影は変わらない', () => {
    // Arrange
    const before = projectPoint([139.6917, 35.6895], '13');

    // Act
    createProjection('13').scale(1).translate([0, 0]);
    const after = projectPoint([139.6917, 35.6895], '13');

    // Assert
    expect(after).toEqual(before);
  });

  test.each(['48', '00', '1', '', '4７', '131'])('6.6 (1)：県コードが 01〜47 の2桁でなければエラーにする（"%s"）', prefCode => {
    // Act & Assert
    expect(() => projectPoint([139.6917, 35.6895], prefCode)).toThrow(/県コード/);
    expect(() => createProjection(prefCode)).toThrow(/県コード/);
  });

  test.each([
    [Number.NaN, 35],
    [139, Number.POSITIVE_INFINITY],
    [181, 35],
    [139, -91]
  ])('6.6 (1)：経緯度が範囲外か有限の数でなければエラーにする（%s, %s）', (lon, lat) => {
    // Act & Assert
    expect(() => projectPoint([lon, lat], '13')).toThrow(/経緯度/);
  });
});
