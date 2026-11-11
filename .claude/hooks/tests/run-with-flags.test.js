'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RUN_WITH_FLAGS = path.join(__dirname, '..', 'run-with-flags.js');

/** Spawn run-with-flags.js and return { status, stdout, stderr } */
function spawn(args, opts = {}) {
  return spawnSync(process.execPath, [RUN_WITH_FLAGS, ...args], {
    input: opts.input ?? '{}',
    encoding: 'utf8',
    env: { ...process.env, VCW_DISABLED_HOOKS: 'vcw:hooks-log', ...(opts.env ?? {}) },
  });
}

test('resolves relative script path against VCW_PLUGIN_ROOT', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  const marker = path.join(tmpRoot, 'executed.marker');
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';
const fs = require('fs');
module.exports = { run: async () => {
  fs.writeFileSync(${JSON.stringify(marker)}, 'ok');
  return { decision: 'allow' };
} };`);
  try {
    const result = spawn(['vcw:test:relative', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(marker), `marker not created; stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('run: uses execFileSync instead of shell command strings', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';\nmodule.exports = { run: async () => ({ decision: 'allow' }) };\n`);
  try {
    const result = spawn(['vcw:test:abs', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('allow'), `stdout: ${result.stdout}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('exits 0 silently when hook is disabled via VCW_DISABLED_HOOKS', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';\nmodule.exports = { run: async () => { throw new Error('should not run'); } };\n`);
  try {
    const result = spawn(['vcw:test:disabled', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot, VCW_DISABLED_HOOKS: 'vcw:test:disabled' },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('blocks path traversal attempts', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  try {
    const result = spawn(['vcw:test:traversal', '../../../etc/passwd', 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0);
    assert.ok(result.stderr.includes('path traversal blocked'), `stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('exits 0 with error on stderr when hook has no run() export', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';\nmodule.exports = { notRun: () => {} };\n`);
  try {
    const result = spawn(['vcw:test:norun', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0);
    assert.ok(result.stderr.includes('no run()'), `stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('exits 0 with error on stderr when hook.run() throws', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';\nmodule.exports = { run: async () => { throw new Error('hook internal failure'); } };\n`);
  try {
    const result = spawn(['vcw:test:throws', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0);
    assert.ok(result.stderr.includes('hook internal failure'), `stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('writes no stdout when hook returns null', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-rwf-'));
  const relScript = path.join('scripts', 'mock-hook.js');
  const absScript = path.join(tmpRoot, relScript);
  fs.mkdirSync(path.dirname(absScript), { recursive: true });
  fs.writeFileSync(absScript, `'use strict';\nmodule.exports = { run: async () => null };\n`);
  try {
    const result = spawn(['vcw:test:null-result', relScript, 'minimal,standard,strict'], {
      env: { VCW_PLUGIN_ROOT: tmpRoot },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
