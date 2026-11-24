'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, scanCommands } = require('../scripts/gitleaks');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

const spawnPass = () => ({ status: 0, error: null, stderr: '' });
const spawnFail = () => ({ status: 77, error: null, stderr: 'leak found' }); // --exit-code 77
const spawnConfigError = () => ({ status: 1, error: null, stderr: 'FTL unable to load gitleaks config' });
const spawnNotFound = () => ({ status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), stderr: '' });
const spawnTimedOut = () => ({ status: null, error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), stderr: '' });
const spawnUnknownFlag = () => ({ status: 1, error: null, stderr: 'unknown flag: --quiet' });

/**
 * 呼ばれた gitleaks の引数を calls に記録する spawn（git の呼び出しは all にだけ記録し、成功させる）
 */
function recordingSpawn(result = spawnPass) {
  const calls = [];
  const all = [];
  const spawn = (cmd, args, options) => {
    all.push({ cmd, args, options });
    if (cmd !== 'gitleaks') return { status: 0, error: null, stdout: '', stderr: '' };
    calls.push({ cmd, args, options });
    return result();
  };
  return { spawn, calls, all };
}

const usesTempIndex = call => Boolean(call.options.env?.GIT_INDEX_FILE);

test('gitleaks: non-git command passes without scanning', async () => {
  const { spawn, calls } = recordingSpawn(spawnFail);
  assertAllowed(await run({ tool_input: { command: 'ls -la' } }, spawn));
  assert.equal(calls.length, 0);
});

test('gitleaks: git status passes without scanning', async () => {
  assertAllowed(await run({ tool_input: { command: 'git status' } }, spawnFail));
});

test('gitleaks: git pull passes without scanning', async () => {
  assertAllowed(await run({ tool_input: { command: 'git pull origin main' } }, spawnFail));
});

test('gitleaks: git commit — no secrets found → pass', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "feat: add feature"' } }, spawnPass));
});

test('gitleaks: git commit — secrets found → block', async () => {
  const result = await run({ tool_input: { command: 'git commit -m "wip"' } }, spawnFail);
  assert.equal(result.decision, 'block');
  assert.ok(result.reason.includes('gitleaks'));
});

test('gitleaks: git push — secrets found → block', async () => {
  const result = await run({ tool_input: { command: 'git push origin main' } }, spawnFail);
  assert.equal(result.decision, 'block');
});

test('gitleaks: chained git commit after git add is scanned', async () => {
  const result = await run({ tool_input: { command: 'git add a.txt && git commit -m "wip"' } }, recordingSpawn(spawnFail).spawn);
  assert.equal(result.decision, 'block');
});

test('gitleaks: plain git commit scans only the real staged diff, never the whole tree', async () => {
  const { spawn, calls, all } = recordingSpawn();
  await run({ tool_input: { command: 'git commit -m "wip"' } }, spawn);
  assert.equal(calls.length, 1, 'コミットしない未ステージの変更は見ない');
  assert.equal(calls[0].args[0], 'protect');
  assert.ok(calls[0].args.includes('--staged'));
  assert.ok(!usesTempIndex(calls[0]));
  assert.ok(!calls[0].args.includes('--no-git'), '作業ツリー全体（node_modules を含む）を読まない');
  assert.ok(!all.some(call => call.cmd === 'git' && call.args[0] === 'add'));
});

for (const command of [
  'git commit -am "wip"',
  'git commit -a -m wip',
  'git commit --all -m wip',
  'git commit -m wip src/a.ts',
  'git commit -m wip -- src/a.ts',
  'git add -A && git commit -m wip',
  'git add new.ts; git commit -m wip',
  'git rm -q old.ts && git commit -m wip'
]) {
  test(`gitleaks: ${command} scans what git add -A would stage, on a temporary index`, async () => {
    const { spawn, calls, all } = recordingSpawn();
    await run({ tool_input: { command } }, spawn);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes('--staged'));
    assert.ok(usesTempIndex(calls[0]), '本物のインデックスは変えない');
    const add = all.find(call => call.cmd === 'git' && call.args.includes('add'));
    assert.deepEqual(add?.args.slice(-2), ['add', '-A'], 'まだ追跡していないファイルも入れる');
    assert.equal(add.options.env.GIT_INDEX_FILE, calls[0].options.env.GIT_INDEX_FILE);
    assert.deepEqual(add.args.slice(0, 2), ['-c', 'core.fsmonitor=false'], 'リポジトリの設定のコマンドを動かさない');
  });
}

