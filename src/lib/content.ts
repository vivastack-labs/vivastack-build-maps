// コンテンツ（1県＝1 YAML）の読み込みと検証（T1-07、開発概要書 7.1〜7.3）。
// 形は JSON Schema（content/schema/prefecture.schema.json）、内容のルールは content-rules.ts で見る。
// アプリ（ビルド時）は loadContent、検証スクリプト（pnpm content:validate）は validateContent を使う。
// node:fs でファイルを読み、読み込んだ時点でスキーマをコンパイルするので、サーバー（ビルド時）でだけ使う。
// クライアントコンポーネントからは読み込まない（内容をクライアントに渡さない。6.6 (2)）。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Ajv, { type ErrorObject } from 'ajv';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document } from 'yaml';
import schema from '../../content/schema/prefecture.schema.json' with { type: 'json' };
import { checkPrefecture, formatPath, type ContentPath, type RuleIssue } from './content-rules.ts';
import type { Prefecture } from './content-schema.generated.ts';

export type { Prefecture } from './content-schema.generated.ts';

/** 誤り・警告。line は YAML の行（1始まり）。path は `specialties[0].description.ja.kids` の形 */
export type ContentIssue = { readonly file: string; readonly line?: number; readonly path: string; readonly message: string };

/** validateContent の結果。prefectures は形が通った県だけ（code の順） */
export type ContentResult = {
  readonly prefectures: readonly Prefecture[];
  readonly errors: readonly ContentIssue[];
  readonly warnings: readonly ContentIssue[];
};

/** CONTENT_DIR がないときに読むディレクトリ */
export const DEFAULT_CONTENT_DIR = 'content/prefectures';

const FILE_NAME = /^\d{2}-[a-z]+(-[a-z]+)*\.yaml$/u;

const validateSchema = new Ajv({ allErrors: true, strict: true }).compile<Prefecture>(schema);

/** スキーマの pattern ごとの、書く人向けのメッセージ */
const PATTERN_MESSAGES: Readonly<Record<string, string>> = {
  [schema.definitions.text.pattern]: '空や空白だけにはできません',
  [schema.definitions.slug.pattern]: '英小文字とハイフンにしてください（例：hokkaido、asahiyama-zoo）',
  [schema.properties.code.pattern]: '01〜47 の2桁の文字列にしてください（例："01"）',
  [schema.definitions.source.properties.url.pattern]: 'https:// で始まる URL にしてください',
  [schema.definitions.source.properties.accessed.pattern]: '確認した日は YYYY-MM-DD の形にしてください'
};

/** 読み込むディレクトリ。環境変数 CONTENT_DIR で変えられる（E2E はフィクスチャを読む） */
export function contentDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.CONTENT_DIR || DEFAULT_CONTENT_DIR;
}

/** `ファイル名:行 場所 メッセージ`（行・場所がなければ省く） */
export function formatIssue({ file, line, path, message }: ContentIssue): string {
  const location = line === undefined ? file : `${file}:${line}`;
  return [location, path, message].filter(part => part !== '').join(' ');
}

/** ajv の instancePath（/specialties/0/description）を場所にする。余分な項目は、その項目の場所にする */
function toPath(error: ErrorObject): ContentPath {
  const path = error.instancePath
    .split('/')
    .slice(1)
    .map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map(key => (/^\d+$/u.test(key) ? Number(key) : key));
  return error.keyword === 'additionalProperties' ? [...path, String(error.params.additionalProperty)] : path;
}

/** ajv の誤りを日本語のメッセージにする */
function schemaMessage(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return `項目「${String(params.missingProperty)}」がありません`;
    case 'additionalProperties':
      return `スキーマにない項目「${String(params.additionalProperty)}」があります`;
    case 'enum':
      return `値は ${(params.allowedValues as readonly unknown[]).join('・')} のどれかにしてください`;
    case 'maxItems':
    case 'not':
      return '3件か0件にしてください';
    case 'pattern':
      return PATTERN_MESSAGES[String(params.pattern)] ?? `形が合いません（${String(params.pattern)}）`;
    case 'minimum':
      return `${String(params.limit)} 以上にしてください`;
    case 'maximum':
      return `${String(params.limit)} 以下にしてください`;
    case 'type':
      return `型が違います（${String(params.type)} にしてください）`;
    default:
      return error.message ?? error.keyword;
  }
}

/** 親のノードの中で、キー（マップ）か要素（配列）が始まる位置 */
function childOffset(parent: unknown, key: string | number): number | undefined {
  if (isMap(parent)) {
    const pair = parent.items.find(item => isScalar(item.key) && item.key.value === key);
    return isScalar(pair?.key) ? pair.key.range?.[0] : undefined;
  }
  if (isSeq(parent) && typeof key === 'number') {
    return (parent.items[key] as { range?: readonly number[] } | undefined)?.range?.[0];
  }
  return undefined;
}

