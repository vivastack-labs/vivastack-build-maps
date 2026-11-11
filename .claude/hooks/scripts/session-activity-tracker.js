'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');

async function run(input) {
  try {
    const row = {
      ts: new Date().toISOString(),
      tool: input?.tool_name || 'unknown',
      session: (input?.session_id || 'default').slice(0, 32),
    };
    fs.appendFileSync(statePath('metrics', 'tool-usage.jsonl'), JSON.stringify(row) + '\n', 'utf8');
  } catch { /* non-blocking */ }
}

module.exports = { run };
