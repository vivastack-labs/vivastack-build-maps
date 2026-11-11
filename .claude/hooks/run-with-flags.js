'use strict';
const fs = require('fs');
const path = require('path');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOKS_LOG_RETAIN_DAYS = 7;

function writeHooksLog(hookId, input) {
  if (!isHookEnabled('vcw:hooks-log', ['standard', 'strict'])) return;
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
    const logsDir = path.join(projectDir, '.claude', 'hooks', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      timestamp: new Date().toISOString(),
      hook_id: hookId,
      hook_event_name: input?.hook_event_name ?? null,
      tool_name: input?.tool_name ?? null,
      tool_use_id: input?.tool_use_id ?? null,
      tool_input: input?.tool_input ?? null,
      invoked_by_agent: input?.invoked_by_agent ?? null,
    };
    fs.appendFileSync(path.join(logsDir, `hooks-log-${today}.jsonl`), JSON.stringify(entry) + '\n', 'utf8');

    // purge files older than HOOKS_LOG_RETAIN_DAYS
    const cutoff = Date.now() - HOOKS_LOG_RETAIN_DAYS * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(logsDir)) {
      if (!/^hooks-log-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
      const filePath = path.join(logsDir, file);
      if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
  } catch { /* non-blocking */ }
}

const [,, hookId, scriptPath, profilesCsv] = process.argv;

async function main() {
  // Read stdin (cap at 1 MB)
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    total += chunk.length;
    if (total >= 1024 * 1024) {
      process.stderr.write(`[VCW] Warning: stdin truncated at 1MB for hook ${hookId}\n`);
      break;
    }
  }
  const rawInput = Buffer.concat(chunks).toString('utf8');

  // Profile gate
  const profiles = profilesCsv ? profilesCsv.split(',').map(p => p.trim()) : ['minimal', 'standard', 'strict'];
  if (!isHookEnabled(hookId, profiles)) process.exit(0);

  // Path traversal guard
  const pluginRoot = process.env.VCW_PLUGIN_ROOT;
  const resolvedScriptPath = pluginRoot && scriptPath
    ? path.resolve(path.resolve(pluginRoot), scriptPath)
    : path.resolve(scriptPath);
  if (pluginRoot && scriptPath) {
    const root = path.resolve(pluginRoot);
    if (!resolvedScriptPath.startsWith(root + path.sep) && resolvedScriptPath !== root) {
      process.stderr.write(`[VCW] Error: path traversal blocked for ${scriptPath}\n`);
      process.exit(0);
    }
  }

  let input = {};
  try { input = JSON.parse(rawInput || '{}'); } catch { /* non-JSON stdin is fine */ }

  writeHooksLog(hookId, input);

  // In-process invocation
  try {
    const hook = require(resolvedScriptPath);
    if (typeof hook.run !== 'function') {
      process.stderr.write(`[VCW] Hook ${hookId} has no run() export\n`);
      process.exit(0);
    }
    const result = await hook.run(input);
    if (result != null) process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[VCW] Hook error (${hookId}): ${err.message}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  process.stderr.write(`[VCW] Fatal (${hookId}): ${err.message}\n`);
  process.exit(0);
});
