'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function run(input) {
  try {
    const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
    if (!filePath) return;
    // Skip JS/TS — format-typecheck handles those at Stop
    if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath)) return;

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);
      } catch (err) {
        process.stderr.write(`[VCW] Quality gate (.json): ${err.message}\n`);
      }
      return;
    }

    const linterMap = {
      '.md': ['markdownlint-cli2', [filePath]],
      '.go': ['gofmt', ['-l', filePath]],
      '.py': ['ruff', ['check', filePath]],
    };

    const command = linterMap[ext];
    if (!command) return;
    const [cmd, args] = command;

    try {
      const output = execFileSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
      if (output && output.trim()) {
        process.stderr.write(`[VCW] Quality gate (${ext}): ${output.trim()}\n`);
      }
    } catch (err) {
      // linter found issues (non-zero exit) — report via stderr
      const output = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message;
      process.stderr.write(`[VCW] Quality gate (${ext}): ${output.trim()}\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
