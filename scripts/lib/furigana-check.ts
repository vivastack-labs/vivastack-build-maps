// 7.2：YAML の `{漢字|よみ}` の読みを、辞書の読みと比べる（T5-02。pnpm content:furigana --check）。
// 辞書の読みが誤っていることもある（函館山 → はこだてさん）ので、違いは「どちらが正しいか確かめる」要確認として出す。
// YAML は読むだけで書き換えない。トークナイザーは引数で受け取る（辞書は scripts/furigana.ts が用意する）。
import { readFileSync } from 'node:fs';
import { isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import { checkRuby, parseRuby, plainText } from '../../src/lib/ruby.ts';
import { dictionaryUnits, type DictionaryUnit, type Tokenize } from './furigana.ts';

/** 比べられなかった理由：辞書の語が親文字の外にはみ出す／辞書にない語／ふりがなの記法の誤り／辞書の語をつないだ文が元の文と合わない */
export type IncomparableReason = 'boundary' | 'unknown' | 'notation' | 'mismatch';

/** 比べた結果、確かめることになったもの。notation・mismatch は、surface が文全体 */
export type ReadingDifference =
  | { readonly kind: 'differs'; readonly surface: string; readonly yamlReading: string; readonly dictionaryReading: string }
  | { readonly kind: 'incomparable'; readonly surface: string; readonly yamlReading: string; readonly reason: IncomparableReason };

/** YAML から取り出した日本語の文。path は `specialties/uji-tea.description.ja.adult` の形、line は文が始まる行（1始まり） */
export type Sentence = { readonly path: string; readonly line: number; readonly text: string };

const INCOMPARABLE_NOTES: Readonly<Record<IncomparableReason, string>> = {
  boundary: '辞書の語が親文字の外にはみ出す',
  unknown: '辞書にない語',
  notation: 'ふりがなの記法の誤り',
  mismatch: '辞書の語が文と合わない'
};

const LIST_KEYS = ['specialties', 'spots'] as const;
const MODES = ['kids', 'adult'] as const;

type PlacedRuby = { readonly base: string; readonly reading: string; readonly start: number; readonly end: number };

const wholeSentence = (text: string, reason: IncomparableReason): readonly ReadingDifference[] => [{ kind: 'incomparable', surface: text, yamlReading: '', reason }];

/** 親文字の位置（ふりがなを除いた文の中の位置）つきで、ルビの部分を取り出す */
function placeRubies(text: string): readonly PlacedRuby[] {
  const placed = parseRuby(text).reduce<{ readonly offset: number; readonly rubies: readonly PlacedRuby[] }>(
    ({ offset, rubies }, segment) => {
      if (segment.kind === 'text') return { offset: offset + segment.text.length, rubies };
      const end = offset + segment.base.length;
      return { offset: end, rubies: [...rubies, { base: segment.base, reading: segment.reading, start: offset, end }] };
    },
    { offset: 0, rubies: [] }
  );
  return placed.rubies;
}

/** 親文字の範囲に入る辞書の読みをつないで、YAML の読みと比べる */
function compareRuby(ruby: PlacedRuby, units: readonly DictionaryUnit[]): readonly ReadingDifference[] {
  const overlapped = units.filter(unit => unit.start < ruby.end && unit.end > ruby.start);
  const incomparable = (reason: IncomparableReason): readonly ReadingDifference[] => [{ kind: 'incomparable', surface: ruby.base, yamlReading: ruby.reading, reason }];
  if (overlapped.some(unit => unit.start < ruby.start || unit.end > ruby.end)) return incomparable('boundary');
  if (overlapped.some(unit => unit.reading === undefined)) return incomparable('unknown');
  const dictionaryReading = overlapped.map(unit => unit.reading).join('');
  return dictionaryReading === ruby.reading ? [] : [{ kind: 'differs', surface: ruby.base, yamlReading: ruby.reading, dictionaryReading }];
}

/**
 * 日本語の1文の `{漢字|よみ}` を、辞書の読みと比べて、違うもの・比べられないものを返す。
 * 辞書の語の区切りが YAML の区切りと違うときは、親文字の範囲に入る辞書の読みをつないで比べる（送り仮名は漢字と分けて数える）。
 */
export function compareReadings(text: string, tokenize: Tokenize): readonly ReadingDifference[] {
  if (checkRuby(text).errors.length > 0) return wholeSentence(text, 'notation');
  const rubies = placeRubies(text);
  if (rubies.length === 0) return [];
  const plain = plainText(text);
  const tokens = tokenize(plain);
  if (tokens.map(token => token.surface).join('') !== plain) return wholeSentence(text, 'mismatch');
  const units = dictionaryUnits(tokens);
  return rubies.flatMap(ruby => compareRuby(ruby, units));
}

/**
 * YAML（1県分）から、名前・解説（こども・おとな）・行き方の日本語の文を、場所と行つきで取り出す。
 * 県名・県庁所在地の名前は対象にしない。YAML の構文の誤りはエラーにする（形は検証しない。content:validate の役目）。
 */
export function extractSentences(source: string): readonly Sentence[] {
  const lines = new LineCounter();
  const doc = parseDocument(source, { lineCounter: lines, uniqueKeys: true });
  if (doc.errors.length > 0) {
    throw new Error(`YAML の誤り：${(doc.errors[0]?.message ?? '').split('\n')[0]}`);
  }
  const sentenceAt = (keys: readonly (string | number)[], path: string): readonly Sentence[] => {
    const node = doc.getIn(keys, true);
    const offset = isScalar(node) ? node.range?.[0] : undefined;
    return isScalar(node) && typeof node.value === 'string' && offset !== undefined ? [{ path, line: lines.linePos(offset).line, text: node.value }] : [];
  };
  const access = [...sentenceAt(['access', 'mode', 'ja'], 'access.mode.ja'), ...sentenceAt(['access', 'route', 'ja'], 'access.route.ja')];
  const items = LIST_KEYS.flatMap(key => {
    const list = doc.get(key, true);
    if (!isSeq(list)) return [];
    return list.items.flatMap((_, index) => {
      const id = doc.getIn([key, index, 'id']);
      const label = `${key}/${typeof id === 'string' ? id : index}`;
      return [...sentenceAt([key, index, 'name', 'ja'], `${label}.name.ja`), ...MODES.flatMap(mode => sentenceAt([key, index, 'description', 'ja', mode], `${label}.description.ja.${mode}`))];
    });
  });
  return [...access, ...items];
}

/** 違い・比べられないものを、`ファイル:行 場所 表記 YAMLの読み／辞書の読み：確かめること` の1行にする */
export function formatDifference(file: string, sentence: Sentence, difference: ReadingDifference): string {
  const where = `${file}:${sentence.line} ${sentence.path}`;
  if (difference.kind === 'differs') {
    return `${where} ${difference.surface} ${difference.yamlReading}／${difference.dictionaryReading}：読みが辞書と違う。どちらが正しいか公式の表記で確かめる`;
  }
  const word = [difference.surface, difference.yamlReading].filter(part => part !== '').join(' ');
  return `${where} ${word}：辞書と比べられない（${INCOMPARABLE_NOTES[difference.reason]}）`;
}

type FileResult = { readonly sentences: number; readonly differences: readonly ReadingDifference[]; readonly lines: readonly string[] };

function checkSource(file: string, source: string, tokenize: Tokenize): FileResult {
  const sentences = extractSentences(source);
  const found = sentences.flatMap(sentence => compareReadings(sentence.text, tokenize).map(difference => ({ sentence, difference })));
  return {
    sentences: sentences.length,
    differences: found.map(entry => entry.difference),
    lines: found.map(entry => formatDifference(file, entry.sentence, entry.difference))
  };
}

/**
 * YAML のファイルを読み（書き換えない）、読みが辞書と違うものを writeOut に出す。読めないファイルは writeErr に出して終了コード 1。
 * 違いがあっても終了コードは 0（CI の検査ではない）。
 */
export function runCheck(
  paths: readonly string[],
  tokenize: Tokenize,
  writeOut: (line: string) => void,
  writeErr: (line: string) => void,
  read: (path: string) => string = path => readFileSync(path, 'utf8')
): number {
  if (paths.length === 0) {
    writeErr('使い方：pnpm content:furigana --check <YAML のパス>...');
    return 1;
  }
  const results = paths.map(path => {
    try {
      return checkSource(path, read(path), tokenize);
    } catch (error) {
      writeErr(`${path}：読めません（${error instanceof Error ? error.message : String(error)}）`);
      return undefined;
    }
  });
  const checked = results.flatMap(result => (result === undefined ? [] : [result]));
  checked.forEach(result => result.lines.forEach(writeOut));
  const differences = checked.flatMap(result => result.differences);
  const differs = differences.filter(difference => difference.kind === 'differs').length;
  writeOut(`比べました：${checked.reduce((sum, result) => sum + result.sentences, 0)}文、違い${differs}件、比べられない${differences.length - differs}件`);
  return checked.length === results.length ? 0 : 1;
}
