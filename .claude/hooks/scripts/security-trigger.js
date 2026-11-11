'use strict';
const { execSync } = require('child_process');

const PATTERNS = /auth|login|logout|session|token|jwt|passw|credential|oauth|\.db[^a-z]|query|\.sql|migrat|schema|upload|download|readFile|writeFile|createReadStream|createWriteStream|fetch\(|axios|httpClient|apiKey|api_key|ANTHROPIC_API_KEY|secret|crypto\.|encrypt|decrypt|bcrypt|hash\(/i;

function buildFlaggedList(files, getDiff) {
  const flagged = [];
  for (const file of files) {
    if (PATTERNS.test(file)) {
      flagged.push(`  - ${file}  [filename]`);
      continue;
    }
    try {
      const diff = getDiff(file);
      if (PATTERNS.test(diff)) flagged.push(`  - ${file}  [content]`);
    } catch { /* skip */ }
  }
  return flagged;
}

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s+(commit|push)/.test(cmd)) return null;
  if (process.env.SECURITY_REVIEWED === '1') return null;

  let stagedFiles;
  try {
    stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }

  if (!stagedFiles) return null;

  const getDiff = (file) => execSync(`git diff --cached -- ${JSON.stringify(file)}`, { encoding: 'utf8' });
  const flagged = buildFlaggedList(stagedFiles.split('\n').filter(Boolean), getDiff);

  if (flagged.length === 0) return null;

  return {
    decision: 'block',
    reason: [
      'SECURITY TRIGGER: Security-sensitive changes detected.',
      '',
      ...flagged,
      '',
      'ACTION REQUIRED:',
      '  Use the security-reviewer agent to review these changes before committing.',
      '  After review, run: export SECURITY_REVIEWED=1',
    ].join('\n'),
  };
}

module.exports = { run, PATTERNS, buildFlaggedList };
