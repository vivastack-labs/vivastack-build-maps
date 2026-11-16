// 7.2：日本語の文に、ふりがなの記法 {漢字|よみ} を自動で付ける（T5-02。pnpm content:furigana）。
// トークナイザー（形態素解析）は引数で受け取る。辞書は scripts/furigana.ts が用意する。
// 辞書の読みは、固有名詞で誤ることがある。付けた結果は、必ず人が読みを確かめる（要確認の一覧を返す）。
import { katakanaToHiragana } from '../../geo/scripts/lib/kana.ts';

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

/** 要確認の種類：辞書にない・読みが使えない／送り仮名で区切れなかった／固有名詞 */
export type ReviewKind = 'unknown' | 'misaligned' | 'proper-noun';

/** 人が読みを確かめる語。unknown の語には、ふりがなを付けていない */
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
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (text: string): string => text.replace(REGEX_SPECIAL, '\\$&');

/** 漢字の連なりを (.+?)、それ以外（送り仮名）をそのまま並べた正規表現で、読みを分ける。合わなければ undefined */
function alignParts(surface: string, hiragana: string): string | undefined {
  const parts = surface.split(KANJI_RUNS);
  const pattern = parts.map((part, index) => (index % 2 === 1 ? '(.+?)' : escapeRegex(katakanaToHiragana(part)))).join('');
  const match = new RegExp(`^${pattern}$`, 'u').exec(hiragana);
  if (match === null) return undefined;
  let group = 0;
  return parts
    .map((part, index) => {
      if (index % 2 === 0) return part;
      group += 1;
      return `{${part}|${match[group]}}`;
    })
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

/**
 * 文のうち、ふりがなの付いていない漢字を含む語にだけ、ふりがなを付ける。すでにある `{…|…}` はそのまま残す。
 * 読みのない語（辞書にない語）は、そのまま残して要確認に入れる。固有名詞と、送り仮名で区切れなかった語も要確認に入れる。
 */
export function annotate(text: string, tokenize: Tokenize): AnnotateResult {
  const pieces = text.split(EXISTING_RUBY).map((piece, index) => {
    if (index % 2 === 1 || piece === '') return { text: piece, reviews: [] as readonly FuriganaReview[] };
    const results = tokenize(piece).map(annotateToken);
    return { text: results.map(result => result.text).join(''), reviews: results.flatMap(result => (result.review === undefined ? [] : [result.review])) };
  });
  return { text: pieces.map(piece => piece.text).join(''), reviews: uniqueReviews(pieces.flatMap(piece => piece.reviews)) };
}

/** 要確認の1件を、人が読む1行にする（確かめることを添える） */
export function formatReview({ surface, reading, kind }: FuriganaReview): string {
  if (kind === 'proper-noun') return `${surface}（${reading}）：固有名詞。読みを公式の表記で確かめる`;
  if (kind === 'misaligned') return `${surface}（${reading}）：送り仮名で区切れず、語全体に読みを付けた。区切りと読みを確かめる`;
  return `${surface}：辞書にない語（読みを付けていない）。読みを調べて手で付ける`;
}
