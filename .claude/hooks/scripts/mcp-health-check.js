'use strict';
const { statePath, readJSON, atomicWrite } = require('../lib/state');

function serverName(toolName) {
  // Tool name format: mcp_<server>__<tool> or mcp_<server>_<tool>
  const m = toolName.match(/^mcp_([^_]+(?:_[^_]+)*?)(?:__|_)[^_]/);
  return m ? m[1] : toolName;
}

async function run(input) {
  const toolName = input?.tool_name || '';
  if (!toolName.startsWith('mcp_')) return null;

  const cacheFile = statePath('mcp-health-cache.json');
  const cache = readJSON(cacheFile, {});
  const server = serverName(toolName);
  const entry = cache[server];

  if (entry && entry.unhealthyUntil > Date.now()) {
    const remaining = Math.ceil((entry.unhealthyUntil - Date.now()) / 1000);
    return {
      decision: 'block',
      reason: `[VCW] MCP server "${server}" is unhealthy (${entry.reason}). Blocked for ${remaining}s more. Retry after backoff expires.`,
    };
  }

  // Clean expired entry
  if (entry && entry.unhealthyUntil <= Date.now()) {
    delete cache[server];
    atomicWrite(cacheFile, cache);
  }

  return null;
}

module.exports = { run };
