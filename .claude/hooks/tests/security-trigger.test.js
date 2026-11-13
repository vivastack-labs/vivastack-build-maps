'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, PATTERNS, buildFlaggedList, addedLines, isExcludedPath, markReviewed } = require('../scripts/security-trigger');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

// --- PATTERNS ---

test('PATTERNS: matches auth-related filenames', () => {
  assert.ok(PATTERNS.test('auth-middleware.js'));
  assert.ok(PATTERNS.test('login-handler.ts'));
  assert.ok(PATTERNS.test('logout.controller.ts'));
  assert.ok(PATTERNS.test('session-store.js'));
  assert.ok(PATTERNS.test('token-service.ts'));
});

test('PATTERNS: matches sensitive content', () => {
  assert.ok(PATTERNS.test('const apiKey = process.env.KEY'));
  assert.ok(PATTERNS.test('ANTHROPIC_API_KEY'));
  assert.ok(PATTERNS.test('bcrypt.hash(password, 10)'));
  assert.ok(PATTERNS.test('jwt.sign(payload, secret)'));
  assert.ok(PATTERNS.test('crypto.createHash("sha256")'));
  assert.ok(PATTERNS.test('axios.get(url)'));
});

test('PATTERNS: matches database and HTTP queries', () => {
  assert.ok(PATTERNS.test('db.query("SELECT * FROM users WHERE id = " + id)'));
  assert.ok(PATTERNS.test('const query = `SELECT * FROM t`'));
  assert.ok(PATTERNS.test('const params = new URLSearchParams(req.query)'));
  assert.ok(PATTERNS.test('query-builder.ts'));
});

// issue #33: DOM を調べるテストのコードは、DB や HTTP のクエリではない
test('PATTERNS: does not match DOM and Testing Library query APIs', () => {
  assert.ok(!PATTERNS.test("container.querySelector('h1')"));
  assert.ok(!PATTERNS.test("document.querySelectorAll('[data-area]')"));
  assert.ok(!PATTERNS.test("screen.queryByRole('banner')"));
  assert.ok(!PATTERNS.test("screen.queryAllByText('地図')"));
});

test('buildFlaggedList: does not flag component tests that only use DOM queries (issue #33)', () => {
  const diff = "+  const heading = container.querySelector('h1');\n+  expect(screen.queryByRole('navigation')).toBeNull();";
  assert.deepEqual(
    buildFlaggedList(['tests/unit/components/Header.test.tsx'], () => diff),
    []
  );
});

// 本プロジェクトに DB はない。content/schema/ の JSON Schema や、author の欄はセキュリティに関わらない
test('PATTERNS: does not match schema or author, but still matches auth and authorization', () => {
  assert.ok(!PATTERNS.test('content/schema/prefecture.schema.json'));
  assert.ok(!PATTERNS.test('src/lib/content-schema.ts'));
  assert.ok(!PATTERNS.test('"author": "someone"'));
  assert.ok(!PATTERNS.test('authored by'));
  assert.ok(PATTERNS.test('authorization: Bearer x'));
  assert.ok(PATTERNS.test('authorize(user)'));
  assert.ok(PATTERNS.test('src/auth.ts'));
});

test('PATTERNS: does not match common non-sensitive names', () => {
  assert.ok(!PATTERNS.test('index.js'));
  assert.ok(!PATTERNS.test('README.md'));
  assert.ok(!PATTERNS.test('package.json'));
  assert.ok(!PATTERNS.test('tsconfig.json'));
});

// --- buildFlaggedList ---

test('buildFlaggedList: flags file matching pattern in filename', () => {
  const flagged = buildFlaggedList(['auth.js'], () => '');
  assert.equal(flagged.length, 1);
  assert.ok(flagged[0].includes('auth.js'));
  assert.ok(flagged[0].includes('[filename]'));
});

test('buildFlaggedList: skips diff call when filename already matched', () => {
  let called = false;
  buildFlaggedList(['auth.js'], () => {
    called = true;
    return '';
  });
  assert.equal(called, false);
});

test('buildFlaggedList: flags file whose diff content matches pattern', () => {
  const flagged = buildFlaggedList(['index.js'], () => '+const token = jwt.sign(data, secret)');
  assert.equal(flagged.length, 1);
  assert.ok(flagged[0].includes('index.js'));
  assert.ok(flagged[0].includes('[content]'));
});

test('buildFlaggedList: returns empty for safe files', () => {
  const flagged = buildFlaggedList(['index.js', 'utils.ts'], () => 'const x = 1;');
  assert.equal(flagged.length, 0);
});

