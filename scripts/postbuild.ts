// 6.4・D29・D35：next build の出力（out/）を、Workers の assets.directory（dist/）に組み立てる。
// 専用のドメインのルートで配信するので、out/ の構成のままコピーする（_redirects・_headers も dist/ の直下になる）。
// dist/ に分けておくのは、静的出力の後の工程（CSP のハッシュの書き込み〔T4-01〕、sw.js の生成。6.6・U13）をここに加えるため。
// 実行：node scripts/postbuild.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MODE_INIT_SCRIPT } from '../src/features/mode/initScript.ts';

const ROOT_FILES: readonly string[] = ['_redirects', '_headers'];

/** next build の出力（outDir）と、組み立てる先（distDir） */
export type AssembleOptions = {
  readonly outDir: string;
  readonly distDir: string;
};

// a が b と同じか、b の中にある
const isSameOrInside = (a: string, b: string): boolean => {
  const path = relative(resolve(b), resolve(a));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

const assertNotOverlapping = (outDir: string, distDir: string): void => {
  if (isSameOrInside(distDir, outDir) || isSameOrInside(outDir, distDir)) {
    throw new Error(`dist/ と out/ が重なっています（out：${outDir}、dist：${distDir}）`);
  }
};

// out/ の外を指せないように、シンボリックリンクはエラーにする
const assertNoSymlinks = (dir: string): void => {
  const links = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isSymbolicLink())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
  if (links.length > 0) {
    throw new Error(`${dir} にシンボリックリンクがあります：${links.join('・')}`);
  }
};

/** dist/ を作り直し、out/ のファイルを同じ構成でコピーする（シンボリックリンクがあればエラー） */
export const assembleDist = ({ outDir, distDir }: AssembleOptions): void => {
  assertNotOverlapping(outDir, distDir);
  if (!existsSync(outDir)) {
    throw new Error(`${outDir} がありません。先に next build を実行してください`);
  }
  const missing = ROOT_FILES.filter(file => !existsSync(join(outDir, file)));
  if (missing.length > 0) {
    throw new Error(`${outDir} に ${missing.join('・')} がありません（public/ に置く。11.4 (3)・(4)）`);
  }

  assertNoSymlinks(outDir);
  rmSync(distDir, { recursive: true, force: true });
  cpSync(outDir, distDir, { recursive: true });
};

/** Web Analytics（Cloudflare）の計測用スクリプトの配信元（T6 で埋め込む。5.5）。許可するのはこの2つの Cloudflare のドメインだけ */
const ANALYTICS_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com';
const ANALYTICS_BEACON_ORIGIN = 'https://cloudflareinsights.com';

