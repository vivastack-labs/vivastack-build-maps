// 5.1・6.6 (2)・D24：最初に読み込むサイズの計測（T3-08。pnpm size。T4-04 で CI からも呼ぶ）。
// 言語ごとに dist/{lang}/index.html と、その HTML が最初に読み込む JS・CSS を数え、gzip 後の合計を基準値と比べる。
// 数えない：__next.*.txt（ソフトナビゲーション用）、市区町村の TopoJSON（最大化したとき）、動的に読む chunk、画像・アイコン、noModule の script。
// 実行：node scripts/measure-size.ts [--dist dist] [--budget 300] [--json]（Node.js の型の除去で直接動かすので、enum などは使わない）
//   終了コード：0＝基準値に収まる、1＝どれか1言語でも基準値を超える、2＝引数・ファイルの誤り
// 相対の import には .ts を付ける。
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { LANGS, type Lang } from '../src/i18n/lang.ts';

/** 5.1：最初に読み込む HTML＋JS＋CSS の圧縮後（gzip）の基準値（KB。1KB は 1000 バイト） */
export const DEFAULT_BUDGET_KB = 300;

const BYTES_PER_KB = 1000;

/** 圧縮前・gzip（既定のレベル 6）・brotli（品質 11）のバイト数 */
export type Size = { readonly raw: number; readonly gzip: number; readonly brotli: number };

/** assetPaths の結果。paths は数えるファイルの URL のパス（重複なし）、warnings は数えなかった参照 */
export type AssetScan = { readonly paths: readonly string[]; readonly warnings: readonly string[] };

/** 1言語ぶんの計測結果 */
export type LangReport = {
  readonly lang: Lang;
  /** HTML 全体 */
  readonly html: Size;
  /** HTML のうち、RSC のデータ（`<script>self.__next_f.push(…)</script>`）を除いた部分 */
  readonly body: Size;
  /** HTML のうち、RSC のデータ（`<script>self.__next_f.push(…)</script>`）の部分 */
  readonly rsc: Size;
  readonly js: Size & { readonly count: number };
  readonly css: Size & { readonly count: number };
  /** HTML 全体＋JS＋CSS */
  readonly total: Size;
  /** 数えた JS・CSS の URL のパス */
  readonly files: readonly string[];
  readonly warnings: readonly string[];
};

/** run の出力先。write は表・JSON、warn は警告・誤り */
export type Io = { readonly write: (line: string) => void; readonly warn: (line: string) => void };

const SCRIPT_ELEMENT = /<script\b([^>]*)>[\s\S]*?<\/script>/giu;
const LINK_TAG = /<link\b([^>]*)>/giu;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gu;
const RSC_SCRIPT = /<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/gu;

/** タグの属性を、名前（小文字）→ 値 にする（値のない属性は空文字） */
function attributesOf(source: string): ReadonlyMap<string, string> {
  return new Map([...source.matchAll(ATTRIBUTE)].map(([, name = '', ...values]) => [name.toLowerCase(), values.find(value => value !== undefined) ?? ''] as const));
}

/** 最初に読み込む link か（stylesheet・JS か CSS の preload・modulepreload） */
function isLoadedLink(attributes: ReadonlyMap<string, string>): boolean {
  const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/u);
  if (rel.includes('stylesheet') || rel.includes('modulepreload')) return true;
  return rel.includes('preload') && ['script', 'style'].includes((attributes.get('as') ?? '').toLowerCase());
}

type Resolved = { readonly path: string } | { readonly warning: string };

/** href・src の値を、dist の中のパス（`/` で始まる）にする。サイトの外・dist の外を指すものは警告にする */
function resolveReference(raw: string): Resolved {
  const skipped = (reason: string): Resolved => ({ warning: `${raw}：${reason}ので数えません` });
  const pathOnly = raw.replace(/[?#][\s\S]*$/u, '');
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return skipped('サイトの外か、`/` で始まらないパス');
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return skipped('パスの % の表記が正しくない');
  }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(segment => segment === '..' || segment === '.')) return skipped('dist の外を指す可能性がある');
  return { path: decoded };
}

/**
 * HTML が最初に読み込むファイルの URL のパスを、重複なしで返す（5.1）。
 * 数える：`<script src>`（noModule を除く。今のブラウザは読まない）、`<link rel="stylesheet">`、`as="script"|"style"` の `preload`、`modulepreload`。
 * `/` で始まる dist の中のパスだけを数え、外部の URL・相対パス・dist の外を指すパス（`..`）は数えずに警告にする（境界の入力検証）。
 */
export function assetPaths(html: string): AssetScan {
  const scripts = [...html.matchAll(SCRIPT_ELEMENT)].map(([, source = '']) => attributesOf(source)).filter(attributes => attributes.has('src') && !attributes.has('nomodule'));
  // script の中身に link の文字列があっても拾わないように、script を除いてから link を探す
  const links = [...html.replace(SCRIPT_ELEMENT, '').matchAll(LINK_TAG)].map(([, source = '']) => attributesOf(source)).filter(isLoadedLink);
  const references = [...scripts.map(attributes => attributes.get('src')), ...links.map(attributes => attributes.get('href'))].filter((value): value is string => value !== undefined && value !== '');
  const resolved = references.map(resolveReference);
  return {
    paths: [...new Set(resolved.flatMap(item => ('path' in item ? [item.path] : [])))],
    warnings: resolved.flatMap(item => ('warning' in item ? [item.warning] : []))
  };
}

/**
 * HTML を、RSC のデータ（`<script>self.__next_f.push(…)</script>` を順に並べたもの）と、それを除いた本体に分ける（6.6 (2)）。
 * body と rsc の長さの和は、元の HTML の長さと同じ。
 */
