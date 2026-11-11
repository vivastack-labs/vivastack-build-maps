'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/config-protection');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

test('blocks editing .eslintrc.json', async () => {
  const result = await run({ tool_input: { file_path: '/project/.eslintrc.json' } });
  assert.equal(result.decision, 'block');
  assert.ok(result.reason.includes('.eslintrc.json'));
});

test('blocks editing biome.json', async () => {
  const result = await run({ tool_input: { file_path: '/project/biome.json' } });
  assert.equal(result.decision, 'block');
});

test('blocks editing ruff.toml', async () => {
  const result = await run({ tool_input: { file_path: '/project/ruff.toml' } });
  assert.equal(result.decision, 'block');
});

test('allows editing regular source files', async () => {
  const result = await run({ tool_input: { file_path: '/project/src/index.ts' } });
  assertAllowed(result);
});

test('allows editing package.json', async () => {
  const result = await run({ tool_input: { file_path: '/project/package.json' } });
  assertAllowed(result);
});
