'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { statePath } = require('../lib/state');

test('format-markdown: no accumulator file → no-op', async () => {
  delete require.cache[require.resolve('../scripts/format-markdown')];
  const { run } = require('../scripts/format-markdown');
  await run({ session_id: `test-md-nofile-${Date.now()}` });
  // no throw = pass
});

test('format-markdown: skips non-md files', async () => {
  const sessionId = `test-md-skip-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-md-'));
  const tsFile = path.join(tmpDir, 'app.ts');
  fs.writeFileSync(tsFile, '');
  fs.writeFileSync(accumFile, `${tsFile}\n`);

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (file, args) => { calls.push({ file, args }); return ''; };
  delete require.cache[require.resolve('../scripts/format-markdown')];
  const { run } = require('../scripts/format-markdown');

  try {
    await run({ session_id: sessionId });
    assert.equal(calls.length, 0, 'should not call markdownlint for non-md files');
  } finally {
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-markdown')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('format-markdown: runs markdownlint on md files', async () => {
  const sessionId = `test-md-run-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-md-'));
  const mdFile = path.join(tmpDir, 'README.md');
  fs.writeFileSync(mdFile, '# Hello\n');
  fs.writeFileSync(accumFile, `${mdFile}\n`);

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const calls = [];
  childProcess.execFileSync = (file, args) => { calls.push({ file, args }); return ''; };
  delete require.cache[require.resolve('../scripts/format-markdown')];
  const { run } = require('../scripts/format-markdown');

  try {
    await run({ session_id: sessionId });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, 'markdownlint-cli2');
    assert.ok(calls[0].args.includes(mdFile));
  } finally {
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-markdown')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('format-markdown: reports errors to stderr without throwing', async () => {
  const sessionId = `test-md-err-${Date.now()}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-md-'));
  const mdFile = path.join(tmpDir, 'bad.md');
  fs.writeFileSync(mdFile, '# Hello\n');
  fs.writeFileSync(accumFile, `${mdFile}\n`);

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  const childProcess = require('child_process');
  const orig = childProcess.execFileSync;
  const lintErr = Object.assign(new Error('lint failed'), { stdout: 'bad.md: MD001\n', stderr: '' });
  childProcess.execFileSync = () => { throw lintErr; };
  delete require.cache[require.resolve('../scripts/format-markdown')];
  const { run } = require('../scripts/format-markdown');

  try {
    await run({ session_id: sessionId });
    const output = stderrChunks.join('');
    assert.ok(output.includes('[VCW] markdownlint-cli2 errors:'));
  } finally {
    process.stderr.write = origWrite;
    childProcess.execFileSync = orig;
    delete require.cache[require.resolve('../scripts/format-markdown')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
