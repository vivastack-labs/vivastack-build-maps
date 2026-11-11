'use strict';

const BUILD_PATTERNS = [/\bnpm\s+run\s+build\b/, /\bpnpm\s+build\b/, /\bcargo\s+build\b/, /\bgo\s+build\b/];

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (BUILD_PATTERNS.some(re => re.test(cmd))) {
    const exitCode = input?.tool_response?.exit_code ?? 0;
    const status = exitCode === 0 ? 'succeeded' : `failed (exit ${exitCode})`;
    process.stderr.write(`[VCW] Build ${status}: ${cmd.trim()}\n`);
  }
}

module.exports = { run };
