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

// --- Local binaries only (never fetch tools with npx) ---------------------

function makeProject({ bins = [] } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-format-'));
  const projectDir = path.join(tmpDir, 'project');
  const binDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.git')); // findLocalBin stops at the git root
  fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), '{}');
  if (bins.length > 0) fs.mkdirSync(binDir, { recursive: true });
  for (const name of bins) fs.writeFileSync(path.join(binDir, name), '', { mode: 0o755 });
  const filePath = path.join(projectDir, 'src', 'sample.ts');
  fs.writeFileSync(filePath, 'export const sample = 1;\n');
  return { tmpDir, projectDir, binDir, filePath };
}

async function runWithFakeExec(project, { failing = [] } = {}) {
  const childProcess = require('child_process');
  const originalExecSync = childProcess.execSync;
  const originalExecFileSync = childProcess.execFileSync;
  const calls = { execSync: 0, execFile: [] };
  const sessionId = `test-format-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);

  childProcess.execSync = () => {
    calls.execSync += 1;
    return '';
  };
  childProcess.execFileSync = (file, args) => {
    calls.execFile.push({ file, args });
    if (failing.includes(path.basename(file))) throw Object.assign(new Error('failed'), { stdout: 'boom', stderr: '' });
    return '';
  };
  fs.writeFileSync(accumFile, `${project.filePath}\n`);

  try {
    delete require.cache[require.resolve('../scripts/format-typecheck')];
    const { run } = require('../scripts/format-typecheck');
    await run({ session_id: sessionId });
    return calls;
  } finally {
    childProcess.execSync = originalExecSync;
    childProcess.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('../scripts/format-typecheck')];
    if (fs.existsSync(accumFile)) fs.unlinkSync(accumFile);
  }
}

test('findLocalBin: finds node_modules/.bin in an ancestor directory', () => {
  const { findLocalBin } = require('../scripts/format-typecheck');
  const project = makeProject({ bins: ['prettier'] });
  try {
    assert.equal(findLocalBin(path.join(project.projectDir, 'src'), 'prettier'), path.join(project.binDir, 'prettier'));
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('findLocalBin: returns null when the tool is not installed locally', () => {
  const { findLocalBin } = require('../scripts/format-typecheck');
  const project = makeProject();
  try {
    assert.equal(findLocalBin(project.projectDir, 'biome-not-installed-xyz'), null);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: never invokes npx (no package is fetched from the registry)', async () => {
  const project = makeProject({ bins: ['prettier', 'eslint', 'tsc'] });
  try {
    const calls = await runWithFakeExec(project);
    assert.equal(calls.execSync, 0);
    assert.ok(calls.execFile.length >= 1);
    assert.ok(calls.execFile.every(c => c.file !== 'npx'), `npx was called: ${JSON.stringify(calls.execFile)}`);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: skips every tool when none is installed locally', async () => {
  const project = makeProject();
  try {
    const calls = await runWithFakeExec(project);
    assert.deepEqual(calls.execFile, []);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: uses local prettier when biome is not installed', async () => {
  const project = makeProject({ bins: ['prettier'] });
  try {
    const calls = await runWithFakeExec(project);
    assert.equal(calls.execFile.length, 1);
    assert.equal(calls.execFile[0].file, path.join(project.binDir, 'prettier'));
    assert.deepEqual(calls.execFile[0].args, ['--write', project.filePath]);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: prefers local biome over prettier when both are installed', async () => {
  const project = makeProject({ bins: ['biome', 'prettier'] });
  try {
    const calls = await runWithFakeExec(project);
    assert.equal(calls.execFile[0].file, path.join(project.binDir, 'biome'));
    assert.deepEqual(calls.execFile[0].args, ['format', '--write', project.filePath]);
    assert.ok(calls.execFile.every(c => c.file !== path.join(project.binDir, 'prettier')));
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: runs local eslint and tsc', async () => {
  const project = makeProject({ bins: ['eslint', 'tsc'] });
  try {
    const calls = await runWithFakeExec(project);
    const files = calls.execFile.map(c => c.file);
    assert.deepEqual(files, [path.join(project.binDir, 'eslint'), path.join(project.binDir, 'tsc')]);
    assert.deepEqual(calls.execFile[1].args, ['--noEmit']);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('findLocalBin: does not search above the git root', () => {
  const { findLocalBin } = require('../scripts/format-typecheck');
  const project = makeProject();
  const outerBin = path.join(project.tmpDir, 'node_modules', '.bin');
  try {
    fs.mkdirSync(outerBin, { recursive: true });
    fs.writeFileSync(path.join(outerBin, 'prettier'), '', { mode: 0o755 });
    assert.equal(findLocalBin(path.join(project.projectDir, 'src'), 'prettier'), null);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('findLocalBin: ignores files that are not executable', () => {
  const { findLocalBin } = require('../scripts/format-typecheck');
  const project = makeProject({ bins: ['prettier'] });
  try {
    fs.chmodSync(path.join(project.binDir, 'prettier'), 0o644);
    assert.equal(findLocalBin(project.projectDir, 'prettier'), null);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});

test('run: falls back to prettier when local biome fails', async () => {
  const project = makeProject({ bins: ['biome', 'prettier'] });
  try {
    const calls = await runWithFakeExec(project, { failing: ['biome'] });
    assert.deepEqual(calls.execFile.map(c => path.basename(c.file)), ['biome', 'prettier']);
  } finally {
    fs.rmSync(project.tmpDir, { recursive: true, force: true });
  }
});
