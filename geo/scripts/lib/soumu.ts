// 総務省「全国地方公共団体コード」（都道府県コード及び市区町村コード）の xlsx から、コード・名前・カナを読む（T1-04、8.1、D32）。
// 使うのは A 列（団体コード）・C 列（市区町村名）・E 列（市区町村名のカナ）だけなので、xlsx のライブラリは使わず、
// fflate で展開して、共有文字列とシートの XML から必要な要素だけを取り出す。
import { strFromU8, unzipSync } from 'fflate';

export type SoumuEntry = {
  /** N03 の N03_007 と同じ5桁（検査数字を除く） */
  readonly code: string;
  readonly name: string;
  /** 半角カタカナのまま（ひらがなにするのは kana.ts の katakanaToHiragana） */
  readonly kana: string;
};

const SHARED_STRINGS = 'xl/sharedStrings.xml';
const WORKSHEET = /^xl\/worksheets\/sheet(\d+)\.xml$/;
const DIGITS = /^\d+$/;
const CODE_LENGTH = 6;
const CHECK_DIGIT_WEIGHTS: readonly number[] = [6, 5, 4, 3, 2];
const CHECK_DIGIT_MODULUS = 11;

const XML_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

type Row = { readonly code: string; readonly name: string; readonly kana: string };

/** xlsx のバイト列から、5桁のコード → 名前・カナ の表を作る。シート1（全団体）とシート2（政令指定都市の区）の両方を読む。 */
export function readSoumuCodes(xlsx: Uint8Array): ReadonlyMap<string, SoumuEntry> {
  const files = unzipSync(xlsx, { filter: file => file.name === SHARED_STRINGS || WORKSHEET.test(file.name) });
  const sharedStrings = files[SHARED_STRINGS];
  const sheetNames = Object.keys(files)
    .filter(name => WORKSHEET.test(name))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b));
  if (sharedStrings === undefined || sheetNames.length === 0) {
    throw new Error('xlsx に共有文字列（sharedStrings.xml）かシートがありません');
  }
  const strings = parseSharedStrings(strFromU8(sharedStrings));
  const entries = sheetNames.flatMap(name => parseSheet(strFromU8(files[name] as Uint8Array), strings)).map(toEntry);
  return uniqueByCode(entries);
}

function sheetNumber(name: string): number {
  return Number(WORKSHEET.exec(name)?.[1]);
}

function toEntry(row: Row): SoumuEntry {
  return { code: row.code.slice(0, -1), name: row.name, kana: row.kana };
}

// 同じ市（政令指定都市）はシート1とシート2の両方に出てくる。同じ内容なら1つにまとめ、違えば止める
function uniqueByCode(entries: readonly SoumuEntry[]): ReadonlyMap<string, SoumuEntry> {
  const table = new Map(entries.map(entry => [entry.code, entry] as const));
  const conflict = entries.find(entry => {
    const kept = table.get(entry.code) as SoumuEntry;
    return kept.name !== entry.name || kept.kana !== entry.kana;
  });
  if (conflict !== undefined) {
    throw new Error(`同じコード（${conflict.code}）に、違う名前・カナがあります（${conflict.name}・${conflict.kana}）`);
  }
  return table;
}

// 名前のセルにはふりがな（<rPh>）が入っていることがある（色丹村など7件）。除かないと「色丹村シコタンムラ」になる
function parseSharedStrings(xml: string): readonly string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) => {
    const withoutPhonetics = (item as string).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    return [...withoutPhonetics.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => decodeXml(text as string)).join('');
  });
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (entity, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number(body.slice(1)));
    return XML_ENTITIES[body] ?? entity;
  });
}

function parseSheet(xml: string, strings: readonly string[]): readonly Row[] {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].flatMap(([, body]) => {
    const cells = parseCells(body as string, strings);
    const row = toRow(cells.get('A'), cells.get('C'), cells.get('E'));
    return row === undefined ? [] : [row];
  });
}

function parseCells(rowXml: string, strings: readonly string[]): ReadonlyMap<string, string> {
  return new Map(
    [...rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].flatMap(([, column, attributes, inner]) => {
      const value = /<v>([\s\S]*?)<\/v>/.exec(inner ?? '')?.[1];
      if (value === undefined) return [];
      const isShared = /\bt="s"/.test(attributes as string);
      return [[column as string, isShared ? sharedString(strings, value) : decodeXml(value)] as const];
    })
  );
}

function sharedString(strings: readonly string[], index: string): string {
  const text = strings[Number(index)];
  if (text === undefined) {
    throw new Error(`xlsx の共有文字列の番号が範囲の外です（${index}）`);
  }
  return text;
}

// 見出しや注記の行（A 列が数字でない）と、都道府県の行（市区町村名が空）は読まない
function toRow(code: string | undefined, name: string | undefined, kana: string | undefined): Row | undefined {
  if (code === undefined || !DIGITS.test(code) || name === undefined || name === '') {
    return undefined;
  }
  assertCode(code);
  if (kana === undefined || kana === '') {
    throw new Error(`カナが空の行があります（${code}・${name}）`);
  }
  return { code, name, kana };
}

// 団体コードは5桁＋検査数字。検査数字は、上5桁に 6・5・4・3・2 を掛けた和を11で割った余りを11から引いた数の1の位
function assertCode(code: string): void {
  const digits = [...code].map(Number);
  const sum = CHECK_DIGIT_WEIGHTS.reduce((total, weight, index) => total + weight * Number(code.charAt(index)), 0);
  const checkDigit = (CHECK_DIGIT_MODULUS - (sum % CHECK_DIGIT_MODULUS)) % 10;
  if (code.length !== CODE_LENGTH || digits[CODE_LENGTH - 1] !== checkDigit) {
    throw new Error(`検査数字付きの6桁の団体コードではありません（${code}）`);
  }
}
