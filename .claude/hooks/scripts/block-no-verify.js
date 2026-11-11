'use strict';

const BLOCKED = [/--no-verify/, /\s-n(\s|$)/, /^-n(\s|$)/, /core\.hooksPath\s*=/];

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s/.test(cmd)) return null;
  for (const re of BLOCKED) {
    if (re.test(cmd)) {
      return {
        decision: 'block',
        reason: '[VCW] Bypassing git hooks is not allowed.\nFix the underlying issue instead of skipping verification.',
      };
    }
  }
  return null;
}

module.exports = { run };
