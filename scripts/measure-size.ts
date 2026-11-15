// 5.1・6.6 (2)・D24：最初に読み込むサイズの計測（T3-08。pnpm size。T4-04 で CI からも呼ぶ）。
// 言語ごとに dist/{lang}/index.html と、その HTML が最初に読み込む JS・CSS を数え、gzip 後の合計を基準値と比べる。
// 数えない：__next.*.txt（ソフトナビゲーション用）、市区町村の TopoJSON（最大化したとき）、動的に読む chunk、画像・アイコン、noModule の script。
// dist/ を今の状態のまま測る。CI では pnpm build の直後に実行する（E2E・スクリーンショットのビルドは CONTENT_DIR=tests/fixtures/content で dist/ を上書きするので、その後に測らない）。
// 数えられなかった script・stylesheet の参照（外部の URL など）があれば、小さく見積もらないように終了コード 2 にする。
// Cloudflare Web Analytics の beacon のように、外部の参照を許すときは --allow-external <URL>=<バイト数> で、その参照と見込みの転送サイズ（圧縮後）を明示する。
// 実行：node scripts/measure-size.ts [--dist dist] [--budget 300] [--allow-external <URL>=<バイト数> …] [--json]（Node.js の型の除去で直接動かすので、enum などは使わない）
//   終了コード：0＝基準値に収まる、1＝どれか1言語でも基準値を超える、2＝引数・ファイルの誤り、数えられなかった参照がある
// 相対の import には .ts を付ける。
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { LANGS, type Lang } from '../src/i18n/lang.ts';

/** 5.1：最初に読み込む HTML＋JS＋CSS の圧縮後（gzip）の基準値（KB。1KB は 1000 バイト） */
export const DEFAULT_BUDGET_KB = 300;

const BYTES_PER_KB = 1000;

/** 圧縮前・gzip（既定のレベル 6）・brotli（品質 11）のバイト数 */
export type Size = { readonly raw: number; readonly gzip: number; readonly brotli: number };

/**
 * assetPaths の結果。paths は数えるファイルの URL のパス（重複なし）、skipped は数えなかった script・stylesheet 等の参照（HTML に書かれた値。重複なし）、
 * warnings は skipped を説明する文（HTML 由来の値は `JSON.stringify` で入れる）
 */
export type AssetScan = { readonly paths: readonly string[]; readonly skipped: readonly string[]; readonly warnings: readonly string[] };

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
  /** `--allow-external` で許した外部の参照の、見込みのサイズ（バイト数を3つの列すべてに入れる） */
  readonly external: Size & { readonly count: number };
  /** HTML 全体＋JS＋CSS＋外部の参照 */
  readonly total: Size;
  /** 数えた JS・CSS の URL のパス */
  readonly files: readonly string[];
  /** 数えられず、許してもいない参照の説明。1つでもあれば、合計は小さく出ているので、run は終了コード 2 にする */
  readonly warnings: readonly string[];
};

/** `--allow-external` で許した外部の参照（HTML に書かれた値そのまま）→ 見込みのバイト数 */
export type AllowedExternals = ReadonlyMap<string, number>;

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

type Resolved = { readonly path: string } | { readonly skipped: string; readonly warning: string };