for (const [command, expected] of [
  ['git add -f .env && git commit -m wip', ['.env']],
  ['git add --force config/secret.json a.ts && git commit -m wip', ['config/secret.json', 'a.ts']],
  ['git add -fv -- .env && git commit -m wip', ['.env']],
  ['git add -f -A && git commit -m wip', [':/']],
  ['git add -fA && git commit -m wip', [':/']],
  ['git add --force --all && git commit -m wip', [':/']]
]) {
  test(`gitleaks: ${command} also force-adds the named ignored paths to the temporary index`, async () => {
    const { spawn, calls, all } = recordingSpawn();
    await run({ cwd: '/repo', tool_input: { command } }, spawn);
    const forced = all.find(call => call.cmd === 'git' && call.args.includes('-f') && call.args.includes('--'));
    assert.deepEqual(forced?.args.slice(forced.args.indexOf('--') + 1), expected);
    assert.equal(forced.options.env.GIT_INDEX_FILE, calls[0].options.env.GIT_INDEX_FILE);
  });
}

test('gitleaks: block reason for a temporary-index scan reproduces git add -A and git add -f without touching the real index', async () => {
  const result = await run({ cwd: '/repo', tool_input: { command: "git add -f '.env local' && git commit -m wip" } }, recordingSpawn(spawnFail).spawn);
  assert.match(result.reason, /GIT_INDEX_FILE="\$idx" git add -A && GIT_INDEX_FILE="\$idx" git add -f -- '\.env local' && GIT_INDEX_FILE="\$idx" gitleaks protect --staged/);
  assert.match(result.reason, /rm -f "\$idx"$/);
});

test('gitleaks: if git add -f on the temporary index fails, the scan still runs on what was added', async () => {
  const spawn = (cmd, args) => {
    if (cmd === 'gitleaks') return spawnFail();
    if (args.includes('-f')) return { status: 128, error: null, stdout: '', stderr: 'pathspec did not match' };
    return { status: 0, error: null, stdout: '', stderr: '' };
  };
  const result = await run({ tool_input: { command: 'git add -f missing.env && git commit -m wip' } }, spawn);
  assert.equal(result?.decision, 'block');
});

test('gitleaks: every gitleaks run disables core.fsmonitor through command-scope config', async () => {
  const { spawn, calls } = recordingSpawn();
  await run({ tool_input: { command: 'git commit -m wip && git push' } }, spawn);
  await run({ tool_input: { command: 'git commit -am wip' } }, spawn);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.options.env?.GIT_CONFIG_COUNT, '1');
    assert.equal(call.options.env.GIT_CONFIG_KEY_0, 'core.fsmonitor');
    assert.equal(call.options.env.GIT_CONFIG_VALUE_0, 'false');
  }
});

test('gitleaks: git add without -f does not force-add anything', async () => {
  const { spawn, all } = recordingSpawn();
  await run({ tool_input: { command: 'git add .env && git commit -m wip' } }, spawn);
  assert.ok(!all.some(call => call.cmd === 'git' && call.args.includes('-f')));
});

test('gitleaks: read-only git calls before a commit do not switch to the temporary index', async () => {
  const { spawn, calls } = recordingSpawn();
  await run({ tool_input: { command: 'git status && git diff --cached && git commit -m wip' } }, spawn);
  assert.equal(calls.length, 1);
  assert.ok(!usesTempIndex(calls[0]));
});

