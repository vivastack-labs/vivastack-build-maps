'use strict';

async function run(input) {
  const output = String(input?.tool_response?.output || '');
  const m = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if (m) {
    process.stderr.write(`[VCW] PR created: ${m[0]}\nReview with: gh pr review ${m[0]}\n`);
  }
}

module.exports = { run };
