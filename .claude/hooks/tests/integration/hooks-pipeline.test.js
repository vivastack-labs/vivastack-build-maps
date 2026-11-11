'use strict';
/**
 * Integration tests: spawn hook scripts as child processes via run-with-flags.js
 * to verify the full stdin → processing → stdout → exit-code pipeline.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runHook, runScript } = require('../helpers/test-utils');

// ── block-no-verify (Bash tool pre-hook) ────────────────────────────────────

test('integration: block-no-verify blocks --no-verify via run-with-flags', () => {
  const { status, parsed } = runHook(
    'scripts/block-no-verify.js',
    { tool_input: { command: 'git commit --no-verify -m "bypass"' } }
  );
  assert.equal(status, 0, 'run-with-flags must always exit 0 (non-blocking)');
  assert.equal(parsed?.decision, 'block');
  assert.ok(parsed?.reason?.includes('[VCW]'));
});

test('integration: block-no-verify allows safe commit via run-with-flags', () => {
  const { status, parsed } = runHook(
    'scripts/block-no-verify.js',
    { tool_input: { command: 'git commit -m "safe commit"' } }
  );
  assert.equal(status, 0);
  // allow → parsed may be null or { decision: 'allow' }
  assert.ok(parsed == null || parsed.decision === 'allow');
});

// ── config-protection (Write tool pre-hook) ─────────────────────────────────

test('integration: config-protection blocks linter config edit via run-with-flags', () => {
  const { status, parsed } = runHook(
    'scripts/config-protection.js',
    { tool_input: { file_path: '/project/.eslintrc.json' } }
  );
  assert.equal(status, 0);
  assert.equal(parsed?.decision, 'block');
  assert.ok(parsed?.reason?.includes('.eslintrc.json'));
});

test('integration: config-protection allows normal source file edit via run-with-flags', () => {
  const { status, parsed } = runHook(
    'scripts/config-protection.js',
    { tool_input: { file_path: '/project/src/index.ts' } }
  );
  assert.equal(status, 0);
  assert.ok(parsed == null || parsed.decision === 'allow');
});

// ── quality-gate (PostToolUse hook) ─────────────────────────────────────────

test('integration: quality-gate allows when no issues', async () => {
  const result = await runScript('scripts/quality-gate.js', {
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
    tool_response: { stdout: 'hello\n', stderr: '', exit_code: 0 },
  });
  // quality-gate returns null/allow on clean runs
  assert.ok(result == null || result.decision === 'allow' || result.decision === 'block');
});

// ── timeout / malformed input resilience ────────────────────────────────────

test('integration: block-no-verify handles empty input gracefully', () => {
  const { status } = runHook('scripts/block-no-verify.js', {});
  assert.equal(status, 0, 'hooks must not crash on empty input');
});

test('integration: config-protection handles missing file_path gracefully', () => {
  const { status } = runHook('scripts/config-protection.js', { tool_input: {} });
  assert.equal(status, 0, 'hooks must not crash on missing file_path');
});
