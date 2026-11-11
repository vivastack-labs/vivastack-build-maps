'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

// Scan from the project root with a relative source (`.`) so that the
// root-anchored allowlist paths in .gitleaks.toml (e.g. ^dist/) match the
// project's own build outputs, not an ancestor directory of the clone.
function detectSecrets(_spawn = spawnSync, root = process.cwd()) {
  return _spawn('gitleaks', ['detect', '--no-git', '--source', '.', '-c', path.join(root, '.gitleaks.toml')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

async function run(input, _spawn = spawnSync) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s+(commit|push)/.test(cmd)) return null;

  const result = detectSecrets(_spawn, projectRoot(input));
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
