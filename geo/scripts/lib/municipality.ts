// N03 の属性の1行から、市区町村の項目（7.4）を作る（T1-04）。
// 名前は N03 のもの、読みは総務省のコード表のカナ（コードで照合）。ローマ字は kana.ts の規則（D33）で作り、
// 機械的に作ると間違うものは修正表（geo/sources/）で直す（7.4.1）。
import type { FixTable } from './fixes.ts';
import { hiraganaToRomaji, katakanaToHiragana, splitSuffix } from './kana.ts';
import type { SoumuEntry } from './soumu.ts';

/** N03 の属性のうち、使うもの。N03_004 は市区町村名、N03_005 は政令指定都市の区名（ほかは空か null） */
export type N03Row = {
  readonly N03_004: string;
  readonly N03_005: string | null;
  readonly N03_007: string;
};

export type Municipality = {
  readonly code: string;
  readonly name: { readonly ja: string; readonly en: string };
  /** ひらがな。政令指定都市の区は市名を含む読み（さっぽろしちゅうおうく） */
  readonly kana: string;
  /** 政令指定都市の区だけ。所属する市の名前 */
  readonly cityName?: string;
};

export type NamingSources = {
  readonly soumu: ReadonlyMap<string, SoumuEntry>;
  /** 読み（ひらがな）の修正。before・after は、政令指定都市の区では市名を含む読み */
  readonly kanaFixes: FixTable;
  /** ローマ字の語幹の修正。接尾辞（-shi など）は規則のまま付ける */
  readonly romajiFixes: FixTable;
};

const CODE = /^\d{5}$/;

// N03 と総務省のコード表で、字体だけが違う名前（コード → 総務省の名前）。表示には N03 の名前を使う（D34）
const SOUMU_NAME_VARIANTS: ReadonlyMap<string, string> = new Map([['39405', '梼原町']]);

/** N03 の1行から市区町村の項目を作る。カナがない、区のカナが市のカナから始まらない、修正表が合わない、ならエラー。 */
export function toMunicipality(row: N03Row, sources: NamingSources): Municipality {
  const code = row.N03_007;
  if (!CODE.test(code)) {
    throw new Error(`N03_007 が5桁の団体コードではありません（${code}・${row.N03_004}）`);
  }
  const ward = row.N03_005 ?? '';
  return ward === '' ? toCityOrTown(code, row.N03_004, sources) : toWard(code, row.N03_004, ward, sources);
}

/** 修正表のコードが、すべて今の変換で使われたかを確かめる。合併などでコードが消えたとき、古い修正を残さないため。 */
export function assertFixesUsed(sources: NamingSources, rows: readonly N03Row[]): void {
  const used = new Set(rows.flatMap(row => (row.N03_005 ? [row.N03_007, findCity(row.N03_007, row.N03_004, sources.soumu).code] : [row.N03_007])));
  const unused = [...sources.kanaFixes.keys(), ...sources.romajiFixes.keys()].filter(code => !used.has(code));
  if (unused.length > 0) {
    throw new Error(`修正表に、地図にないコードがあります（${unused.join('・')}）`);
  }
}

function toCityOrTown(code: string, name: string, sources: NamingSources): Municipality {
  const kana = readingOf(code, name, sources);
  return { code, name: { ja: name, en: romajiOf(code, name, kana, sources) }, kana };
}

// 区の英語表記は「区, 市」（Chuo-ku, Sapporo-shi。D33）。区だけの読みは、区のカナから市のカナを取り除いて作る
function toWard(code: string, cityName: string, wardName: string, sources: NamingSources): Municipality {
  const city = findCity(code, cityName, sources.soumu);
  const kana = readingOf(code, `${cityName}${wardName}`, sources);
  const cityKana = readingOf(city.code, cityName, sources);
  if (!kana.startsWith(cityKana) || kana.length === cityKana.length) {
    throw new Error(`区のカナが市のカナから始まっていません（${code}・${kana}・${cityKana}）`);
  }
  const wardKana = kana.slice(cityKana.length);
  const en = `${romajiOf(code, wardName, wardKana, sources)}, ${romajiOf(city.code, cityName, cityKana, sources)}`;
  return { code, name: { ja: `${cityName}${wardName}`, en }, kana, cityName };
}

// 区のコードから市のコードは決まらない（浜松市の区は 22138〜22140、市は 22130）ので、同じ県の同じ名前の市を探す
function findCity(wardCode: string, cityName: string, soumu: ReadonlyMap<string, SoumuEntry>): SoumuEntry {
  const prefCode = wardCode.slice(0, 2);
  const matches = [...soumu.values()].filter(entry => entry.code.startsWith(prefCode) && entry.name === cityName);
  if (matches.length !== 1) {
    throw new Error(`政令指定都市の区（${wardCode}）の市（${cityName}）が、総務省のコード表に1つだけではありません（${matches.length}件）`);
  }
  return matches[0] as SoumuEntry;
}

// 照合はコードで行うが、名前も比べる。コードの取り違えや表の行のずれで、別の団体の読みを黙って使わないため
function readingOf(code: string, name: string, sources: NamingSources): string {
  const entry = sources.soumu.get(code);
  if (entry === undefined) {
    throw new Error(`総務省のコード表にカナがありません（${code}）`);
  }
  if (entry.name !== name && entry.name !== SOUMU_NAME_VARIANTS.get(code)) {
    throw new Error(`N03 と総務省のコード表で名前が違います（${code}・${name}・${entry.name}）`);
  }
  return applyFix(sources.kanaFixes, code, katakanaToHiragana(entry.kana));
}

function romajiOf(code: string, name: string, kana: string, sources: NamingSources): string {
  const { stem, suffix } = splitSuffix(name, kana);
  const fixedStem = applyFix(sources.romajiFixes, code, hiraganaToRomaji(stem));
  return `${fixedStem}-${hiraganaToRomaji(suffix).toLowerCase()}`;
}

function applyFix(table: FixTable, code: string, value: string): string {
  const fix = table.get(code);
  if (fix === undefined) {
    return value;
  }
  if (fix.before !== value) {
    throw new Error(`修正表の直す前の値（${fix.before}）が、今の変換結果（${value}）と違います（${code}・${fix.name}）`);
  }
  return fix.after;
}
