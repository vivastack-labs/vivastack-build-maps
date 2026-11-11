'use strict';
const { execSync } = require('child_process');

const DEV_PATTERNS = [
  /^\s*npm\s+run\s+dev\b/,
  /^\s*npm\s+start\b/,
  /^\s*pnpm\s+(run\s+)?dev\b/,
  /^\s*yarn\s+(run\s+)?dev\b/,
  /^\s*bun\s+(run\s+)?dev\b/,
  /^\s*next\s+dev\b/,
  /^\s*vite(\s|$)/,
  /^\s*astro\s+dev\b/,
];

function hasTmux() {
  try { execSync('which tmux', { stdio: 'ignore' }); return true; } catch { return false; }
}

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!DEV_PATTERNS.some(re => re.test(cmd))) return null;
  if (!hasTmux()) return null;

  const sessionName = `vcw-dev-${Date.now()}`;
  const escaped = cmd.trim().replace(/'/g, "'\\''");
  const tmuxCmd = `tmux new-session -d -s ${sessionName} '${escaped}'`;

  return {
    decision: 'block',
    reason: `[VCW] Long-running dev server detected. Run in a detached tmux session instead:\n  ${tmuxCmd}\nThen attach with: tmux attach -t ${sessionName}`,
  };
}

module.exports = { run };
