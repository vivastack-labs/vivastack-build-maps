'use strict';
const fs = require('fs');

async function run(input) {
  try {
    const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
    if (!filePath || !/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath)) return;
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const matches = lines
      .map((l, i) => ({ line: i + 1, text: l }))
      .filter(({ text }) => /console\.log\s*\(/.test(text))
      .slice(0, 5);

    if (matches.length > 0) {
      const locs = matches.map(m => `  L${m.line}: ${m.text.trim()}`).join('\n');
      process.stderr.write(`[VCW] console.log found in ${filePath}:\n${locs}\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