test('gitleaks: if git add on the temporary index fails → pass with a warning', async () => {
  const spawn = (cmd, args) => (cmd === 'git' && args[0] === 'add' ? { status: 128, error: null, stdout: '', stderr: 'fatal' } : spawnFail());
  assertAllowed(await run({ tool_input: { command: 'git commit -am wip' } }, spawn));
});

test('gitleaks: git push scans unpushed commits on every local ref, not only HEAD', async () => {
  const { spawn, calls } = recordingSpawn();
  await run({ tool_input: { command: 'git push -u origin feat/x' } }, spawn);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], 'detect');
  assert.ok(calls[0].args.includes('--log-opts=--all --not --remotes'), 'git push origin <別のブランチ>・--all・--tags も送られる');
  assert.ok(!calls[0].args.includes('--no-git'));
});

test('gitleaks: every scan has a timeout below the hook timeout', async () => {
  const { spawn, calls } = recordingSpawn();
  await run({ tool_input: { command: 'git commit -am "wip" && git push' } }, spawn);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.timeout > 0 && call.options.timeout < 10_000));
});

test('gitleaks: all scans share one time budget below the hook timeout', async () => {
  // 各検査が渡された timeout をすべて使う（打ち切られる）時計
  let now = 0;
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push(options.timeout);
    now += options.timeout;
    return spawnTimedOut();
  };
  assertAllowed(await run({ tool_input: { command: 'git commit -am "wip" && git push' } }, spawn, () => now));
  assert.ok(calls.reduce((sum, t) => sum + t, 0) < 10_000, `合計 ${calls.join('+')} が hook の timeout を超えない`);
});

test('gitleaks: block reason keeps --redact and quotes arguments so it can be pasted', async () => {
  const result = await run({ tool_input: { command: 'git push' } }, spawnFail);
  assert.match(result.reason, /--redact/, '詳細のコマンドが秘密を平文で出さない');
  assert.match(result.reason, /'--log-opts=--all --not --remotes'/);
});

test('gitleaks: block reason changes to the scanned directory first', async () => {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = '/work/my repo';
    const result = await run({ tool_input: { command: 'git push' } }, spawnFail);
    assert.match(result.reason, /cd -- '\/work\/my repo' && gitleaks detect/, '-s . はこのディレクトリを指す');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
});

test('gitleaks: a non-leak failure (config error, unknown command) → pass with a warning, not a false leak', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "wip"' } }, spawnConfigError));
  assertAllowed(await run({ tool_input: { command: 'git push' } }, spawnConfigError));
});

test('gitleaks: gitleaks not installed → pass gracefully', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "test"' } }, spawnNotFound));
});

test('gitleaks: scan timed out → pass with a warning (CI scans the full history)', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "test"' } }, spawnTimedOut));
});

test('gitleaks: unknown flag in stderr → skip gracefully (version mismatch)', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "wip"' } }, spawnUnknownFlag));
});

test('gitleaks: null/empty/missing input → pass', async () => {
  assertAllowed(await run(null, spawnFail));
  assertAllowed(await run({}, spawnFail));
  assertAllowed(await run(undefined, spawnFail));
});

test('scanCommands: no scans for commands without commit or push', () => {
  assert.deepEqual(scanCommands('git status && ls', '/repo/.gitleaks.toml'), []);
});

test('scanCommands: passes the config file to every scan', () => {
  const scans = scanCommands('git commit -m x; git push', '/repo/.gitleaks.toml');
  assert.ok(scans.every(scan => scan.args.includes('-c') && scan.args.includes('/repo/.gitleaks.toml')));
});

test('scanCommands: without a config file, uses gitleaks default rules (no -c)', () => {
  const scans = scanCommands('git commit -m x; git push', null);
  assert.equal(scans.length, 2);
  assert.ok(scans.every(scan => !scan.args.includes('-c')));
});

test('scanCommands: every scan sets a dedicated exit code for leaks', () => {
  const scans = scanCommands('git commit -am x; git push', '/repo/.gitleaks.toml');
  assert.equal(scans.length, 2);
  assert.ok(scans.every(scan => scan.args.join(' ').includes('--exit-code 77')));
  assert.deepEqual(scans.map(scan => scan.withWorkingTree), [true, false]);
});

