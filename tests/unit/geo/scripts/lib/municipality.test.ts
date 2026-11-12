import { describe, expect, test } from 'vitest';
import type { FixTable } from '../../../../../geo/scripts/lib/fixes';
import { assertFixesUsed, toMunicipality, type NamingSources } from '../../../../../geo/scripts/lib/municipality';
import type { SoumuEntry } from '../../../../../geo/scripts/lib/soumu';

// 7.4・7.4.1・F-TIP-02・D16・D33：N03 の属性の1行から、市区町村の項目（code・name.ja・kana・name.en・cityName）を作る
const soumu = (entries: readonly (readonly [string, string, string])[]): ReadonlyMap<string, SoumuEntry> => new Map(entries.map(([code, name, kana]) => [code, { code, name, kana }]));

const fixes = (entries: readonly (readonly [string, string, string, string])[]): FixTable => new Map(entries.map(([code, name, before, after]) => [code, { code, name, before, after }]));

const SOUMU = soumu([
  ['01100', '札幌市', 'ｻｯﾎﾟﾛｼ'],
  ['01101', '札幌市中央区', 'ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ'],
  ['01202', '函館市', 'ﾊｺﾀﾞﾃｼ'],
  ['06428', '庄内町', 'ｼﾖｳﾅｲﾏﾁ'],
  ['12218', '勝浦市', 'ｶﾂｳﾗｼ'],
  ['13101', '千代田区', 'ﾁﾖﾀﾞｸ'],
  ['14100', '横浜市', 'ﾖｺﾊﾏｼ'],
  ['14109', '横浜市港北区', 'ﾖｺﾊﾏｼｺｳﾎｸｸ'],
  ['33100', '岡山市', 'ｵｶﾔﾏｼ'],
  ['33101', '岡山市北区', 'ｵｶﾔﾏｼｷﾀｸ'],
  ['22100', '静岡市', 'ｼｽﾞｵｶｼ'],
  ['22101', '静岡市葵区', 'ｱｵｲｸ']
]);

const NO_FIXES: NamingSources = { soumu: SOUMU, kanaFixes: new Map(), romajiFixes: new Map() };

const row = (code: string, city: string, ward = '') => ({ N03_004: city, N03_005: ward, N03_007: code });

