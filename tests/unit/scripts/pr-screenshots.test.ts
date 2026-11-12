import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { captureAfter, captureBefore, imageRows, listPngs, markdownTable, prScreenshots, publishScreenshots, repoOf, screenshotIdOf, type Run, type RunOptions } from '../../../scripts/pr-screenshots';

// 画面が変わるPRに、before（main）と after（作業ブランチ）のスクリーンショットを載せる。
// 画像は main と履歴を共有しない screenshots ブランチに置き、PR本文から commit の URL で参照する

type Call = { readonly command: string; readonly args: readonly string[]; readonly options: RunOptions };

/** 呼ばれたコマンドを記録し、`responses` の前方一致で出力を返す。`failures` に前方一致したら例外を投げる */
const fakeRun = (responses: Readonly<Record<string, string>> = {}, failures: readonly string[] = []) => {
  const calls: Call[] = [];
  const run: Run = (command, args, options = {}) => {
    calls.push({ command, args, options });
    const line = [command, ...args].join(' ');
    if (failures.some(prefix => line.startsWith(prefix))) {
      if (options.allowFailure) return '';
      throw new Error(`failed: ${line}`);
    }
    const key = Object.keys(responses).find(prefix => line.startsWith(prefix));
    return key === undefined ? '' : (responses[key] ?? '');
  };
  const lines = (): readonly string[] => calls.map(call => [call.command, ...call.args].join(' '));
  return { run, calls, lines };
};

let workDir = '';

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'pr-screenshots-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const writePngs = (dir: string, names: readonly string[]): void => {
  mkdirSync(dir, { recursive: true });
  names.forEach(name => writeFileSync(join(dir, name), name));
};

describe('screenshotIdOf', () => {
  test.each([
    ['feat/T2-03-map-render', 'feat-T2-03-map-render'],
    ['chore/pr-screenshots', 'chore-pr-screenshots'],
    ['fix/a.b_c', 'fix-a.b_c']
  ])('ブランチ名 %s から、screenshots ブランチのディレクトリ名 %s を作る', (branch, expected) => {
    // Act
    const id = screenshotIdOf(branch);

    // Assert
    expect(id).toBe(expected);
  });

  test.each(['main', 'HEAD', '', 'feat/../x', 'feat/a b'])('ブランチ名 %j からは作らない（作業ブランチではない、または安全でない）', branch => {
    // Act・Assert
    expect(() => screenshotIdOf(branch)).toThrow();
  });
});

