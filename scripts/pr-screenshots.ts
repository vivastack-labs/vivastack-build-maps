// 画面が変わるPRに載せる、今の作業ツリー（after）のスクリーンショットを撮る。before は前のPRの after で見られるので撮らない。
// 画像は main と履歴を共有しない screenshots ブランチに、<id>/ だけを入れた commit として push し、
// PR本文に貼る Markdown の表を標準出力に出す。画像の URL は commit で固定するので、後のPRや撮り直しで過去のPRの画像は変わらない。
// push の前に取るのは screenshots の先頭の commit だけ（--depth=1）。過去のPRの画像はダウンロードしない
// 実行：node scripts/pr-screenshots.ts [--id <ディレクトリ名>] > <ファイル>
// 撮る画面は tests/screenshots/、設定は playwright.screenshots.config.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

/** Run に渡すコマンドの実行の設定 */
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

const BRANCH = 'screenshots';
const BRANCH_REF = `refs/heads/${BRANCH}`;
const CONFIG_FILE = 'playwright.screenshots.config.ts';
const PLAYWRIGHT_ARGS: readonly string[] = ['exec', 'playwright', 'test', '--config', CONFIG_FILE];
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

type TableInput = {
  readonly repo: string;
  /** 画像を入れた screenshots ブランチの commit */
  readonly commit: string;
  readonly id: string;
  /** 撮った作業ブランチの commit */
  readonly headCommit: string;
  readonly names: readonly string[];
};

/** PR本文の「画面の変更」の節を作る */
export const markdownTable = ({ repo, commit, id, headCommit, names }: TableInput): string => {
  const line = (name: string): string => {
    const label = name.slice(0, -PNG.length);
    const url = `https://github.com/${repo}/blob/${commit}/${id}/${name}?raw=true`;
    return `| ${label} | <img src="${url}" width="${IMAGE_WIDTH}" alt="${label}"> |`;
  };
  return ['## 画面の変更', '', `このブランチ（${headCommit.slice(0, SHORT_SHA_LENGTH)}）の画面。`, '', '| 画面 | after |', '|---|---|', ...names.map(line), ''].join('\n');
};

/** 今の作業ツリーで撮る。撮影の失敗は止める */
export const captureScreenshots = (run: Run, { repoRoot, outDir }: { readonly repoRoot: string; readonly outDir: string }): void => {
  run('pnpm', PLAYWRIGHT_ARGS, { cwd: repoRoot, env: { SCREENSHOT_OUT: outDir }, showOutput: true });
};

type PublishInput = {
  readonly repoRoot: string;
  readonly id: string;
  readonly outDir: string;
  /** 一時的な index。作業ツリーの index とブランチには手を付けない */
  readonly indexFile: string;
};

/** push した commit と、入れた画像の名前 */
export type PublishResult = {
  readonly commit: string;
  readonly names: readonly string[];
};

/**
 * screenshots ブランチの先頭の commit を返す。ブランチがなければ空。
 * 問い合わせの失敗は止める（ブランチがないとみなすと、親のない commit を作ってしまう）。
 * 先頭の commit だけを取り、追跡ブランチは作らない（ふだんの fetch の対象から外しているため。docs/development-commands.md）
 */
const remoteParent = (run: Run, cwd: string): string => {
  if (run('git', ['ls-remote', '--heads', 'origin', BRANCH_REF], { cwd }).trim() === '') return '';
  run('git', ['fetch', '--depth=1', '--refmap=', 'origin', BRANCH_REF], { cwd });
  return run('git', ['rev-parse', '--verify', 'FETCH_HEAD'], { cwd }).trim();
};

/** 画像だけを入れた commit を、screenshots ブランチの先頭に push し、commit と画像の名前を返す */
export const publishScreenshots = (run: Run, { repoRoot, id, outDir, indexFile }: PublishInput): PublishResult => {
  const names = listPngs(outDir);
  if (names.length === 0) {
    throw new Error(`スクリーンショットがありません（${outDir}）。撮影の出力を確かめてください`);
  }
  const parent = remoteParent(run, repoRoot);
  const git = (args: readonly string[]): string => run('git', args, { cwd: repoRoot, env: { GIT_INDEX_FILE: indexFile } }).trim();
  git(['read-tree', '--empty']);
  names.forEach(name => {
    const blob = git(['hash-object', '-w', join(outDir, name)]);
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},${id}/${name}`]);
  });
  const tree = git(['write-tree']);
  const commit = git(['commit-tree', tree, ...(parent === '' ? [] : ['-p', parent]), '-m', `chore: ${id} のスクリーンショット`]);
  run('git', ['push', 'origin', `${commit}:${BRANCH_REF}`], { cwd: repoRoot });
  // push は追跡ブランチを作るので消す（残すと、ふだんの fetch では更新されない古いブランチになる）
  run('git', ['update-ref', '-d', `refs/remotes/origin/${BRANCH}`], { cwd: repoRoot });
  return { commit, names };
};

const parseOptions = (argv: readonly string[]): string | undefined => {
  const { values } = parseArgs({ args: [...argv], options: { id: { type: 'string' } }, strict: true });
  return values.id === undefined ? undefined : assertSafeId(values.id);
};

type PrScreenshotsInput = {
  readonly argv: readonly string[];
  readonly tempDir: string;
  /** 標準エラーに出す警告 */
  readonly warn: (message: string) => void;
};

/** 今の作業ツリーを撮って push し、PR本文に貼る Markdown を返す */
export const prScreenshots = (run: Run, { argv, tempDir, warn }: PrScreenshotsInput): string => {
  const givenId = parseOptions(argv);
  const repoRoot = run('git', ['rev-parse', '--show-toplevel']).trim();
  const git = (args: readonly string[]): string => run('git', args, { cwd: repoRoot }).trim();
  const id = givenId ?? screenshotIdOf(git(['rev-parse', '--abbrev-ref', 'HEAD']));
  const repo = repoOf(git(['remote', 'get-url', 'origin']));
  if (git(['status', '--porcelain']) !== '') {
    warn('コミットしていない変更があります。画像には写りますが、PRには入りません');
  }
  const headCommit = git(['rev-parse', 'HEAD']);
  const outDir = join(tempDir, 'shots');
  captureScreenshots(run, { repoRoot, outDir });
  const { commit, names } = publishScreenshots(run, { repoRoot, id, outDir, indexFile: join(tempDir, 'index') });
  return markdownTable({ repo, commit, id, headCommit, names });
};

/** コマンドを shell を通さずに実行する。git が資格情報を聞いて止まらないようにする */
export const execRun: Run = (command, args, options = {}) => {
  try {
    const output: string | null = execFileSync(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
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
  const warn = (message: string): void => {
    process.stderr.write(`警告：${message}\n`);
  };
  try {
    process.stdout.write(prScreenshots(execRun, { argv: process.argv.slice(2), tempDir, warn }));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
