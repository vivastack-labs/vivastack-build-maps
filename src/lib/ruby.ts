// ふりがなの記法 {漢字|よみ} のパーサー（T1-06、開発概要書 7.2・7.3・6.6 (2)）。
// 変換はビルド時に行う。誤りの一覧は checkRuby、変換は parseRuby（誤りがあれば例外）で行う。

/** 文の部分。文字の部分と、ルビ（親文字と読み）の部分 */
export type RubySegment = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'ruby'; readonly base: string; readonly reading: string };

/** 誤り・警告。index は文字列の中の位置（0始まり。UTF-16 の位置） */
export type RubyIssue = { readonly index: number; readonly message: string };

export type RubyCheck = {
  readonly errors: readonly RubyIssue[];
  readonly warnings: readonly RubyIssue[];
};

/** 文字の部分と、その文字列の中の位置（警告の位置を出すため） */
type PositionedText = { readonly index: number; readonly text: string };

type Scan = {
  readonly segments: readonly RubySegment[];
  readonly texts: readonly PositionedText[];
  readonly errors: readonly RubyIssue[];
};

const OPEN = '{';
const CLOSE = '}';
const SEPARATOR = '|';

/** 読みに使える字：ひらがな（ぁ〜ゖ）と長音記号（7.2） */
const READING = /^[ぁ-ゖー]+$/u;

/** ふりがなが要る字：漢字（々・〆 を含む）。続いた漢字は1つにまとめる */
const KANJI_RUN = /\p{Script=Han}+/gu;

/** 括弧の中身（{ と } の間）を、ルビの部分か誤りにする */
function toRuby(inner: string, start: number): { readonly segment?: RubySegment; readonly errors: readonly RubyIssue[] } {
  const parts = inner.split(SEPARATOR);
  if (parts.length === 1) {
    return { errors: [{ index: start, message: '括弧の中に「|」がありません' }] };
  }
  if (parts.length > 2) {
    return { errors: [{ index: start, message: '括弧の中に「|」が2つ以上あります' }] };
  }
  const [base = '', reading = ''] = parts;
  const errors: RubyIssue[] = [];
  if (base.trim() === '') errors.push({ index: start, message: '親文字が空です' });
  if (reading === '') {
    errors.push({ index: start, message: '読みが空です' });
  } else if (!READING.test(reading)) {
    errors.push({
      index: start,
      message: `読み「${reading}」に、ひらがなと「ー」以外の字があります`
    });
  }
  return errors.length > 0 ? { errors } : { segment: { kind: 'ruby', base, reading }, errors };
}

/**
 * 文字列を1回だけ走査して、部分・文字の部分の位置・誤りを集める。
 * 誤りのある括弧の中身は、部分にも警告の対象にも入れない（parseRuby は誤りがあれば例外にする）。
 */
function scanRuby(text: string): Scan {
  const segments: RubySegment[] = [];
  const texts: PositionedText[] = [];
  const errors: RubyIssue[] = [];
  let buffer = '';
  let bufferStart = 0;
  let openAt = -1; // 括弧の中なら、開き括弧の位置

  const flushText = (end: number): void => {
    if (buffer !== '') {
      segments.push({ kind: 'text', text: buffer });
      texts.push({ index: bufferStart, text: buffer });
    }
    buffer = '';
    bufferStart = end;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (openAt < 0) {
      if (char === OPEN) {
        flushText(i);
        openAt = i;
      } else {
        if (char === CLOSE) errors.push({ index: i, message: '対応する「{」のない閉じ括弧「}」があります' });
        buffer += char;
      }
      continue;
    }
    if (char === OPEN) {
      errors.push({ index: i, message: '括弧の中に「{」があります' });
      openAt = i; // 外側の括弧は捨て、内側から読み直す
      buffer = '';
    } else if (char === CLOSE) {
      const ruby = toRuby(buffer, openAt);
      errors.push(...ruby.errors);
      if (ruby.segment) segments.push(ruby.segment);
      openAt = -1;
      buffer = '';
      bufferStart = i + 1;
    } else {
      buffer += char;
    }
  }

  if (openAt >= 0) {
    errors.push({ index: openAt, message: '閉じ括弧「}」がありません' });
  } else {
    flushText(text.length);
  }
  return { segments, texts, errors };
}

/** ふりがなの付いていない漢字を、続いた漢字ごとに1件の警告にする */
function kanjiWarnings(texts: readonly PositionedText[]): readonly RubyIssue[] {
  return texts.flatMap(({ index, text }) =>
    [...text.matchAll(KANJI_RUN)].map(match => ({
      index: index + match.index,
      message: `ふりがなの付いていない漢字「${match[0]}」があります`
    }))
  );
}

/** 記法の誤り（エラー）と、ふりがなの付いていない漢字（警告）を返す。日本語の文にだけ使う（7.2） */
export function checkRuby(text: string): RubyCheck {
  const { texts, errors } = scanRuby(text);
  return { errors, warnings: kanjiWarnings(texts) };
}

/** UTF-16 の位置を、書く人が数える「何文字目」（1始まり。𩸽 など BMP の外の字も1字）にする */
export function characterNumber(text: string, index: number): number {
  return [...text.slice(0, index)].length + 1;
}

/** 文字列を、文字の部分とルビの部分の配列にする。記法に誤りがあれば、位置を含むエラーを投げる */
export function parseRuby(text: string): readonly RubySegment[] {
  const { segments, errors } = scanRuby(text);
  if (errors.length > 0) {
    const details = errors.map(({ index, message }) => `${characterNumber(text, index)}文字目：${message}`);
    throw new Error(`ふりがなの記法の誤り（${JSON.stringify(text)}）：${details.join('、')}`);
  }
  return segments;
}

/** 読みを除いた文字列を返す（文字数の計算に使う。7.3） */
export function plainText(text: string): string {
  return parseRuby(text)
    .map(segment => (segment.kind === 'text' ? segment.text : segment.base))
    .join('');
}
