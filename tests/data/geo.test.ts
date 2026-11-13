// T1-05：コミットされた地図データ（T1-04 の pnpm geo:build の出力）の全体を検査する。CI の pnpm test で動く。
// 年1回の作り直し（8.4）や手での編集で、県・市区町村の欠けや、大きさの超過が入らないようにするため。
// 形と項目の意味は開発概要書 7.4・7.4.1 と geo/README.md。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
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

// 東京都の特別区は「区」で終わるが、政令指定都市の区ではない（cityName を持たない）
const TOKYO = '13';
const WARD_SUFFIX = '区';

// ファイルの属性はそのまま信じない。項目が欠けていても、どのテストも落ちずに「どの市区町村か」を出せるように、空の文字列にそろえる
type RawMunicipality = {
  readonly code?: unknown;
  readonly name?: { readonly ja?: unknown; readonly en?: unknown };
  readonly kana?: unknown;
  readonly cityName?: unknown;
};

type Municipality = {
  readonly prefCode: string;
  readonly code: string;
  readonly ja: string;
  readonly en: string;
  readonly kana: string;
  /** 文字列でない値（数値など）も「ある」とみなして、D16 のテストで見つける */
  readonly cityName: string | undefined;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function toMunicipality(prefCode: string, raw: RawMunicipality): Municipality {
  return {
    prefCode,
    code: text(raw.code),
    ja: text(raw.name?.ja),
    en: text(raw.name?.en),
    kana: text(raw.kana),
    cityName: raw.cityName === undefined ? undefined : text(raw.cityName)
  };
}

type Collection<P> = { readonly type: string; readonly geometries: readonly { readonly type: string | null; readonly properties: P }[] };
type GeoFile<P> = { readonly text: string; readonly objects: Readonly<Record<string, Collection<P>>> };

function readTopology<P>(path: string): GeoFile<P> {
  const text = readFileSync(path, 'utf8');
  return { text, objects: (JSON.parse(text) as { objects: Record<string, Collection<P>> }).objects };
}

const prefs = readTopology<{ readonly code?: unknown; readonly label?: unknown }>(PREFS_FILE);
const muniFiles = readdirSync(MUNI_DIR).sort();
// あるファイルだけを読む（欠けたファイルは、読み込みのエラーではなく、ファイルの一覧のテストで分かるようにする）
const MUNI_FILE = /^(\d{2})\.topo\.json$/;
const muni = muniFiles.flatMap(name => {
  const prefCode = MUNI_FILE.exec(name)?.[1];
  return prefCode === undefined ? [] : [{ prefCode, ...readTopology<RawMunicipality>(join(MUNI_DIR, name)) }];
});
const municipalities = muni.flatMap(({ prefCode, objects }) => (objects.municipalities?.geometries ?? []).map(geometry => toMunicipality(prefCode, geometry.properties)));

// 失敗したとき、どの市区町村かが分かるように、合わないものの一覧を比べる
const label = (m: Municipality): string => `${m.code} ${m.ja}`;

// 日本の範囲にある [経度, 緯度] か（文字列の数字は、比べると数値に変わって通ってしまうので、型も見る）
function isInJapan(point: unknown): boolean {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(value => typeof value === 'number')) return false;
  const [lon, lat] = point as [number, number];
  return lon >= JAPAN_BOUNDS.minLon && lon <= JAPAN_BOUNDS.maxLon && lat >= JAPAN_BOUNDS.minLat && lat <= JAPAN_BOUNDS.maxLat;
}

