// 7.2：標準入力（または引数）の各行にふりがなを付けて標準出力に出す（T5-02。pnpm content:furigana）。
// 読みが怪しい語（固有名詞・辞書にない語・区切れなかった語）の一覧は標準エラーに出す。YAML のファイルは書き換えない。
// --check <YAML のパス>...：YAML の {漢字|よみ} の読みを、辞書の読みと比べる（lib/furigana-check.ts。YAML は読むだけ）。
// 実行：node scripts/furigana.ts "文" ／ echo "文" | node scripts/furigana.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { readFileSync } from 'node:fs';
import { TokenizerBuilder } from 'lindera-wasm-nodejs-ipadic';
import { runCheck } from './lib/furigana-check.ts';
import { annotate, formatReview, uniqueReviews, type FuriganaReview, type FuriganaToken, type Tokenize } from './lib/furigana.ts';

/** lindera の1語のうち、使う項目（辞書にない語は、表記と品詞だけで、読みがない） */
type LinderaToken = {
  readonly surface: string;
  readonly reading?: string;
  readonly partOfSpeech?: string;
  readonly partOfSpeechSubcategory1?: string;
};

/** IPADIC を同梱した lindera（WASM）のトークナイザーを作る。辞書の読み込みに時間がかかるので、使い回す */
export function createLinderaTokenizer(): Tokenize {
  const builder = new TokenizerBuilder();
  builder.setDictionary('embedded://ipadic');
  builder.setMode('normal');
  const tokenizer = builder.build();
  return (text): readonly FuriganaToken[] =>
    (tokenizer.tokenize(text) as readonly LinderaToken[]).map(({ surface, reading, partOfSpeech, partOfSpeechSubcategory1 }) => ({ surface, reading, partOfSpeech, partOfSpeechSubcategory1 }));
}

/** 各行にふりがなを付けて writeOut に出し、要確認の一覧を writeErr に出す。終了コードを返す（要確認があっても 0） */
export function runFurigana(lines: readonly string[], tokenize: Tokenize, writeOut: (line: string) => void, writeErr: (line: string) => void): number {
  const results = lines.map(line => annotate(line, tokenize));
  results.forEach(result => writeOut(result.text));
  const reviews: readonly FuriganaReview[] = uniqueReviews(results.flatMap(result => result.reviews));
  if (reviews.length > 0) {
    writeErr(`要確認（${reviews.length}件）：`);
    reviews.forEach(review => writeErr(`  ${formatReview(review)}`));
  }
  return 0;
}

/** 引数があれば引数の1つ1つ、なければ標準入力を、1行ずつの文にする（末尾の改行による空行は除く） */
function inputLines(args: readonly string[]): readonly string[] {
  if (args.length > 0) return args;
  const input = readFileSync(0, 'utf8');
  return input === '' ? [] : input.replace(/\r?\n$/, '').split(/\r?\n/);
}

const CHECK_OPTION = '--check';

if (import.meta.main) {
  const args = process.argv.slice(2);
  const writeOut = (line: string): void => void process.stdout.write(`${line}\n`);
  const writeErr = (line: string): void => void process.stderr.write(`${line}\n`);
  process.exitCode = args[0] === CHECK_OPTION ? runCheck(args.slice(1), createLinderaTokenizer(), writeOut, writeErr) : runFurigana(inputLines(args), createLinderaTokenizer(), writeOut, writeErr);
}
