// 6.4・D29・D35：next build の出力（out/）を、Workers の assets.directory（dist/）に組み立てる。
// 専用のドメインのルートで配信するので、out/ の構成のままコピーする（_redirects・_headers も dist/ の直下になる）。
// dist/ に分けておくのは、静的出力の後の工程（CSP のハッシュの書き込み、sw.js の生成。6.6・U13）をここに加えるため。
// 実行：node scripts/postbuild.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
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

// 実行した場所によらず、リポジトリの直下の out/・dist/ を使う
if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  assembleDist({ outDir: join(repoRoot, 'out'), distDir: join(repoRoot, 'dist') });
}