/** 場所に当たる項目の名前（キー）の行。なければ親をたどる */
function lineOf(doc: Document, lines: LineCounter, path: ContentPath): number | undefined {
  for (let depth = path.length; depth > 0; depth -= 1) {
    const offset = childOffset(doc.getIn(path.slice(0, depth - 1), true), path[depth - 1] as string | number);
    if (offset !== undefined) return lines.linePos(offset).line;
  }
  const root = (doc.contents as { range?: readonly number[] } | null)?.range?.[0];
  return root === undefined ? undefined : lines.linePos(root).line;
}

type LineFor = (path: ContentPath) => number | undefined;

type Parsed = {
  readonly prefecture?: Prefecture;
  readonly lineFor: LineFor;
  readonly errors: readonly ContentIssue[];
  readonly warnings: readonly ContentIssue[];
};

const failed = (issue: ContentIssue): Parsed => ({ lineFor: () => undefined, errors: [issue], warnings: [] });

const errorText = (error: unknown): string => (error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error));

/** 1ファイルを読み、YAML の構文・形・内容のルールを見る。読めないファイルも誤りとして返す（ほかのファイルの検証を続ける） */
function checkFile(dir: string, file: string): Parsed {
  let text: string;
  try {
    text = readFileSync(join(dir, file), 'utf8');
  } catch (error) {
    return failed({ file, path: '', message: `ファイルを読めません：${errorText(error)}` });
  }
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, uniqueKeys: true });
  if (doc.errors.length > 0) {
    const errors = doc.errors.map(error => ({ file, line: error.linePos?.[0].line, path: '', message: `YAML の誤り（${error.code}）：${errorText(error)}` }));
    return { lineFor: () => undefined, errors, warnings: [] };
  }
  const lineFor: LineFor = path => lineOf(doc, lines, path);
  const toIssue = ({ path, message }: RuleIssue): ContentIssue => ({ file, line: lineFor(path), path: formatPath(path), message });
  let data: unknown;
  try {
    // maxAliasCount: 0：コンテンツではエイリアスを使わない（大きく展開されるファイルで止まらないように、使えば誤りにする）
    data = doc.toJS({ maxAliasCount: 0 });
  } catch (error) {
    return failed({ file, path: '', message: `YAML を値にできません（エイリアス（&・*）は使えません）：${errorText(error)}` });
  }
  if (!validateSchema(data)) {
    return { lineFor, errors: (validateSchema.errors ?? []).map(error => toIssue({ path: toPath(error), message: schemaMessage(error) })), warnings: [] };
  }
  const rules = checkPrefecture(file, data);
  return { prefecture: data, lineFor, errors: rules.errors.map(toIssue), warnings: rules.warnings.map(toIssue) };
}

type Valid = { readonly file: string; readonly prefecture: Prefecture; readonly lineFor: LineFor };

/** 7.1：県の id・code が、ファイルをまたいで重複しないか（後のファイルを誤りにする） */
function duplicateIssues(entries: readonly Valid[]): readonly ContentIssue[] {
  return entries.flatMap(({ file, prefecture, lineFor }, i) =>
    (['code', 'id'] as const).flatMap(key => {
      const first = entries.findIndex(other => other.prefecture[key] === prefecture[key]);
      return first < i ? [{ file, line: lineFor([key]), path: key, message: `${key}「${prefecture[key]}」が ${entries[first]?.file} と重複しています` }] : [];
    })
  );
}

/** ディレクトリの YAML をすべて検証する。誤り・警告をすべて集め、形が通った県を code の順に返す */
export function validateContent(dir: string = contentDir()): ContentResult {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { prefectures: [], errors: [{ file: dir, path: '', message: 'コンテンツのディレクトリがありません（CONTENT_DIR を確かめてください）' }], warnings: [] };
  }
  const names = readdirSync(dir)
    .filter(name => !name.startsWith('.'))
    .sort();
  const badNames: readonly ContentIssue[] = names
    .filter(name => !FILE_NAME.test(name))
    .map(file => ({ file, path: '', message: 'コンテンツのディレクトリには、NN-id.yaml の形の YAML だけを置けます（例：01-hokkaido.yaml）' }));
  const checked = names.filter(name => FILE_NAME.test(name)).map(file => ({ file, ...checkFile(dir, file) }));
  const valid: readonly Valid[] = checked.flatMap(({ file, prefecture, lineFor }) => (prefecture ? [{ file, prefecture, lineFor }] : []));
  return {
    prefectures: valid.map(entry => entry.prefecture).sort((a, b) => a.code.localeCompare(b.code)),
    errors: [...badNames, ...checked.flatMap(entry => entry.errors), ...duplicateIssues(valid)],
    warnings: checked.flatMap(entry => entry.warnings)
  };
}

/** アプリ（ビルド時）用。誤りがあれば、すべての誤りを含むエラーを投げる（ビルドを止める） */
export function loadContent(dir: string = contentDir()): readonly Prefecture[] {
  const { prefectures, errors } = validateContent(dir);
  if (errors.length > 0) {
    throw new Error(`コンテンツに誤りがあります（${dir}）：\n${errors.map(formatIssue).join('\n')}`);
  }
  return prefectures;
}
