'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('run: uses execFileSync instead of shell command strings', async () => {
  const childProcess = require('child_process');
  const originalExecSync = childProcess.execSync;
  const originalExecFileSync = childProcess.execFileSync;
  let execSyncCalls = 0;
  const execFileCalls = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-qg-'));
  const mdFile = path.join(tmpDir, 'README.md');

  childProcess.execSync = () => { execSyncCalls += 1; return ''; };
  childProcess.execFileSync = (file, args) => { execFileCalls.push({ file, args }); return ''; };

  fs.writeFileSync(mdFile, '# test\n');

  try {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    const { run } = require('../scripts/quality-gate');
    await run({ tool_input: { file_path: mdFile } });

    assert.equal(execSyncCalls, 0);
    assert.equal(execFileCalls.length, 1);
    assert.equal(execFileCalls[0].file, 'markdownlint-cli2');
    assert.deepEqual(execFileCalls[0].args, [mdFile]);
  } finally {
    childProcess.execSync = originalExecSync;
    childProcess.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('../scripts/quality-gate')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('quality-gate: validates JSON file syntax', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-qg-'));
  const jsonFile = path.join(tmpDir, 'config.json');
  fs.writeFileSync(jsonFile, '{"valid": true}');
  try {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    const { run } = require('../scripts/quality-gate');
    const result = await run({ tool_input: { file_path: jsonFile } });
    // Valid JSON: returns undefined/null (no blocking)
    assert.ok(result == null);
  } finally {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('quality-gate: reports invalid JSON to stderr', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-qg-'));
  const jsonFile = path.join(tmpDir, 'bad.json');
  fs.writeFileSync(jsonFile, '{ invalid json !!!');
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (data) => { stderrChunks.push(data); return true; };
  try {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    const { run } = require('../scripts/quality-gate');
    await run({ tool_input: { file_path: jsonFile } });
    const combined = stderrChunks.join('');
    assert.ok(combined.includes('[VCW] Quality gate'), `stderr: ${combined}`);
  } finally {
    process.stderr.write = origWrite;
    delete require.cache[require.resolve('../scripts/quality-gate')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('quality-gate: skips JS/TS files', async () => {
  const childProcess = require('child_process');
  const originalExecFileSync = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (...args) => { calls.push(args); return ''; };
  try {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    const { run } = require('../scripts/quality-gate');
    await run({ tool_input: { file_path: '/project/src/index.ts' } });
    assert.equal(calls.length, 0, 'should not run linter on .ts files');
  } finally {
    childProcess.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('../scripts/quality-gate')];
  }
});

test('quality-gate: reports linter errors via stderr', async () => {
  const childProcess = require('child_process');
  const originalExecFileSync = childProcess.execFileSync;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-qg-'));
  const mdFile = path.join(tmpDir, 'README.md');
  fs.writeFileSync(mdFile, '# test\n');

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (data) => { stderrChunks.push(data); return true; };

  childProcess.execFileSync = () => {
    const err = new Error('markdownlint failed');
    err.stdout = 'README.md:1 MD041\n';
    err.stderr = '';
    throw err;
  };
  try {
    delete require.cache[require.resolve('../scripts/quality-gate')];
    const { run } = require('../scripts/quality-gate');
    await run({ tool_input: { file_path: mdFile } });
    const combined = stderrChunks.join('');
    assert.ok(combined.includes('[VCW] Quality gate'), `stderr: ${combined}`);
  } finally {
    process.stderr.write = origWrite;
    childProcess.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('../scripts/quality-gate')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('quality-gate: returns undefined for unknown extensions', async () => {
  delete require.cache[require.resolve('../scripts/quality-gate')];
  const { run } = require('../scripts/quality-gate');
  const result = await run({ tool_input: { file_path: '/project/file.xyz' } });
  assert.ok(result == null);
  delete require.cache[require.resolve('../scripts/quality-gate')];
});

test('quality-gate: returns undefined when no file_path provided', async () => {
  delete require.cache[require.resolve('../scripts/quality-gate')];
  const { run } = require('../scripts/quality-gate');
  const result = await run({ tool_input: {} });
  assert.ok(result == null);
  delete require.cache[require.resolve('../scripts/quality-gate')];
});