describe('都道府県（geo/data/prefs.topo.json）', () => {
  const geometries = prefs.objects.prefectures?.geometries ?? [];

  test('7.4：prefs.topo.json の prefectures に、コード 01〜47 の47県がちょうど1つずつある', () => {
    // Assert
    expect(Object.keys(prefs.objects)).toEqual(['prefectures']);
    expect(geometries.map(geometry => geometry.properties.code)).toEqual(PREF_CODES);
  });

  test('7.4：都道府県の label は [経度, 緯度] で、日本の範囲（経度122〜154、緯度20〜46）にある', () => {
    // Act
    const outside = geometries.filter(geometry => !isInJapan(geometry.properties.label));

    // Assert
    expect(outside.map(geometry => geometry.properties)).toEqual([]);
  });

  const topology = JSON.parse(prefs.text) as Topology<{ prefectures: GeometryCollection<{ code?: unknown; label?: unknown }> }>;
  const prefFeatures = feature(topology, topology.objects.prefectures).features;

  test('7.4：県名ラベルの位置が、その県の形の中にある', () => {
    // Act
    const outside = prefFeatures.filter(pref => {
      const label = pref.properties.label;
      return !(Array.isArray(label) && geoContains(pref, [Number(label[0]), Number(label[1])]));
    });

    // Assert
    expect(outside.map(pref => pref.properties.code)).toEqual([]);
  });

  // 1km² 以上の島は県の形に残す（geo/README.md）。県ごとにまとめた形を簡略化すると、keep-shapes でも小さな島が消えていた
  test.each([
    ['13', '母島', [142.16, 26.65]],
    ['13', '南鳥島', [153.98, 24.29]],
    ['35', '彦島', [130.9, 33.94]],
    ['37', '小豆島', [134.25, 34.49]],
    ['42', '宇久島', [129.13, 33.27]]
  ] as const)('7.4：%s の県の形に、1km² 以上の島（%s）がある', (code, _name, point) => {
    // Arrange
    const pref = prefFeatures.find(f => f.properties.code === code);

    // Assert
    expect(pref && geoContains(pref, [...point])).toBe(true);
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
    const empty = muni.flatMap(({ objects }) => (objects.municipalities?.geometries ?? []).filter(geometry => geometry.type === null).map(geometry => label(toMunicipality('', geometry.properties))));

    // Assert
    expect(wrongObjects).toEqual([]);
    expect(empty).toEqual([]);
  });

  test('7.4：市区町村の code は5桁で、ファイルの県コードで始まり、全国で重複しない', () => {
    // Act
    const wrongCodes = municipalities.filter(m => !CODE.test(m.code) || !m.code.startsWith(m.prefCode)).map(label);
    const codes = municipalities.map(m => m.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);

    // Assert
    expect(wrongCodes).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  test('7.4：すべての市区町村に code・name.ja・kana・name.en がある', () => {
    // Act
    const incomplete = municipalities.filter(m => [m.code, m.ja, m.kana, m.en].includes('')).map(m => `${label(m)} ${m.kana} ${m.en}`);

    // Assert
    expect(incomplete).toEqual([]);
  });

  test('7.4.1：kana はひらがなと「ー」だけ', () => {
    // Assert
    expect(municipalities.filter(m => !KANA.test(m.kana)).map(m => `${label(m)} ${m.kana}`)).toEqual([]);
  });

  test('7.4.1：name.en は「語幹-接尾辞」の形（区は「区, 市」）', () => {
    // Assert
    expect(municipalities.filter(m => !NAME_EN.test(m.en)).map(m => `${label(m)} ${m.en}`)).toEqual([]);
  });

  test('D16：政令指定都市の区（東京都の外で「区」で終わる）だけが cityName を持ち、name.ja が cityName で始まり、name.en が「区, 市」', () => {
    // Act（区かどうかは、検査する cityName・name.en とは別に、名前と県で決める）
    const isWard = (m: Municipality): boolean => m.prefCode !== TOKYO && m.ja.endsWith(WARD_SUFFIX);
    const isWardEn = (m: Municipality): boolean => m.en.includes(', ');
    const wrong = municipalities
      .filter(m => {
        if (!isWard(m)) return m.cityName !== undefined || isWardEn(m);
        return m.cityName === undefined || m.cityName === '' || !m.ja.startsWith(m.cityName) || m.ja === m.cityName || !isWardEn(m);
      })
      .map(m => `${label(m)} ${m.cityName ?? '(cityName なし)'} ${m.en}`);

    // Assert
    expect(wrong).toEqual([]);
  });

  test('D16：同じ市の区は、name.en の市の部分（, Sapporo-shi）がそろっている', () => {
    // Act
    const wards = municipalities.filter(m => m.cityName !== undefined);
    const byCity = Map.groupBy(wards, m => `${m.prefCode} ${m.cityName}`);
    const cityPart = (m: Municipality): string => m.en.slice(m.en.indexOf(', ') + 2);
    const mixed = [...byCity].filter(([, members]) => new Set(members.map(cityPart)).size !== 1).map(([key, members]) => `${key} ${members.map(m => m.en).join('・')}`);

    // Assert
    expect(mixed).toEqual([]);
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
