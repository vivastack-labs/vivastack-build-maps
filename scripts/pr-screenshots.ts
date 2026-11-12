// 画面が変わるPRに載せる、before（base。既定は origin/main）と after（今の作業ツリー）のスクリーンショットを撮る。
// 画像は main と履歴を共有しない screenshots ブランチの <id>/before・<id>/after に push し、
// PR本文に貼る Markdown の表を標準出力に出す。画像の URL は commit で固定するので、後で撮り直しても過去のPRの画像は変わらない。
// 実行：node scripts/pr-screenshots.ts [--id <ディレクトリ名>] [--base origin/<ブランチ>] > <ファイル>
// 撮る画面は tests/screenshots/、設定は playwright.screenshots.config.ts（どちらも今のブランチのものを before にも使う）
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export type RunOptions = {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** 失敗しても例外にせず、空の出力を返す */
  readonly allowFailure?: boolean;
  /** 出力を標準エラーに流す（ビルド・撮影の進み具合を見せる。標準出力は表のために空けておく） */
  readonly showOutput?: boolean;
};

/** コマンドを実行して標準出力を返す。テストでは差し替える */
export type Run = (command: string, args: readonly string[], options?: RunOptions) => string;

export type ImageRow = {
  readonly name: string;
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
  readonly isSame: boolean;
};

const BRANCH = 'screenshots';
const REMOTE_REF = `refs/remotes/origin/${BRANCH}`;
const CONFIG_FILE = 'playwright.screenshots.config.ts';
const CAPTURE_FILES: readonly string[] = [CONFIG_FILE, 'tests/screenshots'];
const PLAYWRIGHT_ARGS: readonly string[] = ['exec', 'playwright', 'test', '--config', CONFIG_FILE];
const DEFAULT_BASE = 'origin/main';
const IMAGE_WIDTH = 360;
const SHORT_SHA_LENGTH = 7;
const PNG = '.png';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NOT_WORK_BRANCHES: readonly string[] = ['main', 'HEAD'];

const assertSafeId = (id: string): string => {
  if (!SAFE_ID.test(id) || id.includes('..')) {
    throw new Error(`screenshots ブランチのディレクトリ名に使えません：${JSON.stringify(id)}`);
  }
  return id;
};

/** 作業ブランチの名前から、screenshots ブランチのディレクトリ名を作る（例：feat/T2-03-map → feat-T2-03-map） */
export const screenshotIdOf = (branch: string): string => {
  if (NOT_WORK_BRANCHES.includes(branch)) {
    throw new Error(`作業ブランチで実行してください（今は ${branch}）`);
  }
  return assertSafeId(branch.replaceAll('/', '-'));
};

/** origin の URL から owner/repo を取り出す */
export const repoOf = (remoteUrl: string): string => {
  const match = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(remoteUrl);
  if (!match?.[1]) {
    throw new Error(`origin が GitHub のリポジトリではありません：${remoteUrl.trim()}`);
  }
  return match[1];
};

/** ディレクトリの PNG の名前を並べて返す。ディレクトリがなければ空 */
export const listPngs = (dir: string): readonly string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(name => name.endsWith(PNG))
        .sort()
    : [];

/** before・after の画像（名前 → blob）を、名前で合わせて表の行にする */
export const imageRows = (before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): readonly ImageRow[] =>
  [...new Set([...before.keys(), ...after.keys()])].sort().map(name => ({
    name,
    hasBefore: before.has(name),
    hasAfter: after.has(name),
    isSame: before.has(name) && before.get(name) === after.get(name)
  }));

type TableInput = {
  readonly repo: string;
  readonly commit: string;
  readonly id: string;
  readonly baseRef: string;
  readonly baseCommit: string;
  readonly rows: readonly ImageRow[];
};

/** PR本文の「画面の変更」の節を作る */
export const markdownTable = ({ repo, commit, id, baseRef, baseCommit, rows }: TableInput): string => {
  const cell = (side: 'before' | 'after', name: string, exists: boolean): string => {
    if (!exists) return 'なし';
    const label = name.slice(0, -PNG.length);
    const url = `https://github.com/${repo}/blob/${commit}/${id}/${side}/${name}?raw=true`;
    return `<img src="${url}" width="${IMAGE_WIDTH}" alt="${side}：${label}">`;
  };
  const line = (row: ImageRow): string => {
    const label = row.name.slice(0, -PNG.length) + (row.isSame ? '（変化なし）' : '');
    return `| ${label} | ${cell('before', row.name, row.hasBefore)} | ${cell('after', row.name, row.hasAfter)} |`;
  };
  return [
    '## 画面の変更',
    '',
    `before は \`${baseRef}\`（${baseCommit.slice(0, SHORT_SHA_LENGTH)}）、after はこのブランチ。`,
    '',
    '| 画面 | before | after |',
    '|---|---|---|',
    ...rows.map(line),
    ''
  ].join('\n');
};

type CaptureBeforeInput = {
  readonly repoRoot: string;
  readonly baseRef: string;
  readonly worktreeDir: string;
  readonly outDir: string;
};

/** base を worktree に取り出して撮る。main にまだない画面は撮れないので、撮影の失敗では止めない */
export const captureBefore = (run: Run, { repoRoot, baseRef, worktreeDir, outDir }: CaptureBeforeInput): void => {
  run('git', ['worktree', 'add', '--detach', worktreeDir, baseRef], { cwd: repoRoot });
  try {
    CAPTURE_FILES.forEach(path => cpSync(join(repoRoot, path), join(worktreeDir, path), { recursive: true }));
    run('pnpm', ['install', '--frozen-lockfile'], { cwd: worktreeDir, showOutput: true });
    run('pnpm', PLAYWRIGHT_ARGS, { cwd: worktreeDir, env: { SCREENSHOT_OUT: outDir }, allowFailure: true, showOutput: true });
  } finally {
    run('git', ['worktree', 'remove', '--force', worktreeDir], { cwd: repoRoot });
  }
};

