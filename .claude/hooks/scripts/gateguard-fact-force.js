'use strict';
const { statePath, atomicWrite, readJSON } = require('../lib/state');

const MAX_ENTRIES = 500;
const TIMEOUT_MS = 30 * 60 * 1000;

const DESTRUCTIVE = [
  /rm\s+-[a-z]*r[a-z]*f/i,
  /git\s+reset\s+--hard/,
  /git\s+push\s+--force/,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  />\s*\/dev\/sd[a-z]/,
  /\bmkfs\./,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
];

function sessionKey(input) {
  const id = input?.session_id || process.env.CLAUDE_SESSION_ID || 'default';
  return id.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
}

function loadState(file) {
  const data = readJSON(file, { entries: {} });
  const now = Date.now();
  for (const k of Object.keys(data.entries)) {
    if (now - data.entries[k] > TIMEOUT_MS) delete data.entries[k];
  }
  return data;
}

function saveState(file, state) {
  const keys = Object.keys(state.entries);
  if (keys.length > MAX_ENTRIES) {
    const byAge = keys.sort((a, b) => state.entries[a] - state.entries[b]);
    for (const k of byAge.slice(0, keys.length - MAX_ENTRIES)) delete state.entries[k];
  }
  atomicWrite(file, state);
}

async function run(input) {
  const tool = input?.tool_name || '';
  const toolInput = input?.tool_input || {};
  const key = sessionKey(input);
  const stateFile = statePath('gateguard', `state-${key}.json`);
  const state = loadState(stateFile);

  let gateKey;
  let isFile = false;
  let filePath = '';

  if (tool === 'Bash' || tool === 'bash') {
    const cmd = toolInput.command || '';
    if (!DESTRUCTIVE.some(re => re.test(cmd))) return null;
    gateKey = 'bash:destructive';
  } else {
    filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath) return null;
    gateKey = `file:${filePath}`;
    isFile = true;
  }

  if (state.entries[gateKey]) return null;

  state.entries[gateKey] = Date.now();
  saveState(stateFile, state);

  const reason = isFile
    ? `[VCW Fact-Forcing Gate]\nBefore editing ${filePath}, present these facts:\n  1. List ALL files that import/require this file (use Grep)\n  2. List the public functions/classes/exports affected\n  3. Quote the user's current instruction verbatim\nPresent the facts, then retry the same operation.`
    : `[VCW Fact-Forcing Gate]\nBefore running this destructive command, present these facts:\n  1. List all files/data affected\n  2. Confirm this is reversible or state the recovery path\n  3. Quote the user's current instruction verbatim\nPresent the facts, then retry the same operation.`;

  return { decision: 'block', reason };
}

module.exports = { run };
