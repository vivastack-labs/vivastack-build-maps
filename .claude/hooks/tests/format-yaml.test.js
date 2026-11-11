'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { statePath } = require('../lib/state');

function withExecMock(fn) {
  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (file, args, opts) => { calls.push({ file, args, opts }); return ''; };
  delete require.cache[require.resolve('../scripts/format-yaml')];
  try {
    return fn(calls);
  } finally {
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-yaml')];
  }
}

test('format-yaml: no accumulator file → no-op', async () => {
  delete require.cache[require.resolve('../scripts/format-yaml')];
  const { run } = require('../scripts/format-yaml');
  await run({ session_id: `test-yaml-nofile-${Date.now()}` });
  // no throw = pass
});

test('format-yaml: skips non-yaml files', async () => {
  const sessionId = `test-yaml-skip-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-yaml-'));
  const jsFile = path.join(tmpDir, 'app.js');
  fs.writeFileSync(jsFile, '');
  fs.writeFileSync(accumFile, `${jsFile}\n`);

  try {
    await withExecMock(async (calls) => {
      delete require.cache[require.resolve('../scripts/format-yaml')];
      const { run } = require('../scripts/format-yaml');
      await run({ session_id: sessionId });
      assert.equal(calls.length, 0, 'should not call yamllint for non-yaml files');
    });
  } finally {
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('format-yaml: runs yamllint on yaml files', async () => {
  const sessionId = `test-yaml-run-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-yaml-'));
  const ymlFile = path.join(tmpDir, 'config.yml');
  const yamlFile = path.join(tmpDir, 'data.yaml');
  fs.writeFileSync(ymlFile, 'key: value\n');
  fs.writeFileSync(yamlFile, 'key: value\n');
  fs.writeFileSync(accumFile, `${ymlFile}\n${yamlFile}\n`);

  try {
    const childProcess = require('child_process');
    const orig = childProcess.execFileSync;
    const calls = [];
    childProcess.execFileSync = (file, args, opts) => { calls.push({ file, args }); return ''; };
    delete require.cache[require.resolve('../scripts/format-yaml')];
    const { run } = require('../scripts/format-yaml');
    await run({ session_id: sessionId });
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-yaml')];

    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, 'yamllint');
    assert.ok(calls[0].args.includes(ymlFile));
    assert.ok(calls[0].args.includes(yamlFile));
  } finally {
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('format-yaml: reports errors to stderr without throwing', async () => {
  const sessionId = `test-yaml-err-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-yaml-'));
  const ymlFile = path.join(tmpDir, 'bad.yml');
  fs.writeFileSync(ymlFile, 'key: value\n');
  fs.writeFileSync(accumFile, `${ymlFile}\n`);

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  try {
    const childProcess = require('child_process');
    const orig = childProcess.execFileSync;
    const lintErr = Object.assign(new Error('lint failed'), { stdout: 'bad.yml: error\n', stderr: '' });
    childProcess.execFileSync = () => { throw lintErr; };
    delete require.cache[require.resolve('../scripts/format-yaml')];
    const { run } = require('../scripts/format-yaml');
    await run({ session_id: sessionId });
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-yaml')];

    const output = stderrChunks.join('');
    assert.ok(output.includes('[VCW] yamllint errors:'));
  } finally {
    process.stderr.write = origWrite;
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
