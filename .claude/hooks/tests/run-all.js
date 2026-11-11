'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function collectTests(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'helpers') continue; // skip helpers dir
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTests(full));
    } else if (entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

const testsDir = path.join(__dirname);
const files = collectTests(testsDir);

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

console.log(`\nRunning ${files.length} test file(s)...\n`);

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const result = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    env: process.env,
  });

  // node:test uses exit code as pass/fail signal
  const passed = result.status === 0 ? 1 : 0;
  const failed = result.status !== 0 ? 1 : 0;
  totalPassed += passed;
  totalFailed += failed;

  if (failed) {
    failures.push({ file: rel, stdout: result.stdout, stderr: result.stderr });
    console.log(`  ✗ ${rel}`);
  } else {
    console.log(`  ✓ ${rel}`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`Passed: ${totalPassed}, Failed: ${totalFailed}`);
console.log('─'.repeat(60));

if (failures.length > 0) {
  console.log('\nFailure details:\n');
  for (const f of failures) {
    console.log(`--- ${f.file} ---`);
    if (f.stdout) console.log(f.stdout);
    if (f.stderr) process.stderr.write(f.stderr);
  }
  process.exit(1);
}
