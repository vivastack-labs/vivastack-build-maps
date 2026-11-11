'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('session-start: returns hookSpecificOutput.additionalContext string', async () => {
  const { run } = require('../scripts/session-start');
  const result = await run({ cwd: process.cwd() });
  assert.ok(result != null);
  assert.ok(typeof result.hookSpecificOutput?.additionalContext === 'string');
  assert.ok(result.hookSpecificOutput.additionalContext.length > 0);
});

test('session-start: includes Session Context header', async () => {
  delete require.cache[require.resolve('../scripts/session-start')];
  const { run } = require('../scripts/session-start');
  const result = await run({ cwd: process.cwd() });
  assert.ok(result.hookSpecificOutput.additionalContext.includes('Session Context'));
});

test('session-start: hookSpecificOutput includes hookEventName=SessionStart', async () => {
  delete require.cache[require.resolve('../scripts/session-start')];
  const { run } = require('../scripts/session-start');
  const result = await run({ cwd: process.cwd() });
  assert.strictEqual(result.hookSpecificOutput.hookEventName, 'SessionStart');
});

test('session-start: works in non-git directory (graceful fallback)', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-ss-'));
  try {
    delete require.cache[require.resolve('../scripts/session-start')];
    const { run } = require('../scripts/session-start');
    const result = await run({ cwd: tmpDir });
    assert.ok(result != null);
    assert.ok(typeof result.hookSpecificOutput?.additionalContext === 'string');
    // Non-git dir: no Session Context, but result is still valid
  } finally {
    delete require.cache[require.resolve('../scripts/session-start')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('session-start: surfaces pending CLAUDE.md suggestion files', async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'vivastack-cc-workflows', 'sessions');
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const tag = `ss-test-${process.pid}-${Date.now()}`;
  const filename = `${today}-${tag}-claude-md-suggest.md`;
  const filePath = path.join(SESSIONS_DIR, filename);
  fs.writeFileSync(filePath, '# CLAUDE.md update suggestions\n\n- example\n');
  try {
    delete require.cache[require.resolve('../scripts/session-start')];
    const { run } = require('../scripts/session-start');
    const result = await run({ cwd: process.cwd() });
    const ctx = result?.hookSpecificOutput?.additionalContext ?? '';
    assert.ok(ctx.includes('CLAUDE.md') && ctx.includes(filename),
      `additionalContext should mention pending suggestion file. got:\n${ctx}`);
  } finally {
    delete require.cache[require.resolve('../scripts/session-start')];
    fs.unlinkSync(filePath);
  }
});

test('session-start: detects project languages from filesystem', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-ss-'));
  // Create project markers
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module test');
  try {
    delete require.cache[require.resolve('../scripts/session-start')];
    const { run } = require('../scripts/session-start');
    const result = await run({ cwd: tmpDir });
    const ctx = result?.hookSpecificOutput?.additionalContext ?? '';
    assert.ok(ctx.includes('javascript') || ctx.includes('go'), `context: ${ctx}`);
  } finally {
    delete require.cache[require.resolve('../scripts/session-start')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
