'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function getCounterFile(sessionId) {
  const dir = path.join(os.homedir(), '.claude', 'vivastack', 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const key = (sessionId || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
  return path.join(dir, `compact-counter-${key}.txt`);
}

async function run(input) {
  const sessionId = input?.session_id || 'default';
  const file = getCounterFile(sessionId);

  let count = 0;
  try { count = parseInt(fs.readFileSync(file, 'utf8').trim(), 10) || 0; } catch { /* first call */ }
  count += 1;
  fs.writeFileSync(file, String(count), 'utf8');

  if (count === 50 || (count > 50 && (count - 50) % 25 === 0)) {
    process.stderr.write(`[VCW] This session has ${count} tool calls. Consider running /compact to checkpoint context.\n`);
  }

  return null;
}

module.exports = { run };
