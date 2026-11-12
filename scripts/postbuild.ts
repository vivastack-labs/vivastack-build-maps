// 6.4・U8・R7：next build の出力（out/）を、Workers の assets.directory（dist/）の構成に組み立てる。
// basePath を付けても out/ は /maps の下にまとまらない（HTML の中の参照は /maps 付きで出る）ので、
// out/ の中身を dist/maps/ に移す。_redirects・_headers は Workers が読むので dist/ の直下に置く。
// 実行：node scripts/postbuild.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const BASE_DIR = 'maps';
const ROOT_FILES: readonly string[] = ['_redirects', '_headers'];

export type AssembleOptions = {
  readonly outDir: string;
  readonly distDir: string;
};

const isSafeRelativePath = (path: string): boolean =>
  path !== '' && !path.startsWith('/') && !path.includes('\\') && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');

/** out/ の中の相対パス（区切りは /）から、dist/ の中の相対パスを返す */
export const distPathOf = (outPath: string): string => {
  if (!isSafeRelativePath(outPath)) {
    throw new Error(`out/ の中の相対パスではありません：${JSON.stringify(outPath)}`);
  }
  return ROOT_FILES.includes(outPath) ? outPath : `${BASE_DIR}/${outPath}`;
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
const listFiles = (dir: string): readonly string[] => {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  const toRelative = (entry: (typeof entries)[number]): string => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/');
  const links = entries.filter(entry => entry.isSymbolicLink()).map(toRelative);
  if (links.length > 0) {
    throw new Error(`${dir} にシンボリックリンクがあります：${links.join('・')}`);
  }
  return entries.filter(entry => entry.isFile()).map(toRelative);
};

/** dist/ を作り直し、out/ のファイルを distPathOf の場所へコピーする */
export const assembleDist = ({ outDir, distDir }: AssembleOptions): void => {
  assertNotOverlapping(outDir, distDir);
  if (!existsSync(outDir)) {
    throw new Error(`${outDir} がありません。先に next build を実行してください`);
  }
  const missing = ROOT_FILES.filter(file => !existsSync(join(outDir, file)));
  if (missing.length > 0) {
    throw new Error(`${outDir} に ${missing.join('・')} がありません（public/ に置く。11.4 (3)・(4)）`);
  }

  const files = listFiles(outDir);
  rmSync(distDir, { recursive: true, force: true });
  for (const file of files) {
    const target = join(distDir, distPathOf(file));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(outDir, file), target);
  }
};

// 実行した場所によらず、リポジトリの直下の out/・dist/ を使う
if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  assembleDist({ outDir: join(repoRoot, 'out'), distDir: join(repoRoot, 'dist') });
}
