// make-max-content.ts が使う語彙を作る（T3-08）。日本語の漢字の語は、コミット済みの市区町村の TopoJSON
// （public/geo/muni/NN.topo.json。pnpm geo:build の出力）の `name.ja` と `kana`（本物の漢字と読みの組）から取る。
// ダミーの語彙が小さいと、同じ語と読みの繰り返しで gzip が本物より縮み、計測が小さく出るため（H1）。
// 相対の import には .ts を付ける。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EN_WORDS, JA_KANJI_WORDS, ZH_WORDS, type KanjiWord } from './max-content-words.ts';

/** 文を作るための語彙 */
export type Vocabulary = {
  /** 日本語の漢字の語と読み（漢字だけ。読みはひらがな） */
  readonly ja: readonly KanjiWord[];
  /** 中国語の語 */
  readonly zh: readonly string[];
  /** 英語の単語 */
  readonly en: readonly string[];
};

/** 市区町村の TopoJSON を置いたディレクトリ（リポジトリの public/geo/muni/） */
export const DEFAULT_MUNI_DIR = join(import.meta.dirname, '..', 'public/geo/muni');

const MUNI_FILE = /^\d{2}\.topo\.json$/u;
const MUNI_CODE = /^\d{5}$/u;
const KANJI_ONLY = /^\p{Script=Han}+$/u;
/** 読みに使える字：ひらがなと長音記号（`src/lib/ruby.ts` と同じ） */
const READING = /^[ぁ-ゖー]+$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 市区町村の TopoJSON から、名前（`name.ja`）と読み（`kana`）の組を取り出す。外から読んだ値なので形を確かめ、違えば例外（`source` はメッセージに入れる）。
 * 確かめるのは、`type`・`objects.municipalities.geometries`（空でない配列）・各要素の `properties`（`code` は5桁の数字、`name.ja`・`kana` は文字列）。
 */
export function muniNames(topology: unknown, source: string): readonly (readonly [name: string, kana: string])[] {
  const fail = (reason: string): never => {
    throw new Error(`${source}：市区町村のデータの形が違います（${reason}）`);
  };
  if (!isRecord(topology) || topology.type !== 'Topology') return fail('type が Topology ではありません');
  const collection = isRecord(topology.objects) ? topology.objects.municipalities : undefined;
  const geometries = isRecord(collection) ? collection.geometries : undefined;
  if (!Array.isArray(geometries) || geometries.length === 0) return fail('objects.municipalities.geometries が空か、配列ではありません');
  return geometries.map((geometry: unknown, index) => {
    const properties = isRecord(geometry) ? geometry.properties : undefined;
    const name = isRecord(properties) && isRecord(properties.name) ? properties.name.ja : undefined;
    if (!isRecord(properties) || typeof properties.code !== 'string' || !MUNI_CODE.test(properties.code) || typeof name !== 'string' || typeof properties.kana !== 'string') {
      return fail(`${index}番目の要素の code・name.ja・kana が正しくありません`);
    }
    return [name, properties.kana] as const;
  });
}

/** 漢字だけの名前と、ひらがなだけの読みの組で、同じ組を除いたもの（順番は最初に出た順） */
function kanjiWords(names: readonly (readonly [string, string])[]): readonly KanjiWord[] {
  const pairs = names.filter(([name, kana]) => KANJI_ONLY.test(name) && READING.test(kana));
  return [...new Map(pairs.map(([name, kana]) => [`${name}|${kana}`, [name, kana] as const])).values()];
}

/**
 * dir（既定は public/geo/muni/）の `NN.topo.json` を読んで、語彙を作る。日本語は、本物の市区町村の漢字の名前（区・市・町・村を含む）と読みに、
 * 1字の語などの小さな語彙（字数を合わせるのに要る）を足す。中国語は、同じ漢字の列に小さな語彙を足す。英語は小さな語彙のまま。
 * ファイルが1つもない・形が違うときは例外。
 */
export function loadVocabulary(dir: string = DEFAULT_MUNI_DIR): Vocabulary {
  const files = readdirSync(dir)
    .filter(file => MUNI_FILE.test(file))
    .sort();
  if (files.length === 0) throw new Error(`${dir} に NN.topo.json がありません（pnpm geo:build の出力）`);
  const names = files.flatMap(file => {
    const path = join(dir, file);
    let topology: unknown;
    try {
      topology = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new Error(`${path}：JSON として読めません（${error instanceof Error ? error.message : String(error)}）`, { cause: error });
    }
    return muniNames(topology, path);
  });
  const real = kanjiWords(names);
  return {
    ja: [...JA_KANJI_WORDS, ...real],
    zh: [...ZH_WORDS, ...new Set(real.map(([name]) => name))],
    en: EN_WORDS
  };
}
