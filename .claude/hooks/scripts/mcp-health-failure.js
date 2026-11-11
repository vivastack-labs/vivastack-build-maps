'use strict';
const { statePath, readJSON, atomicWrite } = require('../lib/state');

const BACKOFF_DURATIONS = {
  auth_error: 5 * 60 * 1000,       // 5 min
  rate_limit: 2 * 60 * 1000,       // 2 min
  transport_error: 30 * 1000,      // 30 sec
  server_error: 60 * 1000,         // 1 min
};

function classifyError(output) {
  const s = String(output || '').toLowerCase();
  if (/401|403|unauthorized|forbidden/.test(s)) return 'auth_error';
  if (/429|rate.?limit/.test(s)) return 'rate_limit';
  if (/503|502|connection|transport/.test(s)) return 'transport_error';
  return 'server_error';
}

function serverName(toolName) {
  const m = toolName.match(/^mcp_([^_]+(?:_[^_]+)*?)(?:__|_)[^_]/);
  return m ? m[1] : toolName;
}

async function run(input) {
  const toolName = input?.tool_name || '';
  if (!toolName.startsWith('mcp_')) return;

  const reason = classifyError(input?.tool_response?.output || input?.error);
  const backoff = BACKOFF_DURATIONS[reason] || BACKOFF_DURATIONS.server_error;

  const cacheFile = statePath('mcp-health-cache.json');
  const cache = readJSON(cacheFile, {});
  const server = serverName(toolName);

  cache[server] = { unhealthyUntil: Date.now() + backoff, reason };
  atomicWrite(cacheFile, cache);

  process.stderr.write(`[VCW] MCP server "${server}" marked unhealthy (${reason}). Backoff: ${backoff / 1000}s.\n`);
}

module.exports = { run };
