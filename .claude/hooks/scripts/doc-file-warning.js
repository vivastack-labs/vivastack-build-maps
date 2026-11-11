'use strict';

const ADHOC_NAMES = /^(NOTES|TODO|SCRATCH|TEMP|DRAFT|WIP|FIXME|HACK)\.(md|txt)$/i;
const ALLOWED_DIRS = ['docs/', '.claude/', 'skills/', 'commands/', '.github/'];

async function run(input) {
  const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
  const base = filePath.split('/').pop();
  if (ADHOC_NAMES.test(base) && !ALLOWED_DIRS.some(d => filePath.includes(d))) {
    process.stderr.write(`[VCW] Warning: "${base}" looks like an ad-hoc scratch file. Consider placing it in docs/ or .claude/ instead.\n`);
  }
  return null;
}

module.exports = { run };
