// T1-05：コミットされた地図データ（T1-04 の pnpm geo:build の出力）の全体を検査する。CI の pnpm test で動く。
// 年1回の作り直し（8.4）や手での編集で、県・市区町村の欠けや、大きさの超過が入らないようにするため。
// 形と項目の意味は開発概要書 7.4・7.4.1 と geo/README.md。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GEO_BUILD_SETTINGS, gzipSize } from '../../geo/scripts/lib/geo-build';

const REPO_ROOT = join(import.meta.dirname, '../..');
const MUNI_DIR = join(REPO_ROOT, 'public/geo/muni');
const PREFS_FILE = join(REPO_ROOT, 'geo/data/prefs.topo.json');

const PREF_CODES: readonly string[] = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

// 総務省「全国地方公共団体コード」（令和6年1月1日更新）の 1,918件から、区に分かれる20の政令指定都市の行を除いた件数。
// 照合は pnpm geo:build（assertSameCodes）で行う。作り直して数が変わったら、変換が通ったことを確かめてからここを直す
const SOUMU_MUNICIPALITY_COUNT = 1898;
const DESIGNATED_CITY_COUNT = 20;

// 日本の範囲（与那国島〜南鳥島、沖ノ鳥島〜択捉島をおおまかに囲む）。県名ラベルの経度・緯度の取り違えを見つけるため
const JAPAN_BOUNDS = { minLon: 122, maxLon: 154, minLat: 20, maxLat: 46 } as const;

const CODE = /^\d{5}$/;
const KANA = /^[ぁ-ゖー]+$/;
// 7.4.1（D33）：「語幹-接尾辞」。政令指定都市の区は「区, 市」（Chuo-ku, Sapporo-shi）。
// 語幹は大文字で始まる語。2つの地名を合わせた名前はハイフンでつなぐ（Suo-Oshima-cho）
const STEM = '[A-Z][a-z]*(?:-[A-Z][a-z]*)*';
const NAME_EN = new RegExp(`^${STEM}-(?:shi|ku|machi|cho|mura|son)(?:, ${STEM}-shi)?$`);

type Municipality = {
  readonly code: string;
  readonly name: { readonly ja: string; readonly en: string };
  readonly kana: string;
  readonly cityName?: string;
};

type Collection<P> = { readonly type: string; readonly geometries: readonly { readonly type: string | null; readonly properties: P }[] };
type GeoFile<P> = { readonly text: string; readonly objects: Readonly<Record<string, Collection<P>>> };

function readTopology<P>(path: string): GeoFile<P> {
  const text = readFileSync(path, 'utf8');
  return { text, objects: (JSON.parse(text) as { objects: Record<string, Collection<P>> }).objects };
}

const prefs = readTopology<{ readonly code: string; readonly label: readonly number[] }>(PREFS_FILE);
const muniFiles = readdirSync(MUNI_DIR).sort();
// あるファイルだけを読む（欠けたファイルは、読み込みのエラーではなく、ファイルの一覧のテストで分かるようにする）
const MUNI_FILE = /^(\d{2})\.topo\.json$/;
const muni = muniFiles.flatMap(name => {
  const prefCode = MUNI_FILE.exec(name)?.[1];
  return prefCode === undefined ? [] : [{ prefCode, ...readTopology<Municipality>(join(MUNI_DIR, name)) }];
});
const municipalities = muni.flatMap(({ prefCode, objects }) => (objects.municipalities?.geometries ?? []).map(geometry => ({ prefCode, ...geometry.properties })));

// 失敗したとき、どの市区町村かが分かるように、合わないものの一覧を比べる
const label = (m: { readonly code: string; readonly name?: { readonly ja?: string } }): string => `${m.code} ${m.name?.ja ?? ''}`;

describe('都道府県（geo/data/prefs.topo.json）', () => {
  const geometries = prefs.objects.prefectures?.geometries ?? [];

  test('7.4：prefs.topo.json の prefectures に、コード 01〜47 の47県がちょうど1つずつある', () => {
    // Assert
    expect(Object.keys(prefs.objects)).toEqual(['prefectures']);
    expect(geometries.map(geometry => geometry.properties.code)).toEqual(PREF_CODES);
  });

  test('7.4：都道府県の label は [経度, 緯度] で、日本の範囲（経度122〜154、緯度20〜46）にある', () => {
    // Act
    const outside = geometries.filter(({ properties: { label: point } }) => {
      const [lon, lat] = point;
      const inside =
        point.length === 2 && lon !== undefined && lat !== undefined && lon >= JAPAN_BOUNDS.minLon && lon <= JAPAN_BOUNDS.maxLon && lat >= JAPAN_BOUNDS.minLat && lat <= JAPAN_BOUNDS.maxLat;
      return !inside;
    });

    // Assert
    expect(outside.map(geometry => geometry.properties)).toEqual([]);
  });

  test('7.4：形のない県がない', () => {
    // Assert
    expect(geometries.filter(geometry => geometry.type === null).map(geometry => geometry.properties.code)).toEqual([]);
  });
});