test('buildFlaggedList: handles empty file list', () => {
  assert.deepEqual(
    buildFlaggedList([], () => ''),
    []
  );
});

test('addedLines: keeps only added lines of a diff (context and removed lines are not checked)', () => {
  const diff = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1,3 +1,3 @@', ' const token = old;', '-const secret = 1;', '+const value = 2;'].join('\n');
  assert.equal(addedLines(diff), '+const value = 2;');
});

test('buildFlaggedList: does not flag sensitive words only in context or removed lines', () => {
  const diff = ' const token = getToken();\n-const apiKey = x;\n+const count = 1;';
  assert.deepEqual(
    buildFlaggedList(['src/x.ts'], () => diff),
    []
  );
});

test('isExcludedPath: skips tests, Markdown, generated files and the lockfile', () => {
  for (const file of [
    'tests/unit/lib/session.test.ts',
    'src/lib/token.test.ts',
    'tests/e2e/login.spec.ts',
    '.claude/hooks/tests/security-trigger.test.js',
    'docs/development-overview.md',
    'src/lib/content-schema.generated.ts',
    'pnpm-lock.yaml'
  ]) {
    assert.ok(isExcludedPath(file), file);
  }
  for (const file of ['src/features/map/load.ts', 'scripts/postbuild.ts', '.claude/hooks/scripts/security-trigger.js']) {
    assert.ok(!isExcludedPath(file), file);
  }
});

test('buildFlaggedList: skips excluded paths even when the filename or content matches', () => {
  let called = false;
  const flagged = buildFlaggedList(['tests/unit/auth.test.ts', 'docs/session.md'], () => {
    called = true;
    return '+token';
  });
  assert.deepEqual(flagged, []);
  assert.equal(called, false);
});

// --- run() ---

test('run: non-git command → pass', async () => {
  assertAllowed(await run({ tool_input: { command: 'npm test' } }));
  assertAllowed(await run({ tool_input: { command: 'ls -la' } }));
});

test('run: git status/pull/log → pass', async () => {
  assertAllowed(await run({ tool_input: { command: 'git status' } }));
  assertAllowed(await run({ tool_input: { command: 'git pull origin main' } }));
  assertAllowed(await run({ tool_input: { command: 'git log --oneline' } }));
});

test('run: SECURITY_REVIEWED=1 bypasses check', async () => {
  process.env.SECURITY_REVIEWED = '1';
  assertAllowed(await run({ tool_input: { command: 'git commit -m "test"' } }));
  delete process.env.SECURITY_REVIEWED;
});

test('run: null/empty/missing input → pass', async () => {
  assertAllowed(await run(null));
  assertAllowed(await run({}));
  assertAllowed(await run(undefined));
});

// --- run() と markReviewed()：実際の git リポジトリで確かめる ---

function withRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-trigger-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(dir, 'README.md'), 'readme\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  };
  return Promise.resolve(fn({ dir, git, write })).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

const commitInput = command => ({ tool_input: { command } });
const NO_ENV = {};

test('run: blocks git commit when staged added lines contain a sensitive word', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'export const load = () => fetch("/geo/muni/01.topo.json");\n');
    git('add', '.');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
    assert.match(result.reason, /src\/load\.ts/);
    assert.match(result.reason, /mark-security-reviewed\.js/);
  }));

test('run: does not check git push (the staged files are not what is pushed)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    assertAllowed(await run(commitInput('git push origin main'), { cwd: dir, env: NO_ENV }));
  }));

test('run: checks git commit chained after another command (issue #36)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    const result = await run(commitInput('cat > msg <<EOF && git commit -F msg'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('run: with git add in the same command, checks unstaged and untracked files and asks to split the command', () =>
  withRepo(async ({ dir, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    const result = await run(commitInput('git add . && git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
    assert.match(result.reason, /src\/load\.ts/);
    assert.match(result.reason, /git add/);
  }));

test('run: git commit -a checks unstaged changes of tracked files', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'export const x = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'add');
    write('src/load.ts', 'export const x = fetch(y);\n');
    const result = await run(commitInput('git commit -am x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('run: allows commits whose sensitive words are only in tests or docs', () =>
  withRepo(async ({ dir, git, write }) => {
    write('tests/unit/header.test.tsx', "container.querySelector('h1'); const token = 1;\n");
    write('docs/notes.md', 'session token\n');
    git('add', '.');
    assertAllowed(await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV }));
  }));

test('run: after markReviewed, allows the same staged changes, and blocks again when they change', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    assertAllowed(await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV }));

    write('src/load.ts', 'fetch(x)\nconst token = 1;\n');
    git('add', '.');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('run: the review mark does not count when git add runs in the same command', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    write('src/other.ts', 'const secret = 1;\n');
    const result = await run(commitInput('git add . && git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('markReviewed: fails when nothing is staged', () =>
  withRepo(({ dir }) => {
    assert.throws(() => markReviewed(dir), /ステージ/);
  }));

test('mark-security-reviewed.js: marks the staged changes from the command line', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    const script = path.join(__dirname, '../scripts/mark-security-reviewed.js');
    const output = execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    assert.match(output, /git commit/);
    assertAllowed(await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV }));
  }));

