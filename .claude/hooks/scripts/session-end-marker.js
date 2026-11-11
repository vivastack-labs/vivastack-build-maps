'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');

async function run(input) {
  // Remove session lease file if it exists
  try {
    const sessionId = (input?.session_id || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
    const leaseFile = statePath('tmp', `lease-${sessionId}.json`);
    if (fs.existsSync(leaseFile)) fs.unlinkSync(leaseFile);
  } catch { /* ignore */ }
}

module.exports = { run };
