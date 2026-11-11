'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GATE_DIR = path.join(os.homedir(), '.claude', 'vivastack', 'gateguard');

function clearGateState(sessionId) {
  const key = sessionId.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
  const f = path.join(GATE_DIR, `state-${key}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

test('blocks first Edit of a file, allows second (investigated)', async () => {
  const sessionId = `test-session-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');

  const input = {
    session_id: sessionId,
    tool_name: 'Edit',
    tool_input: { file_path: '/project/src/foo.ts' },
  };

  const first = await run(input);
  assert.equal(first.decision, 'block');
  assert.ok(first.reason.includes('Fact-Forcing Gate'));

  const second = await run(input);
  assertAllowed(second);
  clearGateState(sessionId);
});

test('allows non-destructive Bash commands', async () => {
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');
  const result = await run({
    session_id: 'test-session-safe',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
  });
  assertAllowed(result);
});

test('blocks first destructive Bash, allows second', async () => {
  const sessionId = `test-session-destructive-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');

  const input = {
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf dist/' },
  };

  const first = await run(input);
  assert.equal(first.decision, 'block');

  const second = await run(input);
  assertAllowed(second);
  clearGateState(sessionId);
});

test('blocks DROP DATABASE', async () => {
  const sessionId = `test-session-dropdb-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');
  const result = await run({
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'psql -c "DROP DATABASE myapp"' },
  });
  assert.equal(result.decision, 'block');
  clearGateState(sessionId);
});

test('blocks disk device write', async () => {
  const sessionId = `test-session-disk-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');
  const result = await run({
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'dd if=image.iso > /dev/sda' },
  });
  assert.equal(result.decision, 'block');
  clearGateState(sessionId);
});

test('blocks mkfs', async () => {
  const sessionId = `test-session-mkfs-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');
  const result = await run({
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'mkfs.ext4 /dev/sdb1' },
  });
  assert.equal(result.decision, 'block');
  clearGateState(sessionId);
});

test('blocks fork bomb', async () => {
  const sessionId = `test-session-forkbomb-${Date.now()}`;
  clearGateState(sessionId);
  delete require.cache[require.resolve('../scripts/gateguard-fact-force')];
  const { run } = require('../scripts/gateguard-fact-force');
  const result = await run({
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: ':(){ :|:& };:' },
  });
  assert.equal(result.decision, 'block');
  clearGateState(sessionId);
});
