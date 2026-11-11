'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');

async function run(input) {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] Context compaction triggered\n`;
    fs.appendFileSync(statePath('sessions', 'compaction.log'), line, 'utf8');

    // Stamp into active session file if found
    const sessionId = (input?.session_id || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
    const sessionsDir = statePath('sessions');
    const sessionFiles = fs.readdirSync(sessionsDir)
      .filter(f => f.includes(sessionId) && f.endsWith('-session.tmp'));

    if (sessionFiles.length > 0) {
      const sessionFile = statePath('sessions', sessionFiles[0]);
      const stamp = `\n**[Compaction occurred at ${ts.slice(11, 19)}]** - Context was summarized\n`;
      fs.appendFileSync(sessionFile, stamp, 'utf8');
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
