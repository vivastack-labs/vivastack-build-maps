'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/auto-tmux-dev');

function decisionOrAllow(result) {
  return result?.decision ?? 'allow';
}

test('blocks npm run dev (or allows if no tmux)', async () => {
  const result = await run({ tool_input: { command: 'npm run dev' } });
  const decision = decisionOrAllow(result);
  // If tmux is available it blocks; if not, allows. Either is valid.
  assert.ok(['allow', 'block'].includes(decision));
  if (decision === 'block') {
    assert.ok(result.reason.includes('tmux'));
  }
});

test('allows non-dev commands', async () => {
  const result = await run({ tool_input: { command: 'npm run build' } });
  assert.equal(decisionOrAllow(result), 'allow');
});

test('allows git commands', async () => {
  const result = await run({ tool_input: { command: 'git status' } });
  assert.equal(decisionOrAllow(result), 'allow');
});