// --- レビューの指摘 ---

test('run: checks files with non-ASCII names (MEDIUM-3)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/認証.ts', 'export const x = 1;\n');
    write('src/地図.ts', 'export const load = () => fetch(url);\n');
    git('add', '.');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
    assert.match(result.reason, /src\/地図\.ts/);
  }));

test('run: blocks when a file cannot be read instead of passing silently (MEDIUM-4)', () => {
  const flagged = buildFlaggedList(['src/x.ts'], () => {
    throw new Error('git error');
  });
  assert.deepEqual(flagged, ['  - src/x.ts  [読めなかった]']);
});

test('run: other git commands that change the index before commit also check unstaged changes (MEDIUM-5)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    write('src/other.ts', 'const secret = 1;\n');
    for (const command of ['git checkout main -- src/other.ts && git commit -m x', 'git restore --staged . && git commit -m x', 'git stash pop && git commit -m x']) {
      const result = await run(commitInput(command), { cwd: dir, env: NO_ENV });
      assert.equal(result?.decision, 'block', command);
    }
    // 読むだけの git は、記録した内容のまま通す
    assertAllowed(await run(commitInput('git status && git diff --cached && git commit -m x'), { cwd: dir, env: NO_ENV }));
  }));

test('run: checks the second git commit of a command (MEDIUM-6)', () =>
  withRepo(async ({ dir, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    const result = await run(commitInput('git commit -m a; git add . && git commit -m b'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('run: checks the repository the commit runs in, after cd or git -C (MEDIUM-6)', () =>
  withRepo(async ({ dir }) =>
    withRepo(async ({ dir: inner, git, write }) => {
      write('src/load.ts', 'fetch(x)\n');
      git('add', '.');
      for (const command of [`cd ${inner} && git commit -m x`, `git -C ${inner} commit -m x`]) {
        const result = await run(commitInput(command), { cwd: dir, env: NO_ENV });
        assert.equal(result?.decision, 'block', command);
      }
    })
  ));

test('run: ignores git commit written inside a heredoc body', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    assertAllowed(await run(commitInput("cat > notes.txt <<'EOF'\ngit commit -m x\nEOF"), { cwd: dir, env: NO_ENV }));
  }));

// --- security-reviewer の指摘 ---

test('addedLines: keeps added lines that start with ++ and skips only the file headers', () => {
  const diff = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -0,0 +1,2 @@', '++password = 1', '+++token'].join('\n');
  assert.equal(addedLines(diff), '++password = 1\n+++token');
});

test('isExcludedPath: excludes only top-level tests and known generated files', () => {
  for (const file of ['src/test/auth.ts', 'src/auth.generated.ts', 'geo/tests-data/token.ts']) {
    assert.ok(!isExcludedPath(file), file);
  }
});

test('run: checks deleted files by name, files starting with a colon, and colored diffs', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/session.ts', 'export const x = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'add');
    git('config', 'color.ui', 'always');
    git('rm', '-q', 'src/session.ts');
    write(':weird.ts', 'const token = 1;\n');
    write('src/colored.ts', 'const apiKey = 1;\n');
    git('add', '.');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
    for (const file of ['src/session.ts', ':weird.ts', 'src/colored.ts']) assert.ok(result.reason.includes(file), file);
  }));

test('run: checks the whole repository from a subdirectory, using the cwd given in the hook input', () =>
  withRepo(async ({ dir, git, write }) => {
    write('control.ts', 'const token = 1;\n');
    write('sub/a.txt', 'a\n');
    git('add', '.');
    const result = await run({ cwd: path.join(dir, 'sub'), tool_input: { command: 'git commit -m x' } }, { env: NO_ENV });
    assert.equal(result?.decision, 'block');
    assert.match(result.reason, /control\.ts/);
  }));

test('run: redirections after git commit do not count as paths, so the review mark still works', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    assertAllowed(await run(commitInput('git commit -m x 2>&1 | tail -3'), { cwd: dir, env: NO_ENV }));
  }));

