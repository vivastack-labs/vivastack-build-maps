'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');
const { sanitize } = require('../lib/sanitize');

async function run(input) {
  try {
    const cmd = sanitize(input?.tool_input?.command || '');
    const ts = new Date().toISOString();
    const line = `[${ts}] ${cmd}\n`;
    fs.appendFileSync(statePath('bash-commands.log'), line, 'utf8');
  } catch { /* non-blocking */ }
}

module.exports = { run };
