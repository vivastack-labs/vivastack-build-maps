'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/block-no-verify');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

test('blocks git commit --no-verify', async () => {
  const result = await run({ tool_input: { command: 'git commit --no-verify -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('blocks git commit -n shorthand', async () => {
  const result = await run({ tool_input: { command: 'git commit -n -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('blocks core.hooksPath bypass', async () => {
  const result = await run({ tool_input: { command: 'git -c core.hooksPath=/dev/null commit -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('allows normal git commit', async () => {
  const result = await run({ tool_input: { command: 'git commit -m "good commit"' } });
  assertAllowed(result);
});

test('allows non-git commands', async () => {
  const result = await run({ tool_input: { command: 'npm test --no-verify' } });
  assertAllowed(result);
});
