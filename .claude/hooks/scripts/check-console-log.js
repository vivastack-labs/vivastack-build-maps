// plugins/vivastack-core/hooks/scripts/check-console-log.js
'use strict';
const { execSync } = require('child_process');

async function run(input) {
  try {
    const modifiedFiles = execSync(
      'git diff --name-only HEAD 2>/dev/null || true',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim().split('\n').filter(f => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f));

    const hits = [];
    for (const f of modifiedFiles) {
      try {
        const lines = require('fs').readFileSync(f, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (/console\.log\s*\(/.test(line)) hits.push(`${f}:${i + 1}`);
        });
      } catch { /* file may have been deleted */ }
    }

    if (hits.length > 0) {
      process.stderr.write(`[VCW] console.log found in modified files:\n${hits.slice(0, 10).map(h => `  ${h}`).join('\n')}\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