/** href・src の値を、dist の中のパス（`/` で始まる）にする。サイトの外・dist の外を指すものは警告にする */
function resolveReference(raw: string): Resolved {
  const skipped = (reason: string): Resolved => ({ skipped: raw, warning: `${JSON.stringify(raw)}：${reason}ので数えません` });
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
 * `/` で始まる dist の中のパスだけを数え、外部の URL・相対パス・dist の外を指すパス（`..`）は数えずに skipped と警告にする（境界の入力検証）。
 */
export function assetPaths(html: string): AssetScan {
  const scripts = [...html.matchAll(SCRIPT_ELEMENT)].map(([, source = '']) => attributesOf(source)).filter(attributes => attributes.has('src') && !attributes.has('nomodule'));
  // script の中身に link の文字列があっても拾わないように、script を除いてから link を探す
  const links = [...html.replace(SCRIPT_ELEMENT, '').matchAll(LINK_TAG)].map(([, source = '']) => attributesOf(source)).filter(isLoadedLink);
  const references = [...scripts.map(attributes => attributes.get('src')), ...links.map(attributes => attributes.get('href'))].filter((value): value is string => value !== undefined && value !== '');
  const resolved = references.map(resolveReference);
  const skipped = [...new Map(resolved.flatMap(item => ('skipped' in item ? [[item.skipped, item.warning] as const] : []))).entries()];
  return {
    paths: [...new Set(resolved.flatMap(item => ('path' in item ? [item.path] : [])))],
    skipped: skipped.map(([raw]) => raw),
    warnings: skipped.map(([, warning]) => warning)
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

/** target が base の中（base 自身を含まない）にあるか */
function isInside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** dist の中のファイルを読む。dist の外（シンボリックリンクの先を含む）・ファイルでないものは誤りにする（HTML の参照は外から来るので確かめる） */
function readInside(distDir: string, urlPath: string): Buffer {
  const file = resolve(distDir, `.${urlPath}`);
  if (!isInside(resolve(distDir), file)) throw new Error(`${JSON.stringify(urlPath)} が dist の外を指しています`);
  let real: string;
  try {
    real = realpathSync(file);
    if (!statSync(real).isFile()) throw new Error('ファイルではありません');
  } catch {
    throw new Error(`${JSON.stringify(urlPath)} が ${distDir} にありません`);
  }
  if (!isInside(realpathSync(distDir), real)) throw new Error(`${JSON.stringify(urlPath)} が、シンボリックリンクで dist の外を指しています`);
  return readFileSync(real);
}

const withCount = (files: readonly Buffer[]): Size & { readonly count: number } => ({ ...measure(files), count: files.length });

/** 1言語ぶんを測る。HTML が指すファイルが dist になければ例外。外部の参照は、allowed にあれば見込みのサイズを足し、なければ warnings にする */
export function measureLang(distDir: string, lang: Lang, allowed: AllowedExternals = new Map()): LangReport {
  const htmlFile = readInside(distDir, `/${lang}/index.html`);
  const text = htmlFile.toString('utf8');
  const { paths, skipped, warnings: skippedWarnings } = assetPaths(text);
  const { body, rsc } = splitHtml(text);
  const assets = paths.toSorted().map(path => ({ path, file: readInside(distDir, path) }));
  const css = withCount(assets.filter(({ path }) => path.endsWith('.css')).map(({ file }) => file));
  const js = withCount(assets.filter(({ path }) => !path.endsWith('.css')).map(({ file }) => file));
  const html = measure([htmlFile]);
  const estimates = skipped.flatMap(raw => (allowed.has(raw) ? [allowed.get(raw) ?? 0] : []));
  const estimated = estimates.reduce((sum, bytes) => sum + bytes, 0);
  const external = { raw: estimated, gzip: estimated, brotli: estimated, count: estimates.length };
  return {
    lang,
    html,
    body: measure([Buffer.from(body)]),
    rsc: measure([Buffer.from(rsc)]),
    js,
    css,
    external,
    total: add(add(add(html, js), css), external),
    files: assets.map(({ path }) => path),
    warnings: skippedWarnings.filter((_, i) => !allowed.has(skipped[i] ?? ''))
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
    ...(report.external.count > 0 ? [row(`外部の参照（見込み。${report.external.count} 件）`, report.external)] : []),
    row('合計（HTML 全体＋JS＋CSS）', report.total),
    '',
    `基準値 ${budgetKB} KB（gzip）：${verdict}`,
    ''
  ];
}

type Options = { readonly distDir: string; readonly budgetKB: number; readonly json: boolean; readonly allowed: AllowedExternals };

/** `--allow-external` の値 `<URL>=<バイト数>` を、URL と見込みのバイト数にする（URL の中に `=` があってもよいので、最後の `=` で分ける）。誤りは例外 */
function parseAllowedExternal(value: string): readonly [string, number] {
  const at = value.lastIndexOf('=');
  const url = value.slice(0, at);
  const bytes = value.slice(at + 1);
  if (at <= 0 || !/^\d+$/u.test(bytes) || !Number.isSafeInteger(Number(bytes))) {
    throw new Error(`--allow-external は <URL>=<バイト数（0以上の整数）> の形にしてください：${JSON.stringify(value)}`);
  }
  return [url, Number(bytes)];
}

/** コマンドラインの引数を確かめる。誤りは例外 */
function parseOptions(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: { dist: { type: 'string' }, budget: { type: 'string' }, json: { type: 'boolean' }, 'allow-external': { type: 'string', multiple: true } },
    strict: true
  });
  const budgetKB = values.budget === undefined ? DEFAULT_BUDGET_KB : Number(values.budget);
  if (!Number.isFinite(budgetKB) || budgetKB <= 0) throw new Error(`--budget は正の数（KB）にしてください：${JSON.stringify(values.budget)}`);
  return {
    distDir: values.dist ?? join(import.meta.dirname, '..', 'dist'),
    budgetKB,
    json: values.json === true,
    allowed: new Map((values['allow-external'] ?? []).map(parseAllowedExternal))
  };
}

/** 計測して結果を出し、終了コードを返す（0：収まる、1：超過、2：引数・ファイルの誤り、数えられなかった参照がある） */
export function run(argv: readonly string[], io: Io): number {
  try {
    const { distDir, budgetKB, json, allowed } = parseOptions(argv);
    const reports = LANGS.map(lang => measureLang(distDir, lang, allowed));
    reports.forEach(report => report.warnings.forEach(warning => io.warn(`[${report.lang}] ${warning}`)));
    const ok = reports.every(report => report.total.gzip <= budgetKB * BYTES_PER_KB);
    const lines = json ? [JSON.stringify({ budgetKB, ok, results: reports }, null, 2)] : reports.flatMap(report => formatReport(report, budgetKB));
    lines.forEach(io.write);
    // 数えられなかった参照があると、合計は小さく出ている。収まって見えても成功にしない
    if (reports.some(report => report.warnings.length > 0)) {
      io.warn('数えられなかった参照があるので、合計は実際より小さく出ています。外部の参照を許すときは --allow-external <URL>=<バイト数> で見込みのサイズを指定してください');
      return 2;
    }
    return ok ? 0 : 1;
  } catch (error) {
    io.warn(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = run(process.argv.slice(2), { write: line => process.stdout.write(`${line}\n`), warn: line => process.stderr.write(`${line}\n`) });
}
