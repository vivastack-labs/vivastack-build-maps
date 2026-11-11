'use strict';

// Matches --force or -f but NOT --force-with-lease or --force-if-includes
const FORCE_RE = /(?:^|\s)(?:--force(?!-with-lease|-if-includes|[-\w])|-f(?=\s|$))/;

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s/.test(cmd)) return null;
  if (!/push/.test(cmd)) return null;

  if (FORCE_RE.test(cmd)) {
    return {
      decision: 'block',
      reason:
        '[VCW] Force-push is blocked — it can overwrite teammates\' commits.\n' +
        'Use --force-with-lease instead: git push --force-with-lease',
    };
  }
  return null;
}

module.exports = { run };
