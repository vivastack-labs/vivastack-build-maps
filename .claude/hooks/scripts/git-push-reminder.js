'use strict';

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (/^\s*git\s+push\b/.test(cmd)) {
    process.stderr.write('[VCW] Reminder: review your changes before pushing.\n');
  }
  return null;
}

module.exports = { run };
