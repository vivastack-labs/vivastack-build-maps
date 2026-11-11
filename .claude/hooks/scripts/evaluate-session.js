// plugins/vivastack-core/hooks/scripts/evaluate-session.js
'use strict';

async function run(input) {
  try {
    const msgCount = input?.message_count || 0;
    if (msgCount >= 10) {
      process.stderr.write(`[VCW] Session has ${msgCount} messages — eligible for pattern extraction if you want to capture learnings.\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
