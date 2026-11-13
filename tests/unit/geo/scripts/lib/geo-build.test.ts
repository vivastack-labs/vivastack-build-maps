import { geoBounds, geoContains } from 'd3-geo';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { feature } from 'topojson-client';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildGeo, GEO_BUILD_SETTINGS, type GeoBuildResult } from '../../../../../geo/scripts/lib/geo-build';
import type { NamingSources } from '../../../../../geo/scripts/lib/municipality';
import { islandFeature, N03_SAMPLE, SOUMU_SAMPLE } from '../../../../fixtures/geo/n03-sample';

// 第8章・7.4・F-MUNI-01：N03 から、県ごとの市区町村の TopoJSON と、都道府県の TopoJSON を作る
const NAMING: NamingSources = {
  soumu: new Map(SOUMU_SAMPLE.map(([code, name, kana]) => [code, { code, name, kana }])),
  kanaFixes: new Map(),
  romajiFixes: new Map()
};

type Collection = GeometryCollection<Record<string, unknown>>;

const parse = (json: string | undefined): Topology<Record<string, Collection>> => {
  if (json === undefined) throw new Error('出力がありません');
  return JSON.parse(json) as Topology<Record<string, Collection>>;
};

const geometriesOf = (topology: Topology<Record<string, Collection>>, name: string) => topology.objects[name]?.geometries ?? [];

const codeOf = (item: { properties?: unknown }): unknown => (item.properties as Record<string, unknown> | undefined)?.code;

describe('buildGeo', () => {
  let result: GeoBuildResult;

  beforeAll(async () => {
    result = await buildGeo(N03_SAMPLE, NAMING);
  });

  test('F-MUNI-01：県ごとに市区町村の TopoJSON を作る（オブジェクト名 municipalities、県の数）', () => {
    // Assert
    expect([...result.municipalities.keys()]).toEqual(['01', '13']);
    const hokkaido = parse(result.municipalities.get('01'));
    expect(hokkaido.type).toBe('Topology');
    expect(Object.keys(hokkaido.objects)).toEqual(['municipalities']);
    expect(geometriesOf(hokkaido, 'municipalities').map(codeOf)).toEqual(['01101', '01102', '01202']);
  });

  test('7.4・F-TIP-02：市区町村の属性は code・name・kana・cityName（区だけ）', () => {
    // Assert
    const [chuo, , hakodate] = geometriesOf(parse(result.municipalities.get('01')), 'municipalities');
    expect(chuo?.properties).toEqual({ code: '01101', name: { ja: '札幌市中央区', en: 'Chuo-ku, Sapporo-shi' }, kana: 'さっぽろしちゅうおうく', cityName: '札幌市' });
    expect(hakodate?.properties).toEqual({ code: '01202', name: { ja: '函館市', en: 'Hakodate-shi' }, kana: 'はこだてし' });
  });

  test('F-MUNI-01：複数の形に分かれた市区町村は1つにまとまる', () => {
    // Assert
    const hakodate = geometriesOf(parse(result.municipalities.get('01')), 'municipalities')[2];
    expect(hakodate?.type).toBe('MultiPolygon');
  });

  test('7.4：所属未定地は市区町村のファイルに入れず、県の形には含める', () => {
    // Arrange
    const prefs = parse(result.prefs);

    // Act
    const tokyoMunicipalities = geometriesOf(parse(result.municipalities.get('13')), 'municipalities').map(codeOf);
    const tokyoPref = feature(prefs, prefs.objects.prefectures as Collection).features.find(f => codeOf(f) === '13');
    const [[west], [east]] = geoBounds(tokyoPref ?? { type: 'Sphere' });

    // Assert
    expect(tokyoMunicipalities).toEqual(['13101']);
    expect(west).toBeCloseTo(139.7, 3);
    expect(east).toBeCloseTo(139.9, 3);
  });

  test('7.4：prefs の TopoJSON に、県ごとの code と label（経緯度、小数4桁）がある', () => {
    // Act
    const prefs = parse(result.prefs);
    const geometries = geometriesOf(prefs, 'prefectures');

    // Assert
    expect(Object.keys(prefs.objects)).toEqual(['prefectures']);
    const properties = geometries.map(geometry => geometry.properties as Record<string, unknown>);
    expect(properties.map(property => property.code)).toEqual(['01', '13']);
    const label = properties[1]?.label as [number, number];
    expect(label[0]).toBeGreaterThan(139.7);
    expect(label[0]).toBeLessThan(139.9);
    expect(label[1]).toBeGreaterThan(35.6);
    expect(label[1]).toBeLessThan(35.7);
    expect(label).toEqual(label.map(value => Math.round(value * 10_000) / 10_000));
  });

  test('8.2：同じ入力からは、いつも同じ文字列を出す', async () => {
    // Act
    const again = await buildGeo(N03_SAMPLE, NAMING);

    // Assert
    expect(again.prefs).toBe(result.prefs);
    expect([...again.municipalities.entries()]).toEqual([...result.municipalities.entries()]);
  });

  test('5.1：圧縮後の大きさが基準を超える県があればエラーにする', async () => {
    // Arrange
    const settings = { ...GEO_BUILD_SETTINGS, maxGzipBytes: 10 };

    // Act / Assert
    await expect(buildGeo(N03_SAMPLE, NAMING, settings)).rejects.toThrow('01');
  });

  test('D33：使われない修正表のコードがあればエラーにする', async () => {
    // Arrange
    const naming = { ...NAMING, romajiFixes: new Map([['12218', { code: '12218', name: '勝浦市', before: 'Katsura', after: 'Katsuura' }]]) };

    // Act / Assert
    await expect(buildGeo(N03_SAMPLE, naming)).rejects.toThrow('12218');
  });

  test('8.4：総務省のコード表にあって N03 にない市区町村があればエラーにする', async () => {
    // Arrange
    const naming = { ...NAMING, soumu: new Map([...NAMING.soumu, ['01203', { code: '01203', name: '小樽市', kana: 'ｵﾀﾙｼ' }]]) };

    // Act / Assert
    await expect(buildGeo(N03_SAMPLE, naming)).rejects.toThrow('01203');
  });
});