// 実行する script の type。空（なし）・module・JavaScript の MIME
const EXECUTABLE_SCRIPT_TYPE = /^(|module|(application|text)\/(x-)?(java|ecma)script)$/iu;
// 実行されないデータの script の type（CSP の対象外）。ほかの type（importmap・speculationrules など）は、扱いを決めるまでビルドを止める
const DATA_SCRIPT_TYPE = /^application\/(ld\+)?json$/iu;
// 属性の値の中の > で切れないよう、引用符の中は丸ごと読む
const SCRIPT_TAG = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/giu;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/iu;
const TYPE_ATTRIBUTE = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/iu;
const HTML_TAG = /<([a-z][^\s>/]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/giu;
const STYLE_ATTRIBUTE = /(?:^|[\s/"'])style\s*=/iu;
const STYLE_ELEMENT = /<style[\s>/]/iu;
const SCRIPT_OR_LINK = /<(?:script|link)\b/iu;
const CHARSET_META = /<meta\s+charset\b[^>]*>/iu;
const CSP_META = /<meta\s+http-equiv\s*=\s*["']?content-security-policy/iu;

const scriptType = (attributes: string): string => {
  const typeMatch = TYPE_ATTRIBUTE.exec(attributes);
  return (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').trim();
};

/** HTML の `src` のない `<script>` の中身を、出てきた順に返す。実行されない type（`application/json` など）は除く（5.5） */
export const inlineScripts = (html: string): readonly string[] =>
  [...html.matchAll(SCRIPT_TAG)].flatMap(match => {
    const attributes = match[1] ?? '';
    if (SRC_ATTRIBUTE.test(attributes)) return [];
    return EXECUTABLE_SCRIPT_TYPE.test(scriptType(attributes)) ? [match[2] ?? ''] : [];
  });

/**
 * スクリプトの中身（HTML に出たままの UTF-8 の文字列）の CSP のハッシュ（`'sha256-<base64>'`）。
 * HTML のパーサーは `\r\n`・`\r` を `\n` にして字句解析するので、同じ直し方をしてから取る。
 */
export const scriptHash = (text: string): string => `'sha256-${createHash('sha256').update(text.replace(/\r\n?/gu, '\n'), 'utf8').digest('base64')}'`;

/**
 * 出力に出てくることを知っているインラインスクリプトのうち、文字列の全体が決まっているもの（M1・L1）。
 * 初期化スクリプト（D23。`MODE_INIT_SCRIPT`）と、Next.js の RSC のデータの入れ物の初期化。
 * 2つ目のインラインスクリプトを足すときは、ここに足す。
 */
export const KNOWN_EXACT_INLINE_SCRIPTS: readonly string[] = [MODE_INIT_SCRIPT, '(self.__next_f=self.__next_f||[]).push([0])'];

// RSC のデータ：`self.__next_f.push([番号])`・`([番号,"文字列"])`・`([番号,null])`。文字列は JSON の文字列（引用符の外に出るコードを許さないよう、全体に一致させる）
const NEXT_F_PUSH = /^self\.__next_f\.push\(\[\d+(?:,("[^"\\]*(?:\\[\s\S][^"\\]*)*"|null))?\]\)$/u;
// Turbopack の実行時の部品の読み込み：先頭と末尾の間が、JSON のオブジェクト
const TURBOPACK_PREFIX = '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(';
const TURBOPACK_SUFFIX = ');';

const isJsonString = (literal: string): boolean => {
  try {
    return typeof JSON.parse(literal) === 'string';
  } catch {
    return false;
  }
};

const isJsonObject = (text: string): boolean => {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
};

/**
 * 出力に出てくることを知っている形のインラインスクリプトか（M1・L1）。ほかの形はハッシュを許可せずビルドを止める
 * （将来 `dangerouslySetInnerHTML` などで紛れ込んだスクリプトを、集めたハッシュで自動的に許可しないため）。
 * 形は、完全一致（`KNOWN_EXACT_INLINE_SCRIPTS`）・RSC のデータ（`self.__next_f.push`）・Turbopack の読み込み（JSON のオブジェクト）の3つ。
 * どれも全体に一致させる（知っている形の後ろに別のコードを続けたものは許さない）。
 * Next.js・Turbopack の更新で書き出しが変わってビルドが止まったら、出力を確かめてからここを直す。
 */
const isKnownInlineScript = (script: string): boolean => {
  if (KNOWN_EXACT_INLINE_SCRIPTS.includes(script)) return true;
  const push = NEXT_F_PUSH.exec(script);
  if (push !== null) return push[1] === undefined || push[1] === 'null' || isJsonString(push[1]);
  return script.startsWith(TURBOPACK_PREFIX) && script.endsWith(TURBOPACK_SUFFIX) && isJsonObject(script.slice(TURBOPACK_PREFIX.length, -TURBOPACK_SUFFIX.length));
};

/** 知っている形（`isKnownInlineScript`）に合わないインラインスクリプトを返す */
export const unknownInlineScripts = (scripts: readonly string[]): readonly string[] => scripts.filter(script => !isKnownInlineScript(script));

/**
 * CSP を書く前の HTML の問題の一覧（M2）。空なら問題なし。`<script>` の中身（RSC のデータなど）は見ない。
 * `<style>` 要素・`style` 属性（`style-src 'self'` で止まる。5.5・D39）、`<meta charset>` より前の `<script>`・`<link>`
 * （CSP の `<meta>` を `<meta charset>` の直後に入れても、それより前の要素には効かない）、
 * JavaScript でも JSON でもない type の `<script>`（importmap・speculationrules など。扱いを決めるまで止める）。
 */
export const htmlProblems = (html: string): readonly string[] => {
  const problems: string[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const type = scriptType(match[1] ?? '');
    if (!EXECUTABLE_SCRIPT_TYPE.test(type) && !DATA_SCRIPT_TYPE.test(type)) {
      problems.push(`<script type="${type}"> は扱いが決まっていません（JavaScript と JSON だけ）`);
    }
  }
  const stripped = html.replace(SCRIPT_TAG, (_match, attributes: string) => `<script${attributes}></script>`);
  if (STYLE_ELEMENT.test(stripped)) {
    problems.push("<style> 要素があります（style-src 'self' で止まります。クラスで書く）");
  }
  for (const match of stripped.matchAll(HTML_TAG)) {
    const attributes = (match[2] ?? '').replace(/"[^"]*"|'[^']*'/gu, '""');
    if (STYLE_ATTRIBUTE.test(attributes)) {
      problems.push(`style 属性があります（style-src 'self' で止まります。クラスで書く）：<${match[1] ?? ''}>`);
    }
  }
  const charset = stripped.search(CHARSET_META);
  const first = stripped.search(SCRIPT_OR_LINK);
  if (charset >= 0 && first >= 0 && first < charset) {
    problems.push('<meta charset> より前に <script>・<link> があります（CSP の meta は後ろの要素にだけ効きます）');
  }
  return problems;
};

/**
 * HTML の `<meta>` に書く CSP（5.5）。`script-src` はそのページのインラインスクリプトのハッシュ（重複は除く）。`'strict-dynamic'`・`'unsafe-inline'` は使わない。
 * `frame-ancestors` は `<meta>` では効かないので `public/_headers` に書く。
 */
export const pageCsp = (hashes: readonly string[]): string =>
  [
    "default-src 'self'",
    ['script-src', "'self'", ...new Set(hashes), ANALYTICS_SCRIPT_ORIGIN].join(' '),
    "style-src 'self'",
    `connect-src 'self' ${ANALYTICS_BEACON_ORIGIN}`,
    "img-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ') + ';';

/**
 * `<meta charset>` の直後に CSP の `<meta>` を入れる。`<meta>` の CSP はそれより後ろの要素にだけ効くので、どの `<script>`・`<link>` よりも前に置く。
 * `<meta charset>` がない・CSP の `<meta>` がすでにある HTML は例外（ビルドを止める）。
 */
export const injectCsp = (html: string, csp: string): string => {
  if (/["&<>]/u.test(csp)) {
    throw new Error('CSP に " & < > を含められません（meta の content の属性が壊れる、または解釈が変わります）');
  }
  if (CSP_META.test(html)) {
    throw new Error('CSP の meta がすでにあります（二重に入れません）');
  }
  const charset = CHARSET_META.exec(html);
  if (charset === null) {
    throw new Error('HTML に <meta charset> がありません（CSP の meta を入れる位置が決まりません）');
  }
  const end = charset.index + charset[0].length;
  return `${html.slice(0, end)}<meta http-equiv="Content-Security-Policy" content="${csp}"/>${html.slice(end)}`;
};

const htmlFilesIn = (dir: string): readonly string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => join(entry.parentPath, entry.name));

/**
 * dist/ のすべての HTML に、そのページのインラインスクリプトのハッシュを入れた CSP の `<meta>` を書く（5.5、R9）。書いた HTML の数を返す。
 * HTML が1つもない・CSP の `<meta>` がすでにある・`htmlProblems` の問題がある・知っている形（`isKnownInlineScript`）に合わないインラインスクリプトがある・
 * 書いた後に集め直したハッシュが変わる場合は例外。すべての HTML を確かめてから書くので、検査で止まったときは HTML を1つも書き換えない。
 */
export const writePageCsp = (distDir: string): number => {
  const files = htmlFilesIn(distDir);
  if (files.length === 0) {
    throw new Error(`${distDir} に HTML がありません`);
  }
  const outputs = files.map(file => {
    const html = readFileSync(file, 'utf8');
    const scripts = inlineScripts(html);
    const problems = htmlProblems(html);
    if (problems.length > 0) {
      throw new Error(`${file}：${problems.join('／')}`);
    }
    const unknown = unknownInlineScripts(scripts);
    if (unknown.length > 0) {
      throw new Error(`${file}：知らない形のインラインスクリプトがあります（ハッシュを許可しません）：${JSON.stringify((unknown[0] ?? '').slice(0, 80))}`);
    }
    const hashes = scripts.map(scriptHash);
    const out = injectCsp(html, pageCsp(hashes));
    const after = inlineScripts(out).map(scriptHash);
    if (after.length !== hashes.length || after.some((hash, index) => hash !== hashes[index])) {
      throw new Error(`${file}：CSP の meta を入れたことでインラインスクリプトが変わりました`);
    }
    return { file, out };
  });
  for (const { file, out } of outputs) {
    writeFileSync(file, out);
  }
  return files.length;
};

/**
 * `out/` を `dist/` に組み立て、すべての HTML に CSP の `<meta>` を書く。CSP を書けなかったときは、CSP のない `dist/` を残さないよう
 * `dist/` を消して、元の例外を投げ直す（5.5）。
 */
export const assembleDistWithCsp = (options: AssembleOptions): void => {
  assembleDist(options);
  try {
    writePageCsp(options.distDir);
  } catch (error) {
    rmSync(options.distDir, { recursive: true, force: true });
    throw error;
  }
};

// 実行した場所によらず、リポジトリの直下の out/・dist/ を使う
if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  assembleDistWithCsp({ outDir: join(repoRoot, 'out'), distDir: join(repoRoot, 'dist') });
}
