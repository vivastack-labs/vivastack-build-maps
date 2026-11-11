'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { statePath } = require('../lib/state');

test('shellcheck: no accumulator file → no-op', async () => {
  delete require.cache[require.resolve('../scripts/shellcheck')];
  const { run } = require('../scripts/shellcheck');
  await run({ session_id: `test-sc-nofile-${Date.now()}` });
  // no throw = pass
});

test('shellcheck: skips non-sh files', async () => {
  const sessionId = `test-sc-skip-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-sc-'));
  const jsFile = path.join(tmpDir, 'app.js');
  fs.writeFileSync(jsFile, '');
  fs.writeFileSync(accumFile, `${jsFile}\n`);

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (file, args) => { calls.push({ file, args }); return ''; };
  delete require.cache[require.resolve('../scripts/shellcheck')];
  const { run } = require('../scripts/shellcheck');

  try {
    await run({ session_id: sessionId });
    assert.equal(calls.length, 0, 'should not call shellcheck for non-sh files');
  } finally {
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/shellcheck')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('shellcheck: runs shellcheck on .sh files', async () => {
  const sessionId = `test-sc-run-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-sc-'));
  const shFile = path.join(tmpDir, 'deploy.sh');
  fs.writeFileSync(shFile, '#!/bin/bash\necho hello\n');
  fs.writeFileSync(accumFile, `${shFile}\n`);

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (file, args) => { calls.push({ file, args }); return ''; };
  delete require.cache[require.resolve('../scripts/shellcheck')];
  const { run } = require('../scripts/shellcheck');

  try {
    await run({ session_id: sessionId });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, 'shellcheck');
    assert.ok(calls[0].args.includes(shFile));
  } finally {
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/shellcheck')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('shellcheck: reports errors to stderr without throwing', async () => {
  const sessionId = `test-sc-err-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-sc-'));
  const shFile = path.join(tmpDir, 'bad.sh');
  fs.writeFileSync(shFile, '#!/bin/bash\necho hello\n');
  fs.writeFileSync(accumFile, `${shFile}\n`);

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const lintErr = Object.assign(new Error('shellcheck failed'), {
    stdout: `${shFile}: line 2: SC2148 warning\n`,
    stderr: '',
  });
  childProcess.execFileSync = () => { throw lintErr; };
  delete require.cache[require.resolve('../scripts/shellcheck')];
  const { run } = require('../scripts/shellcheck');

  try {
    await run({ session_id: sessionId });
    const output = stderrChunks.join('');
    assert.ok(output.includes('[VCW] shellcheck errors:'));
  } finally {
    process.stderr.write = origWrite;
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/shellcheck')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
