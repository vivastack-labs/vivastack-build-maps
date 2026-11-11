'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, detectSecrets } = require('../scripts/gitleaks');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

const spawnPass        = () => ({ status: 0,    error: null, stderr: '' });
const spawnFail        = () => ({ status: 1,    error: null, stderr: 'leak found' });
const spawnNotFound    = () => ({ status: null, error: new Error('ENOENT'), stderr: '' });
const spawnUnknownFlag = () => ({ status: 1,    error: null, stderr: 'unknown flag: --quiet' });

test('gitleaks: non-git command passes without scanning', async () => {
  assertAllowed(await run({ tool_input: { command: 'ls -la' } }, spawnFail));
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

test('gitleaks: gitleaks not installed → pass gracefully', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "test"' } }, spawnNotFound));
});

test('gitleaks: unknown flag in stderr → skip gracefully (version mismatch)', async () => {
  assertAllowed(await run({ tool_input: { command: 'git commit -m "wip"' } }, spawnUnknownFlag));
});

test('gitleaks: null/empty/missing input → pass', async () => {
  assertAllowed(await run(null,      spawnFail));
  assertAllowed(await run({},        spawnFail));
  assertAllowed(await run(undefined, spawnFail));
});

test('detectSecrets: returns spawn result', () => {
  const result = detectSecrets(spawnPass);
  assert.equal(result.status, 0);
  assert.equal(result.error, null);
});

// --- Repository config (.gitleaks.toml) against the real gitleaks binary ----

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const HAS_GITLEAKS = !spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).error;
const SKIP = !HAS_GITLEAKS && 'gitleaks not installed';
// Built at runtime so this file itself never contains a token-shaped literal.
const FAKE_TOKEN = ['ghp', '_', '1234567890abcdefghij', 'ABCDEFGHIJ123456'].join('');

// Copies the repo config into a temp project (optionally under an ancestor dir
// such as dist/) and scans it through the real detectSecrets().
function scanProject(relPath, { ancestor = 'any' } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-gitleaks-'));
  const root = path.join(tmp, ancestor, 'proj');
  try {
    fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, '.gitleaks.toml'), path.join(root, '.gitleaks.toml'));
    fs.writeFileSync(path.join(root, relPath), `const token = "${FAKE_TOKEN}";\n`);
    const r = detectSecrets(spawnSync, root);
    return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function assertDetected({ status, output }) {
  assert.equal(status, 1, output);
  assert.doesNotMatch(output, /FTL/);
  assert.match(output, /leaks found: 1/);
}

function assertClean({ status, output }) {
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /FTL/);
}

test('detectSecrets: scans the project root with its .gitleaks.toml', () => {
  const calls = [];
  const spy = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status: 0, error: null, stderr: '' };
  };
  detectSecrets(spy, '/repo');
  assert.equal(calls[0].cmd, 'gitleaks');
  assert.deepEqual(calls[0].args, ['detect', '--no-git', '--source', '.', '-c', path.join('/repo', '.gitleaks.toml')]);
  assert.equal(calls[0].opts.cwd, '/repo');
});

test('run: scans CLAUDE_PROJECT_DIR (falls back to input.cwd)', async () => {
  const calls = [];
  const spy = (cmd, args, opts) => {
    calls.push(opts.cwd);
    return { status: 0, error: null, stderr: '' };
  };
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = '/project-dir';
    await run({ cwd: '/input-cwd', tool_input: { command: 'git commit -m "x"' } }, spy);
    delete process.env.CLAUDE_PROJECT_DIR;
    await run({ cwd: '/input-cwd', tool_input: { command: 'git commit -m "x"' } }, spy);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
  assert.deepEqual(calls, ['/project-dir', '/input-cwd']);
});

test('.gitleaks.toml: default rules are enabled (a token in src/ is detected)', { skip: SKIP }, () => {
  assertDetected(scanProject('src/leak.ts'));
});

test('.gitleaks.toml: an ancestor dir named dist/ does not disable scanning', { skip: SKIP }, () => {
  assertDetected(scanProject('src/leak.ts', { ancestor: 'dist' }));
});

test('.gitleaks.toml: nested dirs named out/ or dist/ are still scanned', { skip: SKIP }, () => {
  assertDetected(scanProject('geo/out/leak.ts'));
  assertDetected(scanProject('src/lib/dist/leak.ts'));
});

for (const dir of ['.next', 'out', 'dist', 'coverage', 'node_modules/pkg', '.claude/hooks/node_modules/pkg', '.claude/hooks/logs']) {
  test(`.gitleaks.toml: ${dir}/ is not scanned`, { skip: SKIP }, () => {
    assertClean(scanProject(`${dir}/leak.js`));
  });
}
