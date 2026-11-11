'use strict';
const { execSync } = require('child_process');
const { sanitize } = require('../lib/sanitize');

const COMMIT_MSG_RE = /-m\s+["']([^"']+)["']/;
const CONVENTIONAL_RE = /^(feat|fix|refactor|docs|test|chore|perf|ci)(\(.+\))?!?:\s.+/;
const SECRET_RE = /(password|passwd|secret|token|api_?key)\s*[=:]\s*\S+/i;

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s+commit\b/.test(cmd)) return null;

  // Validate commit message format if -m flag present
  const msgMatch = cmd.match(COMMIT_MSG_RE);
  if (msgMatch) {
    const msg = msgMatch[1];
    if (!CONVENTIONAL_RE.test(msg)) {
      return {
        decision: 'block',
        reason: `[VCW] Commit message does not follow conventional commit format.\nExpected: <type>(<scope>): <description>\nTypes: feat, fix, refactor, docs, test, chore, perf, ci\nGot: "${msg}"`,
      };
    }
    if (SECRET_RE.test(msg)) {
      return {
        decision: 'block',
        reason: '[VCW] Commit message appears to contain a secret. Remove sensitive data before committing.',
      };
    }
  }

  // Scan staged content for console.log and debugger
  try {
    const diff = execSync('git diff --cached', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const hasConsoleLog = addedLines.some(l => /console\.log\s*\(/.test(l));
    const hasDebugger = addedLines.some(l => /\bdebugger\b/.test(l));
    if (hasConsoleLog || hasDebugger) {
      const items = [hasConsoleLog && 'console.log', hasDebugger && 'debugger'].filter(Boolean).join(', ');
      return {
        decision: 'block',
        reason: `[VCW] Staged changes contain debug code: ${items}.\nRemove before committing, or disable this check with VCW_DISABLED_HOOKS=vcw:pre:bash:commit-quality.`,
      };
    }
  } catch { /* git diff failed or no staged changes */ }

  return null;
}

module.exports = { run };