describe('toMunicipality', () => {
  test('F-TIP-02：市町村は code・name.ja・kana・name.en を持ち、cityName を持たない', () => {
    // Act
    const municipality = toMunicipality(row('01202', '函館市'), NO_FIXES);

    // Assert
    expect(municipality).toEqual({ code: '01202', name: { ja: '函館市', en: 'Hakodate-shi' }, kana: 'はこだてし' });
    expect(municipality).not.toHaveProperty('cityName');
  });

  test('F-TIP-02：東京都の特別区は区だが政令指定都市の区ではないので、cityName を持たない', () => {
    // Act
    const municipality = toMunicipality(row('13101', '千代田区'), NO_FIXES);

    // Assert
    expect(municipality).toEqual({ code: '13101', name: { ja: '千代田区', en: 'Chiyoda-ku' }, kana: 'ちよだく' });
  });

  test('F-TIP-02・D16：政令指定都市の区は name.ja が「市名＋区名」で、cityName に市の名前が入る', () => {
    // Act
    const municipality = toMunicipality(row('01101', '札幌市', '中央区'), NO_FIXES);

    // Assert
    expect(municipality.name.ja).toBe('札幌市中央区');
    expect(municipality.cityName).toBe('札幌市');
  });

  test('D33：区の kana は市名を含む読み（さっぽろしちゅうおうく）', () => {
    // Act
    const municipality = toMunicipality(row('01101', '札幌市', '中央区'), NO_FIXES);

    // Assert
    expect(municipality.kana).toBe('さっぽろしちゅうおうく');
  });

  test.each([
    ['01101', '札幌市', '中央区', 'Chuo-ku, Sapporo-shi'],
    ['14109', '横浜市', '港北区', 'Kohoku-ku, Yokohama-shi'],
    ['33101', '岡山市', '北区', 'Kita-ku, Okayama-shi']
  ])('D33：区の name.en は「区, 市」（%s %s%s → %s）', (code, city, ward, expected) => {
    // Act
    const municipality = toMunicipality(row(code, city, ward), NO_FIXES);

    // Assert
    expect(municipality.name.en).toBe(expected);
  });

  test('D33：読みの修正表にあるコードは、修正した読みとローマ字になる（庄内町 → しょうないまち・Shonai-machi）', () => {
    // Arrange
    const sources = { ...NO_FIXES, kanaFixes: fixes([['06428', '庄内町', 'しようないまち', 'しょうないまち']]) };

    // Act
    const municipality = toMunicipality(row('06428', '庄内町'), sources);

    // Assert
    expect(municipality.kana).toBe('しょうないまち');
    expect(municipality.name.en).toBe('Shonai-machi');
  });

  test('D33：ローマ字の修正表にあるコードは、語幹だけを直し、接尾辞は規則のまま付ける（勝浦市 → Katsuura-shi）', () => {
    // Arrange
    const sources = { ...NO_FIXES, romajiFixes: fixes([['12218', '勝浦市', 'Katsura', 'Katsuura']]) };

    // Act
    const municipality = toMunicipality(row('12218', '勝浦市'), sources);

    // Assert
    expect(municipality.name.en).toBe('Katsuura-shi');
    expect(municipality.kana).toBe('かつうらし');
  });

  test('D33：区の語幹の修正は区の部分にだけ当たる', () => {
    // Arrange
    const sources = { ...NO_FIXES, romajiFixes: fixes([['14109', '横浜市港北区', 'Kohoku', 'Kouhoku']]) };

    // Act
    const municipality = toMunicipality(row('14109', '横浜市', '港北区'), sources);

    // Assert
    expect(municipality.name.en).toBe('Kouhoku-ku, Yokohama-shi');
  });

  test('カナがないコードはエラーにする', () => {
    // Act / Assert
    expect(() => toMunicipality(row('99999', '架空市'), NO_FIXES)).toThrow('99999');
  });

  test('政令指定都市の区で、同じ県に市の行がなければエラーにする', () => {
    // Arrange
    const sources = { ...NO_FIXES, soumu: soumu([['01101', '札幌市中央区', 'ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ']]) };

    // Act / Assert
    expect(() => toMunicipality(row('01101', '札幌市', '中央区'), sources)).toThrow('札幌市');
  });

  test('区のカナが市のカナから始まらなければエラーにする', () => {
    // Act / Assert
    expect(() => toMunicipality(row('22101', '静岡市', '葵区'), NO_FIXES)).toThrow('22101');
  });

  test.each([
    ['kanaFixes', '06428', '庄内町', 'しようないちょう', 'しょうないまち'],
    ['romajiFixes', '12218', '勝浦市', 'Katsuraa', 'Katsuura']
  ] as const)('修正表（%s）の「直す前」の値が、いまの変換結果と違えばエラーにする（元データが変わったとき）', (table, code, name, before, after) => {
    // Arrange
    const sources = { ...NO_FIXES, [table]: fixes([[code, name, before, after]]) };

    // Act / Assert
    expect(() => toMunicipality(row(code, name), sources)).toThrow(code);
  });

  test('D32：N03 の名前と総務省のコード表の名前が違えばエラーにする（コードの取り違えを見つけるため）', () => {
    // Act / Assert
    expect(() => toMunicipality(row('01202', '函館町'), NO_FIXES)).toThrow('01202');
  });

  test('D34：名前の字体だけが違う檮原町（N03「檮」、総務省「梼」）は、N03 の名前で通す', () => {
    // Arrange
    const sources = { ...NO_FIXES, soumu: soumu([['39405', '梼原町', 'ﾕｽﾊﾗﾁｮｳ']]) };

    // Act
    const municipality = toMunicipality(row('39405', '檮原町'), sources);

    // Assert
    expect(municipality.name).toEqual({ ja: '檮原町', en: 'Yusuhara-cho' });
  });

  test('5桁でないコードはエラーにする', () => {
    // Act / Assert
    expect(() => toMunicipality(row('1202', '函館市'), NO_FIXES)).toThrow('1202');
  });
});

describe('assertFixesUsed', () => {
  test('D33：修正表のコードがすべて使われていれば何もしない（区の行は市のコードも使う）', () => {
    // Arrange
    const sources = { ...NO_FIXES, kanaFixes: fixes([['06428', '庄内町', 'a', 'b']]), romajiFixes: fixes([['01100', '札幌市', 'a', 'b']]) };

    // Act / Assert
    expect(() => assertFixesUsed(sources, [row('06428', '庄内町'), row('01101', '札幌市', '中央区')])).not.toThrow();
  });

  test('D33：使われない修正表のコードがあればエラーにする（合併などで消えたとき）', () => {
    // Arrange
    const sources = { ...NO_FIXES, romajiFixes: fixes([['12218', '勝浦市', 'Katsura', 'Katsuura']]) };

    // Act / Assert
    expect(() => assertFixesUsed(sources, [row('06428', '庄内町')])).toThrow('12218');
  });
});