describe('市区町村（public/geo/muni/）', () => {
  test('7.4：public/geo/muni/ に 01.topo.json〜47.topo.json がちょうどあり、ほかのファイルはない', () => {
    // Assert
    expect(muniFiles).toEqual(PREF_CODES.map(prefCode => `${prefCode}.topo.json`));
  });

  test('7.4：市区町村のファイルのオブジェクトは municipalities だけで、形のない市区町村がない', () => {
    // Act
    const wrongObjects = muni.filter(({ objects }) => Object.keys(objects).join(',') !== 'municipalities').map(({ prefCode }) => prefCode);
    const empty = muni.flatMap(({ objects }) => (objects.municipalities?.geometries ?? []).filter(geometry => geometry.type === null).map(geometry => label(geometry.properties)));

    // Assert
    expect(wrongObjects).toEqual([]);
    expect(empty).toEqual([]);
  });

  test('7.4：市区町村の code は5桁で、ファイルの県コードで始まり、全国で重複しない', () => {
    // Act
    const wrongCodes = municipalities.filter(m => typeof m.code !== 'string' || !CODE.test(m.code) || !m.code.startsWith(m.prefCode)).map(label);
    const codes = municipalities.map(m => m.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);

    // Assert
    expect(wrongCodes).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  test('7.4：すべての市区町村に code・name.ja・kana・name.en がある', () => {
    // Act
    const isFilled = (value: unknown): boolean => typeof value === 'string' && value !== '';
    const incomplete = municipalities.filter(m => ![m.code, m.name?.ja, m.kana, m.name?.en].every(isFilled)).map(label);

    // Assert
    expect(incomplete).toEqual([]);
  });

  test('7.4.1：kana はひらがなと「ー」だけ', () => {
    // Assert
    expect(municipalities.filter(m => !KANA.test(m.kana)).map(m => `${label(m)} ${m.kana}`)).toEqual([]);
  });

  test('7.4.1：name.en は「語幹-接尾辞」の形（区は「区, 市」）', () => {
    // Assert
    expect(municipalities.filter(m => !NAME_EN.test(m.name.en)).map(m => `${label(m)} ${m.name.en}`)).toEqual([]);
  });

  test('D16：cityName を持つのは政令指定都市の区だけで、name.ja が cityName で始まり「区」で終わる', () => {
    // Act
    const isWardName = (m: Municipality): boolean => m.name.en.includes(', ');
    const wrong = municipalities
      .filter(m => {
        if (m.cityName === undefined) return isWardName(m);
        return !isWardName(m) || !m.name.ja.startsWith(m.cityName) || !m.name.ja.endsWith('区') || m.name.ja === m.cityName;
      })
      .map(m => `${label(m)} ${m.cityName ?? '(cityName なし)'} ${m.name.en}`);

    // Assert
    expect(wrong).toEqual([]);
  });

  test('D16：cityName を持つ市は20', () => {
    // Act（同じ名前の市が別の県にあっても分けて数えるため、県コードと合わせる）
    const cities = new Set(municipalities.flatMap(m => (m.cityName === undefined ? [] : [`${m.prefCode} ${m.cityName}`])));

    // Assert
    expect(cities.size).toBe(DESIGNATED_CITY_COUNT);
  });

  test('8.4：市区町村の数が、総務省のコード一覧（政令指定都市の行を除く）の件数 1,898 と一致する', () => {
    // Assert
    expect(municipalities).toHaveLength(SOUMU_MUNICIPALITY_COUNT);
  });

  test('5.1：市区町村のファイルは、どれも圧縮後 100,000 バイト以下', () => {
    // Act（変換の検査と同じ測り方・基準。gzip レベル9）
    const oversized = muni.map(({ prefCode, text }) => ({ prefCode, size: gzipSize(text) })).filter(({ size }) => size > GEO_BUILD_SETTINGS.maxGzipBytes);

    // Assert
    expect(GEO_BUILD_SETTINGS.maxGzipBytes).toBe(100_000);
    expect(oversized).toEqual([]);
  });
});
