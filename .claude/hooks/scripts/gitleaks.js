'use strict';
const { spawnSync } = require('child_process');

function detectSecrets(_spawn = spawnSync) {
  return _spawn('gitleaks', ['detect', '--no-git'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function run(input, _spawn = spawnSync) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s+(commit|push)/.test(cmd)) return null;

  const result = detectSecrets(_spawn);
  if (result.error) {
    process.stderr.write('[VCW] gitleaks not found, skipping secret scan\n');
    return null;
  }

  // Treat unknown-flag errors (e.g. unsupported CLI flags) as non-blocking
  if (result.stderr && result.stderr.includes('unknown flag')) {
    process.stderr.write('[VCW] gitleaks flag incompatibility, skipping secret scan\n');
    return null;
  }

  if (result.status !== 0) {
    return {
      decision: 'block',
      reason: '[VCW] gitleaks detected potential secrets in the repository.\nReview and remove secrets before committing.',
    };
  }

  return null;
}

module.exports = { run, detectSecrets };
