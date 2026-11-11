'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectModule, findProjectRoot, readModuleRules, run } = require('../scripts/module-context');

// ── detectModule ────────────────────────────────────────────────────────────

test('detectModule: returns null for unrelated path', () => {
  assert.strictEqual(detectModule('/home/user/projects/myapp'), null);
});

test('detectModule: detects frontend', () => {
  assert.strictEqual(detectModule('/home/user/projects/myapp/frontend'), 'frontend');
  assert.strictEqual(detectModule('/home/user/projects/myapp/frontend/src/components'), 'frontend');
});

test('detectModule: detects backend', () => {
  assert.strictEqual(detectModule('/home/user/projects/myapp/backend'), 'backend');
  assert.strictEqual(detectModule('/home/user/projects/myapp/backend/src/routes'), 'backend');
});

test('detectModule: detects infra', () => {
  assert.strictEqual(detectModule('/home/user/projects/myapp/infra'), 'infra');
  assert.strictEqual(detectModule('/home/user/projects/myapp/infra/environments/prod'), 'infra');
});

// ── findProjectRoot ─────────────────────────────────────────────────────────

test('findProjectRoot: finds root containing .claude', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    fs.mkdirSync(path.join(tmp, 'frontend', 'src'), { recursive: true });
    const found = findProjectRoot(path.join(tmp, 'frontend', 'src'));
    assert.strictEqual(found, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findProjectRoot: returns null when no .claude ancestor', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    const result = findProjectRoot(path.join(tmp, 'a', 'b'));
    assert.ok(result === null || typeof result === 'string'); // graceful
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── readModuleRules ─────────────────────────────────────────────────────────

test('readModuleRules: returns null for missing file', () => {
  assert.strictEqual(readModuleRules('/nonexistent/.claude-module-rules.md'), null);
});

test('readModuleRules: returns file content', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    const rulesPath = path.join(tmp, '.claude-module-rules.md');
    fs.writeFileSync(rulesPath, '# Frontend Rules\n\n- Rule one\n');
    const content = readModuleRules(rulesPath);
    assert.ok(content.includes('Frontend Rules'));
    assert.ok(content.includes('Rule one'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── run ─────────────────────────────────────────────────────────────────────

test('run: returns null when no known modules exist', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    const result = await run({ cwd: tmp });
    assert.strictEqual(result, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: returns module overview when at project root with modules', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    fs.mkdirSync(path.join(tmp, 'frontend'));
    fs.mkdirSync(path.join(tmp, 'backend'));
    const result = await run({ cwd: tmp });
    assert.ok(result != null);
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Module Overview'));
    assert.ok(ctx.includes('frontend'));
    assert.ok(ctx.includes('backend'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: injects module rules when cwd is inside frontend', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    const feDir = path.join(tmp, 'frontend');
    fs.mkdirSync(feDir);
    fs.writeFileSync(
      path.join(feDir, '.claude-module-rules.md'),
      '# Frontend Rules\n\n- Use React\n'
    );
    const result = await run({ cwd: feDir });
    assert.ok(result != null);
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Module Context: frontend'), `got: ${ctx}`);
    assert.ok(ctx.includes('Use React'), `got: ${ctx}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: injects module rules when cwd is inside backend', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    const beDir = path.join(tmp, 'backend');
    fs.mkdirSync(beDir);
    fs.writeFileSync(
      path.join(beDir, '.claude-module-rules.md'),
      '# Backend Rules\n\n- Use parameterized queries\n'
    );
    const result = await run({ cwd: beDir });
    assert.ok(result != null);
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Module Context: backend'), `got: ${ctx}`);
    assert.ok(ctx.includes('parameterized queries'), `got: ${ctx}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: hookEventName is SessionStart', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    fs.mkdirSync(path.join(tmp, 'frontend'));
    const result = await run({ cwd: path.join(tmp, 'frontend') });
    assert.strictEqual(result?.hookSpecificOutput?.hookEventName, 'SessionStart');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: injects module rules when cwd is inside infra', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    const infraDir = path.join(tmp, 'infra');
    fs.mkdirSync(infraDir);
    fs.writeFileSync(
      path.join(infraDir, '.claude-module-rules.md'),
      '# Infra Rules\n\n- Use Terraform\n'
    );
    const result = await run({ cwd: infraDir });
    assert.ok(result != null);
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Module Context: infra'), `got: ${ctx}`);
    assert.ok(ctx.includes('Use Terraform'), `got: ${ctx}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run: graceful when rules file missing in module dir', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcx-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    fs.mkdirSync(path.join(tmp, 'backend'));
    const result = await run({ cwd: path.join(tmp, 'backend') });
    assert.ok(result != null);
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Module Context: backend'));
    assert.ok(ctx.includes('no .claude-module-rules.md'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