/** 今の作業ツリーで撮る */
export const captureAfter = (run: Run, { repoRoot, outDir }: { readonly repoRoot: string; readonly outDir: string }): void => {
  run('pnpm', PLAYWRIGHT_ARGS, { cwd: repoRoot, env: { SCREENSHOT_OUT: outDir }, showOutput: true });
};

type PublishInput = {
  readonly repoRoot: string;
  readonly id: string;
  readonly beforeDir: string;
  readonly afterDir: string;
  /** 一時的な index。作業ツリーの index とブランチには手を付けない */
  readonly indexFile: string;
};

export type PublishResult = {
  readonly commit: string;
  readonly before: ReadonlyMap<string, string>;
  readonly after: ReadonlyMap<string, string>;
};

const remoteParent = (run: Run, cwd: string): string => {
  run('git', ['fetch', 'origin', `+refs/heads/${BRANCH}:${REMOTE_REF}`], { cwd, allowFailure: true });
  return run('git', ['rev-parse', '--verify', REMOTE_REF], { cwd, allowFailure: true }).trim();
};

/** before・after の画像を screenshots ブランチの <id>/ に置き換えて push し、commit と画像の blob を返す */
export const publishScreenshots = (run: Run, { repoRoot, id, beforeDir, afterDir, indexFile }: PublishInput): PublishResult => {
  if (listPngs(afterDir).length === 0) {
    throw new Error(`after のスクリーンショットがありません（${afterDir}）。撮影の出力を確かめてください`);
  }
  const parent = remoteParent(run, repoRoot);
  const git = (args: readonly string[]): string => run('git', args, { cwd: repoRoot, env: { GIT_INDEX_FILE: indexFile } }).trim();
  git(parent === '' ? ['read-tree', '--empty'] : ['read-tree', parent]);
  git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', id]);
  const add = (side: 'before' | 'after', dir: string): ReadonlyMap<string, string> =>
    new Map(
      listPngs(dir).map(name => {
        const blob = git(['hash-object', '-w', join(dir, name)]);
        git(['update-index', '--add', '--cacheinfo', `100644,${blob},${id}/${side}/${name}`]);
        return [name, blob] as const;
      })
    );
  const before = add('before', beforeDir);
  const after = add('after', afterDir);
  const tree = git(['write-tree']);
  const commit = git(['commit-tree', tree, ...(parent === '' ? [] : ['-p', parent]), '-m', `chore: ${id} のスクリーンショット`]);
  run('git', ['push', 'origin', `${commit}:refs/heads/${BRANCH}`], { cwd: repoRoot });
  return { commit, before, after };
};

const parseOptions = (argv: readonly string[]): { readonly id: string | undefined; readonly baseRef: string } => {
  const { values } = parseArgs({ args: [...argv], options: { id: { type: 'string' }, base: { type: 'string' } }, strict: true });
  const baseRef = values.base ?? DEFAULT_BASE;
  if (!baseRef.startsWith('origin/')) {
    throw new Error(`--base は origin/<ブランチ> の形で指定してください（今は ${baseRef}）`);
  }
  return { id: values.id === undefined ? undefined : assertSafeId(values.id), baseRef };
};

/** before・after を撮って push し、PR本文に貼る Markdown を返す */
export const prScreenshots = (run: Run, { argv, tempDir }: { readonly argv: readonly string[]; readonly tempDir: string }): string => {
  const { id: givenId, baseRef } = parseOptions(argv);
  const repoRoot = run('git', ['rev-parse', '--show-toplevel']).trim();
  const git = (args: readonly string[]): string => run('git', args, { cwd: repoRoot }).trim();
  const id = givenId ?? screenshotIdOf(git(['rev-parse', '--abbrev-ref', 'HEAD']));
  const repo = repoOf(git(['remote', 'get-url', 'origin']));
  git(['fetch', 'origin', baseRef.slice('origin/'.length)]);
  const baseCommit = git(['rev-parse', '--verify', baseRef]);
  const beforeDir = join(tempDir, 'before');
  const afterDir = join(tempDir, 'after');
  captureBefore(run, { repoRoot, baseRef, worktreeDir: join(tempDir, 'base'), outDir: beforeDir });
  captureAfter(run, { repoRoot, outDir: afterDir });
  const { commit, before, after } = publishScreenshots(run, { repoRoot, id, beforeDir, afterDir, indexFile: join(tempDir, 'index') });
  return markdownTable({ repo, commit, id, baseRef, baseCommit, rows: imageRows(before, after) });
};

const execRun: Run = (command, args, options = {}) => {
  try {
    const output: string | null = execFileSync(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      encoding: 'utf8',
      // showOutput のときは、子の標準出力も標準エラー（2）に流す。このとき戻り値は null になる
      stdio: options.showOutput ? ['ignore', 2, 2] : ['ignore', 'pipe', 2]
    });
    return output ?? '';
  } catch (error) {
    if (options.allowFailure) return '';
    throw error;
  }
};

if (import.meta.main) {
  const tempDir = mkdtempSync(join(tmpdir(), 'pr-screenshots-'));
  try {
    process.stdout.write(prScreenshots(execRun, { argv: process.argv.slice(2), tempDir }));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
