'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { statePath } = require('../lib/state');

test('deduplicateFiles: removes duplicates', () => {
  const { deduplicateFiles } = require('../scripts/format-typecheck');
  const result = deduplicateFiles(['/a/b.ts', '/a/b.ts', '/a/c.ts']);
  assert.deepEqual(result, ['/a/b.ts', '/a/c.ts']);
});

test('deduplicateFiles: handles empty array', () => {
  const { deduplicateFiles } = require('../scripts/format-typecheck');
  const result = deduplicateFiles([]);
  assert.deepEqual(result, []);
});

test('groupByProjectRoot: groups files by nearest package.json dir', () => {
  const { groupByProjectRoot } = require('../scripts/format-typecheck');
  // Create temp dirs to simulate project roots
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-test-'));
  const projA = path.join(tmpDir, 'projA');
  const projB = path.join(tmpDir, 'projB');
  fs.mkdirSync(path.join(projA, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projB, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projA, 'package.json'), '{}');
  fs.writeFileSync(path.join(projB, 'package.json'), '{}');

  const files = [
    path.join(projA, 'src', 'a.ts'),
    path.join(projA, 'src', 'b.ts'),
    path.join(projB, 'src', 'c.ts'),
  ];
  const groups = groupByProjectRoot(files);
  assert.equal(Object.keys(groups).length, 2);
  assert.equal(groups[projA].length, 2);
  assert.equal(groups[projB].length, 1);

  fs.rmSync(tmpDir, { recursive: true });
});

test('groupByProjectRoot: handles files without package.json', () => {
  const { groupByProjectRoot } = require('../scripts/format-typecheck');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-test-'));
  const subdir = path.join(tmpDir, 'subdir');
  fs.mkdirSync(subdir);
  const file = path.join(subdir, 'file.ts');
  fs.writeFileSync(file, '');

  const groups = groupByProjectRoot([file]);
  assert.equal(Object.keys(groups).length, 1);
  assert.ok(Object.keys(groups)[0]); // Should have a root, even if no package.json

  fs.rmSync(tmpDir, { recursive: true });
});

test('run: uses execFileSync instead of shell command strings', async () => {
  const childProcess = require('child_process');
  const originalExecSync = childProcess.execSync;
  const originalExecFileSync = childProcess.execFileSync;
  let execSyncCalls = 0;
  const execFileCalls = [];
  const sessionId = `test-format-security-${Date.now()}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-format-'));
  const projectDir = path.join(tmpDir, 'project');
  const filePath = path.join(projectDir, 'sample.ts');
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);

  childProcess.execSync = () => {
    execSyncCalls += 1;
    return '';
  };
  childProcess.execFileSync = (file, args) => {
    execFileCalls.push({ file, args });
    return '';
  };

  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
  fs.writeFileSync(filePath, 'export const sample = 1;\n');
  fs.writeFileSync(accumFile, `${filePath}\n`);

  try {
    delete require.cache[require.resolve('../scripts/format-typecheck')];
    const { run } = require('../scripts/format-typecheck');
    await run({ session_id: sessionId });

    assert.equal(execSyncCalls, 0);
    assert.ok(execFileCalls.length >= 1);
    assert.equal(execFileCalls[0].file, 'npx');
    assert.ok(Array.isArray(execFileCalls[0].args));
    assert.equal(execFileCalls[0].args[0], 'biome');
  } finally {
    childProcess.execSync = originalExecSync;
    childProcess.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('../scripts/format-typecheck')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
