// T1-04：変換を通すための小さな N03（GeoJSON）。2県・数個の市区町村。
// 形は手で作った四角形（経緯度）。属性は N03 2026年版と同じ名前（N03_001〜N03_007）。
//
// 北海道（01）：札幌市中央区・北区（政令指定都市の区。隣り合う）、函館市（2つの形に分かれる）
// 東京都（13）：千代田区（特別区。政令指定都市の区ではない）、所属未定地（13000。千代田区の隣）
import type { Feature, FeatureCollection, Polygon } from 'geojson';

type N03Properties = {
  readonly N03_001: string;
  readonly N03_002: string | null;
  readonly N03_003: string | null;
  readonly N03_004: string;
  readonly N03_005: string | null;
  readonly N03_007: string;
};

const SIZE = 0.1;

function square(lon: number, lat: number, properties: N03Properties): Feature<Polygon, N03Properties> {
  // GeoJSON の外側の輪は反時計回り
  const ring = [
    [lon, lat],
    [lon + SIZE, lat],
    [lon + SIZE, lat + SIZE],
    [lon, lat + SIZE],
    [lon, lat]
  ];
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } };
}

const hokkaido = (city: string, ward: string | null, code: string): N03Properties => ({
  N03_001: '北海道',
  N03_002: ward === null ? '渡島総合振興局' : '石狩振興局',
  N03_003: null,
  N03_004: city,
  N03_005: ward,
  N03_007: code
});

const tokyo = (name: string, code: string): N03Properties => ({ N03_001: '東京都', N03_002: null, N03_003: null, N03_004: name, N03_005: null, N03_007: code });

export const N03_SAMPLE: FeatureCollection<Polygon, N03Properties> = {
  type: 'FeatureCollection',
  features: [
    square(141.3, 43.0, hokkaido('札幌市', '中央区', '01101')),
    square(141.4, 43.0, hokkaido('札幌市', '北区', '01102')),
    square(140.7, 41.7, hokkaido('函館市', null, '01202')),
    square(141.0, 41.7, hokkaido('函館市', null, '01202')),
    square(139.7, 35.6, tokyo('千代田区', '13101')),
    square(139.8, 35.6, tokyo('所属未定地', '13000'))
  ]
};

/** 総務省のコード表のうち、N03_SAMPLE の市区町村に要る行（カナは半角） */
export const SOUMU_SAMPLE: readonly (readonly [code: string, name: string, kana: string])[] = [
  ['01100', '札幌市', 'ｻｯﾎﾟﾛｼ'],
  ['01101', '札幌市中央区', 'ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ'],
  ['01102', '札幌市北区', 'ｻｯﾎﾟﾛｼｷﾀｸ'],
  ['01202', '函館市', 'ﾊｺﾀﾞﾃｼ'],
  ['13101', '千代田区', 'ﾁﾖﾀﾞｸ']
];