export function splitHtml(html: string): { readonly body: string; readonly rsc: string } {
  return { body: html.replace(RSC_SCRIPT, ''), rsc: [...html.matchAll(RSC_SCRIPT)].map(([script = '']) => script).join('') };
}

const brotliSize = (file: Uint8Array): number => brotliCompressSync(file, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

/** ファイルごとに圧縮して、圧縮前・gzip・brotli を合計する（ブラウザはファイルごとに転送するので、まとめて圧縮しない） */
export function measure(files: readonly Uint8Array[]): Size {
  return files.reduce<Size>((sum, file) => ({ raw: sum.raw + file.length, gzip: sum.gzip + gzipSync(file).length, brotli: sum.brotli + brotliSize(file) }), { raw: 0, gzip: 0, brotli: 0 });
}

const add = (a: Size, b: Size): Size => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip, brotli: a.brotli + b.brotli });

/** dist の中のファイルを読む。dist の外・ファイルでないものは誤りにする（HTML の参照は外から来るので確かめる） */
function readInside(distDir: string, urlPath: string): Buffer {
  const file = resolve(distDir, `.${urlPath}`);
  const path = relative(resolve(distDir), file);
  if (path === '' || path.startsWith('..') || isAbsolute(path)) throw new Error(`${urlPath} が dist の外を指しています`);
  let isFile = false;
  try {
    isFile = statSync(file).isFile();
  } catch {
    // ないときは下で誤りにする
  }
  if (!isFile) throw new Error(`${urlPath} が ${distDir} にありません`);
  return readFileSync(file);
}

const withCount = (files: readonly Buffer[]): Size & { readonly count: number } => ({ ...measure(files), count: files.length });

/** 1言語ぶんを測る。HTML が指すファイルが dist になければ例外 */
export function measureLang(distDir: string, lang: Lang): LangReport {
  const htmlFile = readInside(distDir, `/${lang}/index.html`);
  const text = htmlFile.toString('utf8');
  const { paths, warnings } = assetPaths(text);
  const { body, rsc } = splitHtml(text);
  const assets = paths.toSorted().map(path => ({ path, file: readInside(distDir, path) }));
  const css = withCount(assets.filter(({ path }) => path.endsWith('.css')).map(({ file }) => file));
  const js = withCount(assets.filter(({ path }) => !path.endsWith('.css')).map(({ file }) => file));
  const html = measure([htmlFile]);
  return {
    lang,
    html,
    body: measure([Buffer.from(body)]),
    rsc: measure([Buffer.from(rsc)]),
    js,
    css,
    total: add(add(html, js), css),
    files: assets.map(({ path }) => path),
    warnings
  };
}

const kb = (bytes: number): string => (bytes / BYTES_PER_KB).toFixed(1);

const row = (label: string, size: Size): string => `| ${label} | ${kb(size.raw)} | ${kb(size.gzip)} | ${kb(size.brotli)} |`;

/** 1言語ぶんの Markdown の表（KB。基準値と比べるのは gzip） */
function formatReport(report: LangReport, budgetKB: number): readonly string[] {
  const margin = budgetKB - report.total.gzip / BYTES_PER_KB;
  const verdict = margin >= 0 ? `収まる（余裕 ${margin.toFixed(1)} KB）` : `超過（${(-margin).toFixed(1)} KB）`;
  return [
    `## ${report.lang}`,
    '',
    '| 項目 | 圧縮前（KB） | gzip（KB） | brotli（KB） |',
    '|---|---:|---:|---:|',
    row('HTML 全体', report.html),
    row('　うち本体', report.body),
    row('　うち RSC のデータ', report.rsc),
    row(`JS（${report.js.count} ファイル）`, report.js),
    row(`CSS（${report.css.count} ファイル）`, report.css),
    row('合計（HTML 全体＋JS＋CSS）', report.total),
    '',
    `基準値 ${budgetKB} KB（gzip）：${verdict}`,
    ''
  ];
}

type Options = { readonly distDir: string; readonly budgetKB: number; readonly json: boolean };

/** コマンドラインの引数を確かめる。誤りは例外 */
function parseOptions(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: { dist: { type: 'string' }, budget: { type: 'string' }, json: { type: 'boolean' } },
    strict: true
  });
  const budgetKB = values.budget === undefined ? DEFAULT_BUDGET_KB : Number(values.budget);
  if (!Number.isFinite(budgetKB) || budgetKB <= 0) throw new Error(`--budget は正の数（KB）にしてください：${String(values.budget)}`);
  return { distDir: values.dist ?? join(import.meta.dirname, '..', 'dist'), budgetKB, json: values.json === true };
}

/** 計測して結果を出し、終了コードを返す（0：収まる、1：超過、2：引数・ファイルの誤り） */
export function run(argv: readonly string[], io: Io): number {
  try {
    const { distDir, budgetKB, json } = parseOptions(argv);
    const reports = LANGS.map(lang => measureLang(distDir, lang));
    reports.forEach(report => report.warnings.forEach(warning => io.warn(`[${report.lang}] ${warning}`)));
    const ok = reports.every(report => report.total.gzip <= budgetKB * BYTES_PER_KB);
    const lines = json ? [JSON.stringify({ budgetKB, ok, results: reports }, null, 2)] : reports.flatMap(report => formatReport(report, budgetKB));
    lines.forEach(io.write);
    return ok ? 0 : 1;
  } catch (error) {
    io.warn(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = run(process.argv.slice(2), { write: line => process.stdout.write(`${line}\n`), warn: line => process.stderr.write(`${line}\n`) });
}
