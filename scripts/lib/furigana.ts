// 7.2：日本語の文に、ふりがなの記法 {漢字|よみ} を自動で付ける（T5-02。pnpm content:furigana）。
// トークナイザー（形態素解析）は引数で受け取る。辞書は scripts/furigana.ts が用意する。
// 辞書の読みは、固有名詞で誤ることがある。付けた結果は、必ず人が読みを確かめる（要確認の一覧を返す）。
import { katakanaToHiragana } from '../../geo/scripts/lib/kana.ts';
import { checkRuby } from '../../src/lib/ruby.ts';

/** 形態素解析の結果の1語。辞書にない語は reading がない */
export type FuriganaToken = {
  readonly surface: string;
  /** カタカナの読み */
  readonly reading?: string;
  readonly partOfSpeech?: string;
  readonly partOfSpeechSubcategory1?: string;
};

/** 文を語に分ける関数 */
export type Tokenize = (text: string) => readonly FuriganaToken[];

/**
 * 要確認の種類：辞書にない・読みが使えない／送り仮名で区切れなかった／固有名詞／
 * 漢字の続きが2つ以上の語に分かれた（split-compound）／数字の後の漢字（after-digit）／
 * ふりがなの記法の誤りで付けなかった（notation）／辞書の語をつないだ文が元の文と合わず付けなかった（mismatch）
 */
export type ReviewKind = 'unknown' | 'misaligned' | 'proper-noun' | 'split-compound' | 'after-digit' | 'notation' | 'mismatch';

/** 人が読みを確かめる語（split-compound・after-digit は、前後の語を含めた並び）。unknown の語には、ふりがなを付けていない */
export type FuriganaReview = {
  readonly surface: string;
  readonly reading?: string;
  readonly kind: ReviewKind;
};

/** annotate の結果 */
export type AnnotateResult = { readonly text: string; readonly reviews: readonly FuriganaReview[] };

/** 読みに使える字：ひらがなと長音記号（src/lib/ruby.ts の READING と同じ） */
const READING = /^[ぁ-ゖー]+$/u;
const HAS_KANJI = /\p{Script=Han}/u;
const KANJI_RUNS = /(\p{Script=Han}+)/u;
const EXISTING_RUBY = /(\{[^{}]*\})/;
const PROPER_NOUN = '固有名詞';
const ENDS_WITH_KANJI = /\p{Script=Han}$/u;
const STARTS_WITH_KANJI = /^\p{Script=Han}/u;
const DIGITS_AT_END = /[0-9０-９]+$/;
const DIGIT_THEN_KANJI = /[0-9０-９]\p{Script=Han}/u;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (text: string): string => text.replace(REGEX_SPECIAL, '\\$&');

/** 語を漢字の連なりと送り仮名に分けた1つ。reading があれば、漢字の連なりの読み（ひらがな） */
type Piece = { readonly text: string; readonly reading?: string };

/** 漢字の連なりを (.+?)（最短）か (.+)（最長）、それ以外（送り仮名）をそのまま並べた正規表現で、読みを分ける */
function matchReading(parts: readonly string[], hiragana: string, quantifier: string): readonly (string | undefined)[] | undefined {
  const pattern = parts.map((part, index) => (index % 2 === 1 ? `(.+${quantifier})` : escapeRegex(katakanaToHiragana(part)))).join('');
  const match = new RegExp(`^${pattern}$`, 'u').exec(hiragana);
  return match === null ? undefined : match.slice(1);
}

/**
 * 漢字の連なりごとに読みを分ける。合わなければ undefined。
 * 送り仮名と同じ字が読みの中にもあると、最短と最長で区切りが変わる（物の怪・もののけ）。区切りを決められないので、合わないものとして扱う。
 */
function alignPieces(surface: string, hiragana: string): readonly Piece[] | undefined {
  const parts = surface.split(KANJI_RUNS);
  const lazy = matchReading(parts, hiragana, '?');
  const greedy = matchReading(parts, hiragana, '');
  if (lazy === undefined || greedy === undefined || lazy.join('|') !== greedy.join('|')) return undefined;
  return parts.map((part, index) => (index % 2 === 0 ? { text: part } : { text: part, reading: lazy[(index - 1) / 2] }));
}

/** alignPieces を `{漢字|よみ}` の並びにする */
function alignParts(surface: string, hiragana: string): string | undefined {
  return alignPieces(surface, hiragana)
    ?.map(piece => (piece.reading === undefined ? piece.text : `{${piece.text}|${piece.reading}}`))
    .join('');
}

