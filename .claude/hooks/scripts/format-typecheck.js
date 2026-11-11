'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { statePath } = require('../lib/state');

const BUDGET_MS = 270_000; // 270s total budget

function deduplicateFiles(files) {
  return [...new Set(files)];
}

function findProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function findTsConfigDir(filePath) {
  let dir = path.dirname(filePath);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function groupByProjectRoot(files) {
  const groups = {};
  for (const f of files) {
    const root = findProjectRoot(f) || path.dirname(f);
    if (!groups[root]) groups[root] = [];
    groups[root].push(f);
  }
  return groups;
}

function tryFormat(root, files, deadline) {
  if (Date.now() > deadline) return;
  // Biome first, then Prettier, then skip
  const formatters = [
    () => execFileSync('npx', ['biome', 'format', '--write', ...files], { cwd: root, encoding: 'utf8', timeout: 30_000 }),
    () => execFileSync('npx', ['prettier', '--write', ...files], { cwd: root, encoding: 'utf8', timeout: 30_000 }),
  ];
  for (const fmt of formatters) {
    try { fmt(); return; } catch { /* try next */ }
  }
}

function tryTypecheck(tsConfigDir, deadline) {
  if (Date.now() > deadline) return;
  try {
    execFileSync('npx', ['tsc', '--noEmit'], { cwd: tsConfigDir, encoding: 'utf8', timeout: 60_000 });
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message;
    process.stderr.write(`[VCW] TypeScript errors in ${tsConfigDir}:\n${output}\n`);
  }
}

function tryEslint(root, files, deadline) {
  if (Date.now() > deadline) return;
  const lintFiles = files.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));
  if (lintFiles.length === 0) return;
  try {
    execFileSync('npx', ['eslint', ...lintFiles], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message;
    process.stderr.write(`[VCW] ESLint errors in ${root}:\n${output}\n`);
  }
}

async function run(input) {
  try {
    const sessionId = (input?.session_id || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
    const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
    if (!fs.existsSync(accumFile)) return;

    const rawFiles = fs.readFileSync(accumFile, 'utf8').trim().split('\n').filter(Boolean);
    const files = deduplicateFiles(rawFiles).filter(f => fs.existsSync(f) && /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f));
    if (files.length === 0) return;

    const deadline = Date.now() + BUDGET_MS;
    const groups = groupByProjectRoot(files);

    // Format pass — one invocation per project root
    for (const [root, groupFiles] of Object.entries(groups)) {
      tryFormat(root, groupFiles, deadline);
    }

    // ESLint pass
    for (const [root, groupFiles] of Object.entries(groups)) {
      tryEslint(root, groupFiles, deadline);
    }

    // Typecheck pass — one tsc per tsconfig dir
    const tsConfigDirs = new Set(
      files
        .filter(f => /\.(ts|tsx)$/.test(f))
        .map(findTsConfigDir)
        .filter(Boolean)
    );
    for (const dir of tsConfigDirs) {
      tryTypecheck(dir, deadline);
    }

    // Clean up accumulator
    try { fs.unlinkSync(accumFile); } catch { /* ignore */ }
  } catch { /* non-blocking */ }
}

module.exports = { run, deduplicateFiles, groupByProjectRoot, tryEslint };
