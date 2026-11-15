// 6.4・D29・D35：next build の出力（out/）を、Workers の assets.directory（dist/）に組み立てる。
// 専用のドメインのルートで配信するので、out/ の構成のままコピーする（_redirects・_headers も dist/ の直下になる）。
// dist/ に分けておくのは、静的出力の後の工程（CSP のハッシュの書き込み〔T4-01〕、sw.js の生成。6.6・U13）をここに加えるため。
// 実行：node scripts/postbuild.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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

// 実行できる script の type。空（なし）・module・importmap・JavaScript の MIME。これ以外（application/json など）は実行されず、CSP の対象外
const EXECUTABLE_SCRIPT_TYPE = /^(|module|importmap|(application|text)\/(x-)?(java|ecma)script)$/iu;
// 属性の値の中の > で切れないよう、引用符の中は丸ごと読む
const SCRIPT_TAG = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/giu;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/iu;
const TYPE_ATTRIBUTE = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/iu;
const CHARSET_META = /<meta\s+charset\b[^>]*>/iu;
const CSP_META = /<meta\s+http-equiv\s*=\s*["']?content-security-policy/iu;

/** HTML の `src` のない `<script>` の中身を、出てきた順に返す。実行されない type（`application/json` など）は除く（5.5） */
export const inlineScripts = (html: string): readonly string[] =>
  [...html.matchAll(SCRIPT_TAG)].flatMap(match => {
    const attributes = match[1] ?? '';
    if (SRC_ATTRIBUTE.test(attributes)) return [];
    const typeMatch = TYPE_ATTRIBUTE.exec(attributes);
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').trim();
    return EXECUTABLE_SCRIPT_TYPE.test(type) ? [match[2] ?? ''] : [];
  });

/** スクリプトの中身（HTML に出たままの UTF-8 の文字列）の CSP のハッシュ（`'sha256-<base64>'`） */
export const scriptHash = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

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
  if (csp.includes('"')) {
    throw new Error('CSP に " を含められません（meta の content の属性が壊れます）');
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
 * HTML が1つもない・CSP の `<meta>` がすでにある・書いた後に集め直したハッシュが変わる場合は例外。
 */
export const writePageCsp = (distDir: string): number => {
  const files = htmlFilesIn(distDir);
  if (files.length === 0) {
    throw new Error(`${distDir} に HTML がありません`);
  }
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const hashes = inlineScripts(html).map(scriptHash);
    const out = injectCsp(html, pageCsp(hashes));
    const after = inlineScripts(out).map(scriptHash);
    if (after.length !== hashes.length || after.some((hash, index) => hash !== hashes[index])) {
      throw new Error(`${file}：CSP の meta を入れたことでインラインスクリプトが変わりました`);
    }
    writeFileSync(file, out);
  }
  return files.length;
};

// 実行した場所によらず、リポジトリの直下の out/・dist/ を使う
if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  const distDir = join(repoRoot, 'dist');
  assembleDist({ outDir: join(repoRoot, 'out'), distDir });
  writePageCsp(distDir);
}