test('run: scans CLAUDE_PROJECT_DIR (falls back to input.cwd)', async () => {
  const cwds = [];
  const spy = (cmd, args, opts) => {
    cwds.push(opts.cwd);
    return { status: 0, error: null, stderr: '' };
  };
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = '/project-dir';
    await run({ cwd: '/input-cwd', tool_input: { command: 'git push' } }, spy);
    delete process.env.CLAUDE_PROJECT_DIR;
    await run({ cwd: '/input-cwd', tool_input: { command: 'git push' } }, spy);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
  assert.deepEqual(cwds, ['/project-dir', '/input-cwd']);
});

// --- Repository config (.gitleaks.toml) against the real gitleaks binary ----

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const HAS_GITLEAKS = !spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).error;
const SKIP = !HAS_GITLEAKS && 'gitleaks not installed';
// Built at runtime so this file itself never contains a token-shaped literal.
const FAKE_TOKEN = ['ghp', '_', '1234567890abcdefghij', 'ABCDEFGHIJ123456'].join('');

/**
 * 一時の git リポジトリ（祖先に ancestor のディレクトリ）にリポジトリの .gitleaks.toml を写し、
 * relPath にトークンを書いて step まで進め、実物の gitleaks で run() する。
 * step：'staged'・'unstaged'・'committed'・'other-branch'（別のブランチにコミットして、元のブランチに戻る）・'pushed'（コミットしてリモートに push 済み）・
 * 'untracked'（relPath にはトークンを書かず、まだ追跡していない untracked-leak.ts に書く）・
 * 'ignored'（.gitignore で無視する .env にトークンを書く）
 * afterRun：run() の後、片付けの前に、一時のリポジトリの git を受け取って呼ばれる
 * withConfig：false ならリポジトリの .gitleaks.toml を写さない
 * beforeRun：run() の前に、一時のリポジトリの git と root を受け取って呼ばれる
 */
async function scanProject(relPath, { ancestor = 'any', step = 'staged', command = 'git commit -m x', afterRun, beforeRun, withConfig = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-gitleaks-'));
  const root = path.join(tmp, ancestor, 'proj');
  const git = args => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'ignore' });
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
    git(['init', '-q']);
    if (step === 'ignored') fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
    if (withConfig) fs.copyFileSync(path.join(REPO_ROOT, '.gitleaks.toml'), path.join(root, '.gitleaks.toml'));
    fs.writeFileSync(path.join(root, relPath), 'const token = "";\n');
    git(['add', '-f', '.']);
    git(['commit', '-q', '-m', 'init']);
    if (step === 'untracked') fs.writeFileSync(path.join(root, 'untracked-leak.ts'), `const token = "${FAKE_TOKEN}";\n`);
    else if (step === 'ignored') fs.writeFileSync(path.join(root, '.env'), `TOKEN=${FAKE_TOKEN}\n`);
    else fs.writeFileSync(path.join(root, relPath), `const token = "${FAKE_TOKEN}";\n`);
    if (step === 'other-branch') git(['checkout', '-q', '-b', 'leaky']);
    if (!['unstaged', 'untracked', 'ignored'].includes(step)) git(['add', '-f', relPath]);
    if (step === 'committed' || step === 'other-branch' || step === 'pushed') git(['commit', '-q', '-m', 'leak']);
    if (step === 'other-branch') git(['checkout', '-q', '-']);
    if (step === 'pushed') {
      execFileSync('git', ['init', '-q', '--bare', path.join(tmp, 'remote.git')], { stdio: 'ignore' });
      git(['remote', 'add', 'origin', path.join(tmp, 'remote.git')]);
      git(['push', '-q', 'origin', 'HEAD']);
    }
    delete process.env.CLAUDE_PROJECT_DIR;
    if (beforeRun) beforeRun(git, root);
    const result = await run({ cwd: root, tool_input: { command } });
    if (afterRun) afterRun(args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }));
    return result;
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const assertBlocked = result => assert.equal(result?.decision, 'block');