/** 読み（カタカナ）をルビに使えるひらがなにする。使えない字があれば undefined */
function toReading(reading: string): string | undefined {
  const hiragana = katakanaToHiragana(reading);
  return READING.test(hiragana) ? hiragana : undefined;
}

/**
 * 語の表記と読み（カタカナ）を、送り仮名を括弧の外に出した `{漢字|よみ}` の並びにする
 * （町並み・マチナミ → `{町並|まちな}み`）。送り仮名で区切れないときは、語全体を1つのルビにする。
 * 漢字のない語は表記のまま返す。読みがひらがなと「ー」にならないときは undefined。
 */
export function alignReading(surface: string, reading: string): string | undefined {
  if (!HAS_KANJI.test(surface)) return surface;
  const hiragana = toReading(reading);
  if (hiragana === undefined) return undefined;
  return alignParts(surface, hiragana) ?? `{${surface}|${hiragana}}`;
}

/** 漢字を含む1語を、ふりがな付きにする。付けられなければ、そのまま返して要確認にする */
function annotateToken(token: FuriganaToken): { readonly text: string; readonly review?: FuriganaReview } {
  const { surface } = token;
  if (!HAS_KANJI.test(surface)) return { text: surface };
  const hiragana = token.reading === undefined ? undefined : toReading(token.reading);
  if (hiragana === undefined) return { text: surface, review: { surface, kind: 'unknown' } };
  const aligned = alignParts(surface, hiragana);
  if (aligned === undefined) return { text: `{${surface}|${hiragana}}`, review: { surface, reading: hiragana, kind: 'misaligned' } };
  const kind: ReviewKind | undefined = token.partOfSpeechSubcategory1 === PROPER_NOUN ? 'proper-noun' : undefined;
  return kind === undefined ? { text: aligned } : { text: aligned, review: { surface, reading: hiragana, kind } };
}