describe('repoOf', () => {
  test.each([
    ['https://github.com/owner/repo.git', 'owner/repo'],
    ['https://github.com/owner/repo', 'owner/repo'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['ssh://git@github.com/owner/my-repo.git\n', 'owner/my-repo']
  ])('origin の URL %j から owner/repo を取り出す', (url, expected) => {
    // Act
    const repo = repoOf(url);

    // Assert
    expect(repo).toBe(expected);
  });

  test('GitHub ではない URL はエラーにする（画像の URL を作れない）', () => {
    // Act・Assert
    expect(() => repoOf('https://example.com/owner/repo.git')).toThrow();
  });
});

describe('listPngs', () => {
  test('ディレクトリの PNG の名前を並べて返す', () => {
    // Arrange
    const dir = join(workDir, 'shots');
    writePngs(dir, ['b.png', 'a.png', 'note.txt']);

    // Act
    const names = listPngs(dir);

    // Assert
    expect(names).toEqual(['a.png', 'b.png']);
  });

  test('ディレクトリがなければ空にする（before を1枚も撮れなかったとき）', () => {
    // Act
    const names = listPngs(join(workDir, 'missing'));

    // Assert
    expect(names).toEqual([]);
  });
});

describe('imageRows', () => {
  test('before・after の名前を合わせて並べ、片方にしかないものも行にする', () => {
    // Arrange
    const before = new Map([
      ['ja-top-pc.png', 'h1'],
      ['old-pc.png', 'h2']
    ]);
    const after = new Map([
      ['ja-top-pc.png', 'h3'],
      ['ja-panel-pc.png', 'h4']
    ]);

    // Act
    const rows = imageRows(before, after);

    // Assert
    expect(rows).toEqual([
      { name: 'ja-panel-pc.png', hasBefore: false, hasAfter: true, isSame: false },
      { name: 'ja-top-pc.png', hasBefore: true, hasAfter: true, isSame: false },
      { name: 'old-pc.png', hasBefore: true, hasAfter: false, isSame: false }
    ]);
  });

  test('before と after の中身が同じなら isSame にする', () => {
    // Act
    const rows = imageRows(new Map([['ja-top-pc.png', 'h1']]), new Map([['ja-top-pc.png', 'h1']]));

    // Assert
    expect(rows).toEqual([{ name: 'ja-top-pc.png', hasBefore: true, hasAfter: true, isSame: true }]);
  });
});

describe('markdownTable', () => {
  const base = { repo: 'owner/repo', commit: 'abc123', id: 'feat-T2-03-x', baseRef: 'origin/main', baseCommit: 'def4567890' };

  test('画像を commit の URL で埋め込み、before・after を1行に並べる', () => {
    // Act
    const markdown = markdownTable({ ...base, rows: [{ name: 'ja-top-pc.png', hasBefore: true, hasAfter: true, isSame: false }] });

    // Assert
    expect(markdown).toContain('## 画面の変更');
    expect(markdown).toContain('`origin/main`（def4567）');
    expect(markdown).toContain('| 画面 | before | after |');
    expect(markdown).toContain(
      '| ja-top-pc | <img src="https://github.com/owner/repo/blob/abc123/feat-T2-03-x/before/ja-top-pc.png?raw=true" width="360" alt="before：ja-top-pc"> | <img src="https://github.com/owner/repo/blob/abc123/feat-T2-03-x/after/ja-top-pc.png?raw=true" width="360" alt="after：ja-top-pc"> |'
    );
  });

  test('片方にしかない画像は「なし」、同じ画像は「（変化なし）」と書く', () => {
    // Act
    const markdown = markdownTable({
      ...base,
      rows: [
        { name: 'new-pc.png', hasBefore: false, hasAfter: true, isSame: false },
        { name: 'same-pc.png', hasBefore: true, hasAfter: true, isSame: true }
      ]
    });

    // Assert
    expect(markdown).toMatch(/\| new-pc \| なし \| <img /);
    expect(markdown).toMatch(/\| same-pc（変化なし） \| <img /);
  });
});

describe('captureBefore', () => {
  test('base を worktree に取り出し、撮影の設定を今のブランチから写してから撮り、worktree を消す', () => {
    // Arrange
    const repoRoot = join(workDir, 'repo');
    writePngs(join(repoRoot, 'tests/screenshots'), ['pages.spec.ts']);
    writeFileSync(join(repoRoot, 'playwright.screenshots.config.ts'), 'config');
    const worktreeDir = join(workDir, 'base');
    const outDir = join(workDir, 'before');
    const { run, calls, lines } = fakeRun();

    // Act
    captureBefore(run, { repoRoot, baseRef: 'origin/main', worktreeDir, outDir });

    // Assert
    expect(lines()).toEqual([
      `git worktree add --detach ${worktreeDir} origin/main`,
      'pnpm install --frozen-lockfile',
      'pnpm exec playwright test --config playwright.screenshots.config.ts',
      `git worktree remove --force ${worktreeDir}`
    ]);
    expect(readFileSync(join(worktreeDir, 'playwright.screenshots.config.ts'), 'utf8')).toBe('config');
    expect(existsSync(join(worktreeDir, 'tests/screenshots/pages.spec.ts'))).toBe(true);
    // main にまだない画面は撮れないので、撮影の失敗では止めない
    expect(calls[2]?.options).toMatchObject({ cwd: worktreeDir, env: { SCREENSHOT_OUT: outDir }, allowFailure: true });
  });

  test('途中で失敗しても worktree を消す', () => {
    // Arrange
    const repoRoot = join(workDir, 'repo');
    writePngs(join(repoRoot, 'tests/screenshots'), ['pages.spec.ts']);
    writeFileSync(join(repoRoot, 'playwright.screenshots.config.ts'), 'config');
    const worktreeDir = join(workDir, 'base');
    const { run, lines } = fakeRun({}, ['pnpm install']);

    // Act・Assert
    expect(() => captureBefore(run, { repoRoot, baseRef: 'origin/main', worktreeDir, outDir: join(workDir, 'before') })).toThrow();
    expect(lines().at(-1)).toBe(`git worktree remove --force ${worktreeDir}`);
  });
});

describe('captureAfter', () => {
  test('今の作業ツリーで撮る。撮影の失敗は止める', () => {
    // Arrange
    const { run, calls } = fakeRun();

    // Act
    captureAfter(run, { repoRoot: '/repo', outDir: '/out/after' });

    // Assert
    expect(calls).toEqual([
      {
        command: 'pnpm',
        args: ['exec', 'playwright', 'test', '--config', 'playwright.screenshots.config.ts'],
        options: { cwd: '/repo', env: { SCREENSHOT_OUT: '/out/after' }, showOutput: true }
      }
    ]);
  });
});

describe('publishScreenshots', () => {
  const setup = () => {
    const beforeDir = join(workDir, 'before');
    const afterDir = join(workDir, 'after');
    writePngs(beforeDir, ['ja-top-pc.png']);
    writePngs(afterDir, ['ja-top-pc.png']);
    return { beforeDir, afterDir, indexFile: join(workDir, 'index') };
  };

  test('screenshots ブランチがあれば、その上に <id>/ を置き換えた commit を作って push する', () => {
    // Arrange
    const { beforeDir, afterDir, indexFile } = setup();
    const { run, calls, lines } = fakeRun({
      'git rev-parse --verify refs/remotes/origin/screenshots': 'parent1\n',
      'git hash-object': 'blob1\n',
      'git write-tree': 'tree1\n',
      'git commit-tree': 'commit1\n'
    });

    // Act
    const result = publishScreenshots(run, { repoRoot: '/repo', id: 'feat-x', beforeDir, afterDir, indexFile });

    // Assert
    expect(result.commit).toBe('commit1');
    expect(result.before).toEqual(new Map([['ja-top-pc.png', 'blob1']]));
    expect(lines()).toEqual([
      'git fetch origin +refs/heads/screenshots:refs/remotes/origin/screenshots',
      'git rev-parse --verify refs/remotes/origin/screenshots',
      'git read-tree parent1',
      'git rm --cached -r -q --ignore-unmatch -- feat-x',
      `git hash-object -w ${join(beforeDir, 'ja-top-pc.png')}`,
      'git update-index --add --cacheinfo 100644,blob1,feat-x/before/ja-top-pc.png',
      `git hash-object -w ${join(afterDir, 'ja-top-pc.png')}`,
      'git update-index --add --cacheinfo 100644,blob1,feat-x/after/ja-top-pc.png',
      'git write-tree',
      'git commit-tree tree1 -p parent1 -m chore: feat-x のスクリーンショット',
      'git push origin commit1:refs/heads/screenshots'
    ]);
    // 作業ツリーの index を変えないように、一時的な index を使う
    const indexCommands = ['read-tree', 'rm', 'hash-object', 'update-index', 'write-tree', 'commit-tree'];
    const indexCalls = calls.filter(call => indexCommands.includes(call.args[0] ?? ''));
    expect(indexCalls).toHaveLength(8);
    expect(indexCalls.every(call => call.options.env?.GIT_INDEX_FILE === indexFile)).toBe(true);
  });

  test('screenshots ブランチがなければ、親のない commit で作る', () => {
    // Arrange
    const { beforeDir, afterDir, indexFile } = setup();
    const { run, lines } = fakeRun({ 'git write-tree': 'tree1\n', 'git commit-tree': 'commit1\n', 'git hash-object': 'blob1\n' }, ['git fetch', 'git rev-parse']);

    // Act
    publishScreenshots(run, { repoRoot: '/repo', id: 'feat-x', beforeDir, afterDir, indexFile });

    // Assert
    expect(lines()).toContain('git read-tree --empty');
    expect(lines()).toContain('git commit-tree tree1 -m chore: feat-x のスクリーンショット');
  });

  test('after が1枚もなければエラーにする（撮影に失敗している）', () => {
    // Arrange
    const { run } = fakeRun();

    // Act・Assert
    expect(() => publishScreenshots(run, { repoRoot: '/repo', id: 'feat-x', beforeDir: join(workDir, 'x'), afterDir: join(workDir, 'y'), indexFile: join(workDir, 'index') })).toThrow(/after/);
  });
});

describe('prScreenshots', () => {
  test('before・after を撮って push し、PR本文に貼る表を返す', () => {
    // Arrange
    const repoRoot = join(workDir, 'repo');
    writePngs(join(repoRoot, 'tests/screenshots'), ['pages.spec.ts']);
    writeFileSync(join(repoRoot, 'playwright.screenshots.config.ts'), 'config');
    const tempDir = join(workDir, 'tmp');
    // 撮影の代わりに、SCREENSHOT_OUT に画像を置く
    const { run: baseRun, lines } = fakeRun({
      'git rev-parse --show-toplevel': `${repoRoot}\n`,
      'git rev-parse --abbrev-ref HEAD': 'feat/T2-03-map\n',
      'git remote get-url origin': 'https://github.com/owner/repo.git\n',
      'git rev-parse --verify origin/main': 'base1234567\n',
      'git rev-parse --verify refs/remotes/origin/screenshots': 'parent1\n',
      'git hash-object': 'blob1\n',
      'git write-tree': 'tree1\n',
      'git commit-tree': 'commit1\n'
    });
    const run: Run = (command, args, options = {}) => {
      if (args.includes('playwright') && options.env?.SCREENSHOT_OUT) writePngs(options.env.SCREENSHOT_OUT, ['ja-top-pc.png']);
      return baseRun(command, args, options);
    };

    // Act
    const markdown = prScreenshots(run, { argv: [], tempDir });

    // Assert
    expect(lines()).toContain('git fetch origin main');
    expect(markdown).toContain('`origin/main`（base123）');
    expect(markdown).toContain('https://github.com/owner/repo/blob/commit1/feat-T2-03-map/after/ja-top-pc.png?raw=true');
    expect(markdown).toContain('ja-top-pc（変化なし）');
  });

  test('--id と --base で、ディレクトリ名と比べる相手を変えられる', () => {
    // Arrange
    const repoRoot = join(workDir, 'repo');
    writePngs(join(repoRoot, 'tests/screenshots'), ['pages.spec.ts']);
    writeFileSync(join(repoRoot, 'playwright.screenshots.config.ts'), 'config');
    const { run: baseRun, lines } = fakeRun({
      'git rev-parse --show-toplevel': `${repoRoot}\n`,
      'git remote get-url origin': 'https://github.com/owner/repo.git\n',
      'git hash-object': 'blob1\n',
      'git commit-tree': 'commit1\n'
    });
    const run: Run = (command, args, options = {}) => {
      if (args.includes('playwright') && options.env?.SCREENSHOT_OUT?.endsWith('after')) writePngs(options.env.SCREENSHOT_OUT, ['ja-top-pc.png']);
      return baseRun(command, args, options);
    };

    // Act
    const markdown = prScreenshots(run, { argv: ['--id', 'custom', '--base', 'origin/develop'], tempDir: join(workDir, 'tmp') });

    // Assert
    expect(lines()).toContain('git fetch origin develop');
    expect(lines()).not.toContain('git rev-parse --abbrev-ref HEAD');
    expect(markdown).toContain('/custom/after/ja-top-pc.png');
    expect(markdown).toMatch(/\| ja-top-pc \| なし \| <img /);
  });

  test('--base が origin/<ブランチ> の形でなければエラーにする', () => {
    // Arrange
    const { run } = fakeRun();

    // Act・Assert
    expect(() => prScreenshots(run, { argv: ['--base', 'main'], tempDir: join(workDir, 'tmp') })).toThrow(/origin\//);
  });

  test('--id が安全でなければエラーにする', () => {
    // Arrange
    const { run } = fakeRun();

    // Act・Assert
    expect(() => prScreenshots(run, { argv: ['--id', '../x'], tempDir: join(workDir, 'tmp') })).toThrow();
  });
});