describe('buildGeo：県の形の小さな島', () => {
  // 千代田区（13101）の飛び地として、海に島を2つ置く。どちらも簡略化の度合い（1km）より細い
  // - 約1.5km²（経度0.012°×緯度0.012°）：残す
  // - 約0.17km²（経度0.004°×緯度0.004°）：除く
  const LARGE_ISLAND: readonly [number, number] = [139.75, 34.0];
  const SMALL_ISLAND: readonly [number, number] = [139.85, 34.0];
  const withIslands = {
    ...N03_SAMPLE,
    features: [...N03_SAMPLE.features, islandFeature(LARGE_ISLAND, 0.012), islandFeature(SMALL_ISLAND, 0.004)]
  };

  let prefsJson: string;

  beforeAll(async () => {
    prefsJson = (await buildGeo(withIslands, NAMING)).prefs;
  });

  const tokyoPrefOf = (json: string) => {
    const prefs = parse(json);
    const tokyo = feature(prefs, prefs.objects.prefectures as Collection).features.find(f => codeOf(f) === '13');
    if (!tokyo) throw new Error('東京都の形がありません');
    return tokyo;
  };

  test('7.4：県の形に、簡略化の度合いより細くても 1km² 以上の島を残す', () => {
    // Assert：島の中心が県の形に含まれる
    expect(geoContains(tokyoPrefOf(prefsJson), [LARGE_ISLAND[0] + 0.006, LARGE_ISLAND[1] + 0.006])).toBe(true);
  });

  test('7.4：県の形から、1km² より小さな島を除く', () => {
    // Act
    const tokyo = tokyoPrefOf(prefsJson);

    // Assert：形は本土の1つと、残した島の1つだけ
    const [[, south]] = geoBounds(tokyo);
    expect(tokyo.geometry.type).toBe('MultiPolygon');
    expect(tokyo.geometry.type === 'MultiPolygon' ? tokyo.geometry.coordinates.length : 1).toBe(2);
    expect(south).toBeCloseTo(34.0, 1);
    expect(geoContains(tokyo, [SMALL_ISLAND[0] + 0.002, SMALL_ISLAND[1] + 0.002])).toBe(false);
  });
});