// 設定の読み込みエラーでも gitleaks は 0 以外で終わり、run() は block を返す。
// block のテストだけでは「検出した」と「設定が壊れている」を区別できないため、設定そのものを読ませて確かめる。
test('.gitleaks.toml: the repository config loads without a fatal error', { skip: SKIP }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-gitleaks-config-'));
  try {
    const result = spawnSync('gitleaks', ['detect', '--no-git', '--no-banner', '-s', tmp, '-c', path.join(REPO_ROOT, '.gitleaks.toml')], { encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /FTL/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('real gitleaks: a staged token in src/ blocks git commit', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts'));
});

test('real gitleaks: an unstaged token blocks git commit (covers commit -a)', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'unstaged', command: 'git commit -am x' }));
});

test('real gitleaks: an unpushed commit with a token blocks git push', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'committed', command: 'git push -u origin feat/x' }));
});

test('real gitleaks: a new untracked file with a token blocks git add -A && git commit, without touching the real index', { skip: SKIP }, async () => {
  let staged;
  const result = await scanProject('src/leak.ts', {
    step: 'untracked',
    command: 'git add -A && git commit -m x',
    afterRun: git => {
      staged = git(['diff', '--cached', '--name-only']);
    }
  });
  assertBlocked(result);
  assert.equal(staged, '', '本物のインデックスに何も入っていない');
});

test('real gitleaks: an ignored file with a token blocks git add -f .env && git commit', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/a.ts', { step: 'ignored', command: 'git add -f .env && git commit -m x' }));
});

test('real gitleaks: an ignored file with a token blocks git add -f -A && git commit', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/a.ts', { step: 'ignored', command: 'git add -f -A && git commit -m x' }));
});

test('real gitleaks: an ignored file that is not force-added does not block git add -A && git commit', { skip: SKIP }, async () => {
  assertAllowed(await scanProject('src/a.ts', { step: 'ignored', command: 'git add -A && git commit -m x' }));
});

for (const command of ['git commit -m x', 'git add -A && git commit -m x', 'git push']) {
  test(`real gitleaks: ${command} does not run the repository's core.fsmonitor command`, { skip: SKIP }, async () => {
    let marker;
    await scanProject('src/leak.ts', {
      step: 'committed',
      command,
      beforeRun: (git, root) => {
        marker = path.join(root, '..', 'fsmonitor-ran');
        git(['config', 'core.fsmonitor', `touch ${marker}`]);
      },
      afterRun: () => {
        assert.equal(fs.existsSync(marker), false, 'hook の中でリポジトリの設定のコマンドが動いた');
      }
    });
  });
}

test('real gitleaks: without .gitleaks.toml, the default rules still block a token', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { withConfig: false }));
});

test('real gitleaks: an unstaged token does not block a plain git commit (it is not committed)', { skip: SKIP }, async () => {
  assertAllowed(await scanProject('src/leak.ts', { step: 'unstaged', command: 'git commit -m x' }));
});

test('real gitleaks: a token only in commits already on the remote does not block git push', { skip: SKIP }, async () => {
  assertAllowed(await scanProject('src/leak.ts', { step: 'pushed', command: 'git push' }));
});

test('real gitleaks: a token only on a branch other than HEAD blocks git push', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'other-branch', command: 'git push origin leaky' }));
});

test('.gitleaks.toml: an ancestor dir named dist/ does not disable scanning', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { ancestor: 'dist' }));
});

test('.gitleaks.toml: nested dirs named out/ or dist/ are still scanned', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('app/out/leak.ts'));
  assertBlocked(await scanProject('src/lib/dist/leak.ts'));
});

for (const dir of ['.next', 'out', 'dist', 'coverage', 'node_modules/pkg', '.claude/hooks/node_modules/pkg', '.claude/hooks/logs']) {
  test(`.gitleaks.toml: ${dir}/ is not scanned`, { skip: SKIP }, async () => {
    assertAllowed(await scanProject(`${dir}/leak.js`));
  });
}
