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
