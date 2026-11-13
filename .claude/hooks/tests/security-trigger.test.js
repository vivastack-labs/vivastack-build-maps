'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, PATTERNS, buildFlaggedList } = require('../scripts/security-trigger');

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
  assert.deepEqual(buildFlaggedList(['tests/unit/components/Header.test.tsx'], () => diff), []);
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
  buildFlaggedList(['auth.js'], () => { called = true; return ''; });
  assert.equal(called, false);
});

test('buildFlaggedList: flags file whose diff content matches pattern', () => {
  const flagged = buildFlaggedList(['index.js'], () => 'const token = jwt.sign(data, secret)');
  assert.equal(flagged.length, 1);
  assert.ok(flagged[0].includes('index.js'));
  assert.ok(flagged[0].includes('[content]'));
});

test('buildFlaggedList: returns empty for safe files', () => {
  const flagged = buildFlaggedList(['index.js', 'utils.ts'], () => 'const x = 1;');
  assert.equal(flagged.length, 0);
});

test('buildFlaggedList: handles getDiff throwing gracefully', () => {
  const flagged = buildFlaggedList(['index.js'], () => { throw new Error('git error'); });
  assert.equal(flagged.length, 0);
});

test('buildFlaggedList: handles empty file list', () => {
  assert.deepEqual(buildFlaggedList([], () => ''), []);
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
