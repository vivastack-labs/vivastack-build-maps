'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_FILE = path.join(os.homedir(), '.claude', 'vivastack-cc-workflows', 'mcp-health-cache.json');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

test('allows call when server not in unhealthy cache', async () => {
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
  }
  delete cache['test-server-healthy'];
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  delete require.cache[require.resolve('../scripts/mcp-health-check')];
  const { run } = require('../scripts/mcp-health-check');
  const result = await run({ tool_name: 'mcp_test-server-healthy__some_tool', tool_input: {} });
  assertAllowed(result);
});

test('blocks call when server is in backoff', async () => {
  const cache = { 'test-server-unhealthy': { unhealthyUntil: Date.now() + 60000, reason: 'auth_error' } };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  delete require.cache[require.resolve('../scripts/mcp-health-check')];
  const { run } = require('../scripts/mcp-health-check');
  const result = await run({ tool_name: 'mcp_test-server-unhealthy__some_tool', tool_input: {} });
  assert.equal(result.decision, 'block');
  assert.ok(result.reason.includes('unhealthy'));
});

test('allows call when backoff has expired', async () => {
  const cache = { 'test-server-expired': { unhealthyUntil: Date.now() - 1000, reason: 'auth_error' } };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  delete require.cache[require.resolve('../scripts/mcp-health-check')];
  const { run } = require('../scripts/mcp-health-check');
  const result = await run({ tool_name: 'mcp_test-server-expired__some_tool', tool_input: {} });
  assertAllowed(result);
});