test('run: the review mark is tied to HEAD, so it does not pass after HEAD moves', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    git('stash', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'other');
    git('stash', 'pop', '-q');
    git('add', '.');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
  }));

test('run: blocks commits with GIT_INDEX_FILE or GIT_DIR, and abbreviated options that commit unstaged changes', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    write('src/other.ts', 'const secret = 1;\n');
    for (const command of ['GIT_INDEX_FILE=/tmp/i git commit -m x', 'GIT_DIR=../x/.git git commit -m x', 'git commit --inc src/other.ts -m x', 'git commit --pathspec-from-file=list -m x']) {
      const result = await run(commitInput(command), { cwd: dir, env: NO_ENV });
      assert.equal(result?.decision, 'block', command);
    }
  }));

// --- 2回目のレビューの指摘 ---

test('run: skips untracked nested repositories and checks symlink targets instead of failing (MEDIUM-B)', () =>
  withRepo(async ({ dir, write }) => {
    fs.mkdirSync(path.join(dir, 'nested'));
    execFileSync('git', ['init', '-q'], { cwd: path.join(dir, 'nested') });
    fs.writeFileSync(path.join(dir, 'nested', 'x.txt'), 'x\n');
    fs.mkdirSync(path.join(dir, 'real'));
    fs.symlinkSync('real', path.join(dir, 'link'));
    write('c.txt', 'c\n');
    assertAllowed(await run(commitInput('git add c.txt && git commit -m x'), { cwd: dir, env: NO_ENV }));
  }));

test('markReviewed: works in a repository without commits (MEDIUM-C)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-trigger-nohead-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'load.ts'), 'fetch(x)\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    markReviewed(dir);
    return run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV }).then(assertAllowed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run: passes when the commit runs outside a repository (MEDIUM-D)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-trigger-nogit-'));
  try {
    assertAllowed(await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV }));
    assertAllowed(await run(commitInput('mkdir -p new && cd new && git init && git commit -m x'), { cwd: dir, env: NO_ENV }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run: blocks when git fails inside a repository (broken index)', () =>
  withRepo(async ({ dir }) => {
    fs.writeFileSync(path.join(dir, '.git', 'index'), 'broken');
    const result = await run(commitInput('git commit -m x'), { cwd: dir, env: NO_ENV });
    assert.equal(result?.decision, 'block');
    assert.match(result.reason, /確かめられません/);
  }));

test('run: blocks commits with --git-dir or --work-tree, whose repository is unknown (LOW-2)', () =>
  withRepo(async ({ dir }) => {
    for (const command of ['git --git-dir=../r/.git commit -m x', 'git --work-tree ../r commit -m x']) {
      const result = await run(commitInput(command), { cwd: dir, env: NO_ENV });
      assert.equal(result?.decision, 'block', command);
    }
  }));

// 3回目のセキュリティレビュー（N1・N2）：cd が失敗しても ; や || の後ろは元の場所で動き、
// cd の行き先が変数・置換なら分からない。どちらも元の作業ディレクトリのリポジトリを必ず調べる
test('run: always checks the repository of the working directory, even after a failed or unknown cd (N1, N2)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    for (const command of [
      'cd /nonexistent; git commit -m x',
      'cd /nonexistent || true; git commit -m x',
      'cd $(git rev-parse --show-toplevel) && git commit -m x',
      'cd "$PROJ" && git commit -m x',
      'cd - && git commit -m x',
      `cd ${os.tmpdir()} && git commit -m x`
    ]) {
      const result = await run(commitInput(command), { cwd: dir, env: NO_ENV });
      assert.equal(result?.decision, 'block', command);
    }
  }));

test('run: more read-only git commands before commit keep the review mark (LOW-3)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    assertAllowed(await run(commitInput('git rev-list HEAD && git config user.name && git merge-base HEAD HEAD && git commit -m x'), { cwd: dir, env: NO_ENV }));
  }));

test('run: a command substitution in the arguments is not a path, so the review mark still works (security review, 4th)', () =>
  withRepo(async ({ dir, git, write }) => {
    write('src/load.ts', 'fetch(x)\n');
    git('add', '.');
    markReviewed(dir);
    assertAllowed(await run(commitInput('git commit -m x $(echo)'), { cwd: dir, env: NO_ENV }));
  }));
