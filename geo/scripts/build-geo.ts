// 地図データの変換（T1-04、第8章）。手順と入力の取得は geo/README.md。
// 実行：pnpm geo:build（Node.js の型の除去で直接動かすので、enum などは使わない）。毎回のビルドでは動かさない。
//
// 入力：geo/downloads/ の N03 2026年版（Shapefile）と総務省のコード表（xlsx）、geo/sources/ の修正表
// 出力：public/geo/muni/NN.topo.json（47個）、geo/data/prefs.topo.json
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFixTable } from './lib/fixes.ts';
import { buildGeo, gzipSize, type GeoBuildResult } from './lib/geo-build.ts';
import { readSoumuCodes } from './lib/soumu.ts';

export type OutputPaths = {
  readonly muniDir: string;
  readonly prefsFile: string;
};

const MUNI_FILE = /^\d{2}\.topo\.json$/;
const PREF_COUNT = 47;
const PREF_CODES: readonly string[] = Array.from({ length: PREF_COUNT }, (_, index) => String(index + 1).padStart(2, '0'));

type PrefsTopology = { readonly objects: { readonly prefectures: { readonly geometries: readonly { readonly properties: { readonly code: string } }[] } } };

/** 変換の結果を書く。市区町村のディレクトリにある前回のファイルは先に消す（今回の結果にないファイルを残さないため） */
export function writeGeoOutputs(result: GeoBuildResult, paths: OutputPaths): void {
  mkdirSync(paths.muniDir, { recursive: true });
  readdirSync(paths.muniDir)
    .filter(name => MUNI_FILE.test(name))
    .forEach(name => rmSync(join(paths.muniDir, name)));
  result.municipalities.forEach((json, prefCode) => writeFileSync(join(paths.muniDir, `${prefCode}.topo.json`), `${json}\n`));
  mkdirSync(dirname(paths.prefsFile), { recursive: true });
  writeFileSync(paths.prefsFile, `${result.prefs}\n`);
}

/**
 * 市区町村のファイルと都道府県の形が、どちらも 01〜47 を過不足なく持つかを確かめる（7.4）。
 * 書き出しは前回のファイルを消してから行うので、入力の取り違えなどで県が欠けたまま上書きしないため。
 */
export function assertAllPrefectures(result: GeoBuildResult): void {
  const expected = PREF_CODES.join(',');
  const municipalities = [...result.municipalities.keys()].join(',');
  if (municipalities !== expected) {
    throw new Error(`市区町村のファイルが 01〜47 の47県ではありません（${result.municipalities.size}県：${municipalities}）`);
  }
  const prefs = (JSON.parse(result.prefs) as PrefsTopology).objects.prefectures.geometries.map(geometry => geometry.properties.code);
  if (prefs.join(',') !== expected) {
    throw new Error(`都道府県の形が 01〜47 の47県ではありません（${prefs.length}件：${prefs.join(',')}）`);
  }
}

/** 県ごとの gzip 後の大きさ（5.1 の基準と比べるため）と、最大の県 */
export function formatSizeReport(municipalities: ReadonlyMap<string, string>): string {
  const sizes = [...municipalities].map(([prefCode, json]) => [prefCode, gzipSize(json)] as const);
  const [maxCode, maxSize] = sizes.reduce((max, entry) => (entry[1] > max[1] ? entry : max), ['', 0] as const);
  return [...sizes.map(([prefCode, size]) => `${prefCode} ${size} B`), `最大：${maxCode}（${maxSize} B）`].join('\n');
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '../..');
  const geo = (path: string): string => join(repoRoot, 'geo', path);
  const naming = {
    soumu: readSoumuCodes(readFileSync(geo('downloads/soumu/000925835.xlsx'))),
    kanaFixes: parseFixTable(readFileSync(geo('sources/kana-fixes.csv'), 'utf8'), 'kana'),
    romajiFixes: parseFixTable(readFileSync(geo('sources/romaji-fixes.csv'), 'utf8'), 'stem')
  };
  const result = await buildGeo(geo('downloads/N03-2026/N03-20260101.shp'), naming);
  assertAllPrefectures(result);
  writeGeoOutputs(result, { muniDir: join(repoRoot, 'public/geo/muni'), prefsFile: geo('data/prefs.topo.json') });
  process.stdout.write(`${formatSizeReport(result.municipalities)}\n`);
}
