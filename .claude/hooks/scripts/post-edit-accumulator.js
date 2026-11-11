'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');

async function run(input) {
  try {
    const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
    if (!filePath || !/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath)) return;

    const sessionId = (input?.session_id || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
    const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
    fs.appendFileSync(accumFile, filePath + '\n', 'utf8');
  } catch { /* non-blocking */ }
}

module.exports = { run };
