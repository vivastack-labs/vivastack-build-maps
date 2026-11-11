'use strict';

const LONG_RUNNING = [
  /\bnpm\s+test\b/, /\bvitest\b/, /\bpytest\b/, /\bcargo\s+build\b/,
  /\bdocker\s+build\b/, /\bplaywright\b/, /\bcypress\b/, /\bjest\b/,
];

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (LONG_RUNNING.some(re => re.test(cmd))) {
    process.stderr.write('[VCW] Tip: consider running long commands in a tmux session to avoid blocking.\n');
  }
  return null;
}

module.exports = { run };