/** 同じ語・同じ種類の要確認を、最初の1件にまとめる */
export function uniqueReviews(reviews: readonly FuriganaReview[]): readonly FuriganaReview[] {
  const seen = new Set<string>();
  return reviews.filter(({ surface, kind }) => {
    const key = `${kind}:${surface}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 読みのある語だけなら、読み（ひらがな）をつないだもの。1語でも読みがなければ undefined */
function joinReadings(tokens: readonly FuriganaToken[]): string | undefined {
  const readings = tokens.map(token => (token.reading === undefined ? undefined : toReading(token.reading)));
  return readings.every(reading => reading !== undefined) ? readings.join('') : undefined;
}

function sequenceReview(tokens: readonly FuriganaToken[], surface: string, kind: ReviewKind): FuriganaReview {
  const reading = joinReadings(tokens);
  return reading === undefined ? { surface, kind } : { surface, reading, kind };
}

/** 漢字で終わる語に漢字で始まる語が続く並びを、語ごとにまとめる（2語以上のものだけ返す） */
function kanjiChains(tokens: readonly FuriganaToken[]): readonly (readonly FuriganaToken[])[] {
  const chains = tokens.reduce<readonly (readonly FuriganaToken[])[]>((all, token) => {
    const last = all[all.length - 1];
    const previous = last?.[last.length - 1];
    const continues = previous !== undefined && ENDS_WITH_KANJI.test(previous.surface) && STARTS_WITH_KANJI.test(token.surface);
    return continues ? [...all.slice(0, -1), [...(last ?? []), token]] : [...all, [token]];
  }, []);
  return chains.filter(chain => chain.length >= 2);
}

/** 7.2：漢字の続きが2つ以上の語に分かれたとき、その並び全体を要確認にする（複合語は、分かれた読みが誤りやすい） */
function splitCompoundReviews(tokens: readonly FuriganaToken[]): readonly FuriganaReview[] {
  return kanjiChains(tokens).map(chain => sequenceReview(chain, chain.map(token => token.surface).join(''), 'split-compound'));
}

/** 7.2：数字の後の漢字（月・日・年・社・本 など、数え方で読みが変わる）を、数字を含めて要確認にする */
function afterDigitReviews(tokens: readonly FuriganaToken[]): readonly FuriganaReview[] {
  return tokens.flatMap((token, index) => {
    if (!HAS_KANJI.test(token.surface)) return [];
    const digits = DIGITS_AT_END.exec(tokens[index - 1]?.surface ?? '')?.[0];
    if (digits === undefined && !DIGIT_THEN_KANJI.test(token.surface)) return [];
    return [sequenceReview([token], `${digits ?? ''}${token.surface}`, 'after-digit')];
  });
}

/** 1つの文字列（括弧の外）にふりがなを付ける */
function annotatePiece(piece: string, tokenize: Tokenize): AnnotateResult {
  const tokens = tokenize(piece);
  // 辞書の語をつないだ文が元の文と違うと（空白が消えるなど）、文が壊れる。文は変えずに、要確認にする
  if (tokens.map(token => token.surface).join('') !== piece) return { text: piece, reviews: [{ surface: piece, kind: 'mismatch' }] };
  const results = tokens.map(annotateToken);
  const reviews = [...results.flatMap(result => (result.review === undefined ? [] : [result.review])), ...splitCompoundReviews(tokens), ...afterDigitReviews(tokens)];
  return { text: results.map(result => result.text).join(''), reviews };
}

/**
 * 文のうち、ふりがなの付いていない漢字を含む語にだけ、ふりがなを付ける。すでにある `{…|…}` はそのまま残す。
 * 読みのない語（辞書にない語）は、そのまま残して要確認に入れる。固有名詞と、送り仮名で区切れなかった語も要確認に入れる。
 * 文は変えずに、読みを誤りやすい並びも要確認に入れる：漢字の続きが語に分かれたもの、数字の後の漢字。
 * ふりがなの記法に誤りがある文と、辞書の語をつないだ文が元の文と合わない文は、文を変えずに返して、要確認に入れる。
 */
export function annotate(text: string, tokenize: Tokenize): AnnotateResult {
  if (checkRuby(text).errors.length > 0) return { text, reviews: [{ surface: text, kind: 'notation' }] };
  const pieces = text.split(EXISTING_RUBY).map((piece, index) => (index % 2 === 1 || piece === '' ? { text: piece, reviews: [] } : annotatePiece(piece, tokenize)));
  return { text: pieces.map(piece => piece.text).join(''), reviews: uniqueReviews(pieces.flatMap(piece => piece.reviews)) };
}

const REVIEW_ADVICE: Readonly<Record<ReviewKind, string>> = {
  'proper-noun': '固有名詞。読みを公式の表記で確かめる',
  misaligned: '送り仮名で区切れず、語全体に読みを付けた。区切りと読みを確かめる',
  unknown: '辞書にない語（読みを付けていない）。読みを調べて手で付ける',
  'split-compound': '漢字の続きが語に分かれた。複合語の読みを確かめる',
  'after-digit': '数字の後の漢字。数え方の読みを確かめる',
  notation: 'ふりがなの記法の誤り。文は変えていない。括弧を直してから、もう一度付ける',
  mismatch: '辞書の語が文と合わない。文は変えていない。ふりがなを手で付ける'
};

/** 要確認の1件を、人が読む1行にする（確かめることを添える。読みがなければ語だけ） */
export function formatReview({ surface, reading, kind }: FuriganaReview): string {
  const label = reading === undefined ? surface : `${surface}（${reading}）`;
  return `${label}：${REVIEW_ADVICE[kind]}`;
}

/** 辞書の読みの1単位：文の中の位置（UTF-16。start 以上 end 未満）と、その読み（ひらがな）。読みがなければ辞書にない語 */
export type DictionaryUnit = { readonly start: number; readonly end: number; readonly reading?: string };

/** 1語を、漢字の連なりごと（送り仮名で区切れなければ語全体）の読みの単位にする */
function tokenUnits(token: FuriganaToken, start: number): readonly DictionaryUnit[] {
  const end = start + token.surface.length;
  if (!HAS_KANJI.test(token.surface)) return [{ start, end, reading: katakanaToHiragana(token.surface) }];
  const hiragana = token.reading === undefined ? undefined : toReading(token.reading);
  if (hiragana === undefined) return [{ start, end }];
  const pieces = alignPieces(token.surface, hiragana);
  if (pieces === undefined) return [{ start, end, reading: hiragana }];
  return pieces
    .filter(piece => piece.text !== '')
    .reduce<readonly DictionaryUnit[]>((units, piece) => {
      const from = units.length === 0 ? start : (units[units.length - 1] as DictionaryUnit).end;
      return [...units, { start: from, end: from + piece.text.length, reading: piece.reading ?? katakanaToHiragana(piece.text) }];
    }, []);
}

/**
 * 辞書で分けた語を、読みの単位の並びにする（送り仮名は漢字と分ける。広い・ヒロイ → 広=ひろ・い=い）。
 * YAML の `{漢字|よみ}` の親文字と、辞書の読みを比べるために使う（--check）。
 */
export function dictionaryUnits(tokens: readonly FuriganaToken[]): readonly DictionaryUnit[] {
  return tokens.reduce<readonly DictionaryUnit[]>((units, token) => {
    const start = units.length === 0 ? 0 : (units[units.length - 1] as DictionaryUnit).end;
    return [...units, ...tokenUnits(token, start)];
  }, []);
}
