'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const { statePath } = require('../lib/state');

async function run(input) {
  try {
    const sessionId = (input?.session_id || 'default').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
    const accumFile = statePath('tmp', `vcw-edited-${sessionId}.txt`);
    if (!fs.existsSync(accumFile)) return;

    const rawFiles = fs.readFileSync(accumFile, 'utf8').trim().split('\n').filter(Boolean);
    const yamlFiles = rawFiles.filter(f => fs.existsSync(f) && /\.(yml|yaml)$/.test(f));
    if (yamlFiles.length === 0) return;

    try {
      execFileSync('yamllint', yamlFiles, { encoding: 'utf8', timeout: 30_000 });
    } catch (err) {
      const output = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message;
      process.stderr.write(`[VCW] yamllint errors:\n${output}\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
