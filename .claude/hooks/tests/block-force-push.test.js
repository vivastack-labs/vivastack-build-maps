'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./helpers/test-utils');

// Non-git command → pass through
test('block-force-push: non-git command → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'ls -la' },
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push without --force → pass through
test('block-force-push: git push without --force → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push origin main' },
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push --force-with-lease → allowed
test('block-force-push: git push --force-with-lease → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force-with-lease origin main' },
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push --force → block
test('block-force-push: git push --force → block', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force origin main' },
  });
  assert.equal(result?.decision, 'block');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

// git push -f shorthand → block
test('block-force-push: git push -f → block', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push -f origin main' },
  });
  assert.equal(result?.decision, 'block');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

// Combined: --force-with-lease must not match --force check
test('block-force-push: --force-with-lease is not treated as --force', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force-with-lease' },
  });
  assert.ok(result == null || result.decision !== 'block');
});
