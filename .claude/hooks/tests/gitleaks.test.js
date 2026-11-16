'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, scanCommands } = require('../scripts/gitleaks');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

const spawnPass = () => ({ status: 0, error: null, stderr: '' });
const spawnFail = () => ({ status: 1, error: null, stderr: 'leak found' });
const spawnNotFound = () => ({ status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), stderr: '' });
const spawnTimedOut = () => ({ status: null, error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), stderr: '' });
const spawnUnknownFlag = () => ({ status: 1, error: null, stderr: 'unknown flag: --quiet' });

/** 呼ばれた gitleaks の引数を記録する spawn */
function recordingSpawn(result = spawnPass) {
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return result();
  };
  return { spawn, calls };
}

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
  const result = await run({ tool_input: { command: 'git add a.txt && git commit -m "wip"' } }, spawnFail);
  assert.equal(result.decision, 'block');
});

test('gitleaks: git commit scans only staged and unstaged diffs, never the whole tree', async () => {
  const { spawn, calls } = recordingSpawn();
  await run({ tool_input: { command: 'git commit -m "wip"' } }, spawn);
  const argLists = calls.map(call => call.args);
  assert.ok(argLists.some(args => args[0] === 'protect' && args.includes('--staged')));
  assert.ok(argLists.some(args => args[0] === 'protect' && !args.includes('--staged')));
  assert.ok(
    argLists.every(args => !args.includes('--no-git')),
    '作業ツリー全体（node_modules を含む）を読まない'
  );
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
  await run({ tool_input: { command: 'git commit -m "wip" && git push' } }, spawn);
  assert.equal(calls.length, 3);
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
  assertAllowed(await run({ tool_input: { command: 'git commit -m "wip" && git push' } }, spawn, () => now));
  assert.ok(calls.reduce((sum, t) => sum + t, 0) < 10_000, `合計 ${calls.join('+')} が hook の timeout を超えない`);
});

test('gitleaks: block reason keeps --redact and quotes arguments so it can be pasted', async () => {
  const result = await run({ tool_input: { command: 'git push' } }, spawnFail);
  assert.match(result.reason, /--redact/, '詳細のコマンドが秘密を平文で出さない');
  assert.match(result.reason, /'--log-opts=--all --not --remotes'/);
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
  assert.ok(scans.every(args => args.includes('-c') && args.includes('/repo/.gitleaks.toml')));
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
 * step：'staged'・'unstaged'・'committed'・'other-branch'（別のブランチにコミットして、元のブランチに戻る）
 */
async function scanProject(relPath, { ancestor = 'any', step = 'staged', command = 'git commit -m x' } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-gitleaks-'));
  const root = path.join(tmp, ancestor, 'proj');
  const git = args => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'ignore' });
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
    git(['init', '-q']);
    fs.copyFileSync(path.join(REPO_ROOT, '.gitleaks.toml'), path.join(root, '.gitleaks.toml'));
    fs.writeFileSync(path.join(root, relPath), 'const token = "";\n');
    git(['add', '-f', '.']);
    git(['commit', '-q', '-m', 'init']);
    fs.writeFileSync(path.join(root, relPath), `const token = "${FAKE_TOKEN}";\n`);
    if (step === 'other-branch') git(['checkout', '-q', '-b', 'leaky']);
    if (step !== 'unstaged') git(['add', '-f', relPath]);
    if (step === 'committed' || step === 'other-branch') git(['commit', '-q', '-m', 'leak']);
    if (step === 'other-branch') git(['checkout', '-q', '-']);
    delete process.env.CLAUDE_PROJECT_DIR;
    return await run({ cwd: root, tool_input: { command } });
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const assertBlocked = result => assert.equal(result?.decision, 'block');

test('real gitleaks: a staged token in src/ blocks git commit', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts'));
});

test('real gitleaks: an unstaged token blocks git commit (covers commit -a)', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'unstaged', command: 'git commit -am x' }));
});

test('real gitleaks: an unpushed commit with a token blocks git push', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'committed', command: 'git push -u origin feat/x' }));
});

test('real gitleaks: a token only on a branch other than HEAD blocks git push', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { step: 'other-branch', command: 'git push origin leaky' }));
});

test('.gitleaks.toml: an ancestor dir named dist/ does not disable scanning', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('src/leak.ts', { ancestor: 'dist' }));
});

test('.gitleaks.toml: nested dirs named out/ or dist/ are still scanned', { skip: SKIP }, async () => {
  assertBlocked(await scanProject('geo/out/leak.ts'));
  assertBlocked(await scanProject('src/lib/dist/leak.ts'));
});

for (const dir of ['.next', 'out', 'dist', 'coverage', 'node_modules/pkg', '.claude/hooks/node_modules/pkg', '.claude/hooks/logs']) {
  test(`.gitleaks.toml: ${dir}/ is not scanned`, { skip: SKIP }, async () => {
    assertAllowed(await scanProject(`${dir}/leak.js`));
  });
}
