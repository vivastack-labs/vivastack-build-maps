// T1-08：コミットされた47県の基本情報（content/prefectures/）の全体を検査する。CI の pnpm test で動く。
// 県庁の位置は D32 の手順（公式サイトの住所 → 地理院地図の住所検索）で調べた値。手での照合の見落としを、
// 公的なデータから作った地図データ（N03・総務省のコード表。T1-04）と照らして見つける。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoContains } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, test } from 'vitest';
import { loadContent, type Prefecture } from '../../src/lib/content';
import { parseRuby, plainText } from '../../src/lib/ruby';

const REPO_ROOT = join(import.meta.dirname, '../..');
const CONTENT_DIR = join(REPO_ROOT, 'content/prefectures');
const PREFS_FILE = join(REPO_ROOT, 'geo/data/prefs.topo.json');
const MUNI_DIR = join(REPO_ROOT, 'public/geo/muni');

const PREF_CODES: readonly string[] = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

// F-MAP-01：8地方の県の数
const REGION_COUNTS = {
  hokkaido: 1,
  tohoku: 6,
  kanto: 7,
  chubu: 9,
  kinki: 7,
  chugoku: 5,
  shikoku: 4,
  kyushu: 8
} as const;

// 県庁の位置のおおまかな範囲（与那国島・択捉島を含む本土側。南鳥島などの離島に県庁はない）
const CAPITAL_BOUNDS = { minLat: 24, maxLat: 46, minLon: 122, maxLon: 146 } as const;

type MuniProps = {
  readonly code: string;
  readonly name: { readonly ja: string; readonly en: string };
  readonly kana: string;
  readonly cityName?: string;
};
type PrefProps = { readonly code: string };

const prefectures: readonly Prefecture[] = loadContent(CONTENT_DIR);

function readTopology(file: string): Topology {
  return JSON.parse(readFileSync(file, 'utf8')) as Topology;
}

function featuresOf<P extends Record<string, unknown>>(file: string, objectName: string): readonly Feature<Geometry, P>[] {
  const topology = readTopology(file);
  const collection = topology.objects[objectName] as GeometryCollection<P>;
  return feature(topology, collection).features;
}

const capitalPoint = (pref: Prefecture): [number, number] => [pref.capital.lon, pref.capital.lat];

/** ふりがなの記法の文を、読み（かな）だけの文にする。例：`さいたま{市|し}` → `さいたまし` */
function readingOf(text: string): string {
  return parseRuby(text)
    .map(segment => (segment.kind === 'ruby' ? segment.reading : segment.text))
    .join('');
}

/** 県庁の点を含む市区町村（その県のファイルから探す） */
function municipalityAt(pref: Prefecture): MuniProps | undefined {
  const municipalities = featuresOf<MuniProps>(join(MUNI_DIR, `${pref.code}.topo.json`), 'municipalities');
  return municipalities.find(muni => geoContains(muni, capitalPoint(pref)))?.properties;
}

describe('T1-08: 47県の基本情報', () => {
  test('T1-08: content/prefectures/ に47県のファイルがあり、code は 01〜47 で重複しない', () => {
    expect(prefectures.map(pref => pref.code)).toEqual(PREF_CODES);
  });

  test('F-MAP-01: 地方ごとの県の数が 北海道1・東北6・関東7・中部9・近畿7・中国5・四国4・九州8', () => {
    const counts = Object.fromEntries(Object.keys(REGION_COUNTS).map(region => [region, prefectures.filter(pref => pref.region === region).length]));
    expect(counts).toEqual(REGION_COUNTS);
  });

  test('T1-08: 県庁の緯度は24〜46、経度は122〜146', () => {
    const outside = prefectures.filter(({ capital: { lat, lon } }) => lat < CAPITAL_BOUNDS.minLat || lat > CAPITAL_BOUNDS.maxLat || lon < CAPITAL_BOUNDS.minLon || lon > CAPITAL_BOUNDS.maxLon);
    expect(outside.map(pref => pref.code)).toEqual([]);
  });

  test('T1-08: 名物・名所は空で、行き方はない（未作成）', () => {
    // 名物・名所・行き方を書くのは T5（T5-04 以降）。県ごとに書き始めたら、このテストを外す
    const written = prefectures.filter(pref => pref.specialties.length > 0 || pref.spots.length > 0 || pref.access);
    expect(written.map(pref => pref.code)).toEqual([]);
  });
});

describe('D32: 県庁の位置を地図データと照合する', () => {
  test('D32: 県庁の位置が、その県の形（geo/data/prefs.topo.json）の中にある', () => {
    const shapes = featuresOf<PrefProps>(PREFS_FILE, 'prefectures');
    const outside = prefectures.filter(pref => {
      const shape = shapes.find(candidate => candidate.properties.code === pref.code);
      return shape === undefined || !geoContains(shape, capitalPoint(pref));
    });
    expect(outside.map(pref => pref.code)).toEqual([]);
  });

  test.each(PREF_CODES)('D32・D33: %s の県庁所在地の名前・読み・ローマ字が、県庁の点を含む市区町村と合う', code => {
    const pref = prefectures.find(candidate => candidate.code === code);
    expect(pref).toBeDefined();
    if (pref === undefined) return;

    const muni = municipalityAt(pref);
    expect(muni, '県庁の点を含む市区町村がない').toBeDefined();
    if (muni === undefined) return;

    // 政令指定都市の区なら、所属する市が県庁所在地（例：札幌市中央区 → 札幌市）
    const capitalName = plainText(pref.capital.name.ja);
    expect(muni.cityName ?? muni.name.ja).toBe(capitalName);

    const reading = readingOf(pref.capital.name.ja);
    if (muni.cityName === undefined) {
      expect(muni.kana).toBe(reading);
    } else {
      expect(muni.kana.startsWith(reading), `${muni.kana} が ${reading} で始まらない`).toBe(true);
    }

    // 7.4.1（D33）：市区町村のローマ字は「語幹-接尾辞」、区は「区, 市」。県庁所在地の英語名は語幹だけ
    const suffix = capitalName.endsWith('区') ? 'ku' : 'shi';
    const cityEn = muni.name.en.split(', ').at(-1);
    expect(cityEn).toBe(`${pref.capital.name.en}-${suffix}`);
  });
});
