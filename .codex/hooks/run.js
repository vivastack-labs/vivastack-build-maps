'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');
const SHARED = path.join(REPO, '.claude/hooks');
const ALL = ['minimal', 'standard', 'strict'];
const STANDARD = ['standard', 'strict'];

// apply_patch can change several files, including a rename's source and target.
function patchPaths(command) {
  const paths = [];
  for (const line of command.split('\n')) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/);
    if (match) paths.push(match[1].trimEnd());
  }
  return [...new Set(paths)];
}

function editPaths(input) {
  const args = input.tool_input || {};
  return input.tool_name === 'apply_patch'
    ? patchPaths(args.command || '')
    : [args.file_path || args.path].filter(Boolean);
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}

async function run(input) {
  // Set before loading shared modules. Never use an external Claude plugin path.
  process.env.VCW_PLUGIN_ROOT = path.join(REPO, '.claude');
  const { statePath, atomicWrite, readJSON } = require('./state');
  const { isHookEnabled } = require('../../.claude/hooks/lib/hook-flags');
  const { sanitize } = require('../../.claude/hooks/lib/sanitize');
  const cwd = path.resolve(input.cwd || REPO);
  process.chdir(cwd);
  const event = input.hook_event_name;
  const session = createHash('sha256').update(String(input.session_id || 'default')).digest('hex').slice(0, 24);
  const localInput = { ...input, session_id: session };
  const messages = [];
  let blocked;

  async function shared(id, script, payload = localInput, profiles = STANDARD) {
    if (!isHookEnabled(id, profiles)) return;
    const result = await require(path.join(SHARED, 'scripts', `${script}.js`)).run(payload);
    if (result?.decision === 'block') blocked = result.reason;
  }

  function filesForSession(kind = 'files') {
    try {
      return [...new Set(fs.readFileSync(statePath('tmp', `${session}-${kind}.txt`), 'utf8')
        .split('\n').filter(Boolean))];
    } catch { return []; }
  }

  function saveSession() {
    if (!isHookEnabled('vcw:stop:session-end', STANDARD)) return;
    const summary = {
      session, updated: new Date().toISOString(), branch: git(cwd, ['branch', '--show-current']),
      files: filesForSession().map(file => path.relative(REPO, file)),
    };
    atomicWrite(statePath('sessions', `${session}.json`), summary);
  }

  async function audio(hookEvent = event) {
    await shared(`codex:audio:${event}`, 'play-audio', { ...localInput, hook_event_name: hookEvent }, ALL);
  }

  if (event === 'SessionStart') {
    if (isHookEnabled('vcw:session:start', ALL)) {
      messages.push(`Branch: ${git(cwd, ['branch', '--show-current'])}`);
      messages.push(`Latest commit: ${git(cwd, ['log', '-1', '--oneline'])}`);
      messages.push(`Working tree:\n${git(cwd, ['status', '--short']) || 'clean'}`);
      fs.mkdirSync(path.join(__dirname, 'state/sessions'), { recursive: true });
      const summaries = fs.readdirSync(path.join(__dirname, 'state/sessions')).filter(file => file.endsWith('.json'))
        .map(file => readJSON(statePath('sessions', file))).filter(Boolean)
        .sort((a, b) => b.updated.localeCompare(a.updated));
      if (summaries[0]) messages.push(`Previous hook activity (file paths only): ${JSON.stringify(summaries[0])}`);
      messages.push('UI rules: AGENTS.md / docs/design-system.md.');
    }
    await audio();
  } else if (event === 'PreToolUse') {
    if (input.tool_name === 'Bash') {
      await shared('vcw:pre:bash:block-no-verify', 'block-no-verify', localInput, ALL);
      await shared('project:pre:bash:block-force-push', 'block-force-push');
      await shared('project:pre:bash:gitleaks', 'gitleaks');
      await shared('vcw:pre:bash:commit-quality', 'commit-quality', localInput, ['strict']);
    } else if (/^(apply_patch|Edit|Write|MultiEdit)$/.test(input.tool_name || '')) {
      for (const file of editPaths(input)) {
        await shared('vcw:pre:edit:config-protection', 'config-protection', {
          ...localInput, tool_input: { file_path: file },
        }, ALL);
        if (blocked) break;
      }
    }
  } else if (event === 'PostToolUse') {
    if (isHookEnabled('vcw:post:activity-tracker', STANDARD)) {
      fs.appendFileSync(statePath('metrics', 'tool-usage.jsonl'), JSON.stringify({
        ts: new Date().toISOString(), tool: input.tool_name || 'unknown', session,
      }) + '\n');
    }
    if (input.tool_name === 'Bash') {
      if (isHookEnabled('vcw:post:bash:command-log', STANDARD)) {
        fs.appendFileSync(statePath('bash-commands.log'),
          `[${new Date().toISOString()}] ${sanitize(input.tool_input?.command || '')}\n`);
      }
      await shared('vcw:post:bash:pr-created', 'pr-created');
    }
    for (const file of editPaths(input)) {
      const absolute = path.resolve(cwd, file);
      // Quality checks only read files in this repository, including symlink targets.
      if (!fs.existsSync(absolute)) continue;
      const real = fs.realpathSync(absolute);
      if (!real.startsWith(REPO + path.sep) || !fs.statSync(real).isFile()) continue;
      if (isHookEnabled('vcw:post:edit:accumulator', STANDARD)) {
        fs.appendFileSync(statePath('tmp', `${session}-files.txt`), absolute + '\n');
        fs.appendFileSync(statePath('tmp', `${session}-pending.txt`), absolute + '\n');
      }
      const payload = { ...localInput, tool_input: { file_path: absolute } };
      await shared('vcw:post:edit:quality-gate', 'quality-gate', payload);
      await shared('vcw:post:edit:console-warn', 'console-warn', payload);
    }
  } else if (event === 'Stop') {
    // Reuse advisory checks; never invoke npx or download a formatter at Stop.
    if (!input.stop_hook_active) {
      const files = filesForSession('pending').filter(file => fs.existsSync(file));
      const checks = [
        ['project:stop:format-yaml', /\.(yml|yaml)$/, 'yamllint'],
        ['project:stop:format-markdown', /\.md$/, 'markdownlint-cli2'],
        ['project:stop:shellcheck', /\.sh$/, 'shellcheck'],
      ];
      for (const [id, extension, command] of checks) {
        const targets = files.filter(file => extension.test(file));
        if (!targets.length || !isHookEnabled(id, STANDARD)) continue;
        try {
          const output = execFileSync(command, targets, {
            cwd: REPO, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'],
          });
          if (output.trim()) messages.push(`${command}: ${output.trim()}`);
        } catch (error) { messages.push(`${command}: ${error.stdout || ''}${error.stderr || error.message}`); }
      }
      if (isHookEnabled('vcw:stop:format-typecheck', STANDARD)) {
        for (const file of files.filter(file => /\.(js|mjs|cjs)$/.test(file))) {
          try {
            execFileSync(process.execPath, ['--check', file], {
              cwd: REPO, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
            });
          } catch (error) { messages.push(String(error.stderr || error.message)); }
        }
      }
      fs.rmSync(statePath('tmp', `${session}-pending.txt`), { force: true });
    }
    saveSession();
    await audio();
  } else if (event === 'PreCompact') {
    saveSession();
    if (isHookEnabled('vcw:compact:pre', STANDARD)) {
      fs.appendFileSync(statePath('sessions', 'compaction.log'),
        `[${new Date().toISOString()}] Context compaction triggered\n`);
    }
    await audio();
  } else if (event === 'SessionEnd') {
    saveSession();
  } else if (event === 'PostCompact' || event === 'PermissionRequest') {
    await audio();
  }

  // Codex does not add successful hooks' stderr to model context. Capture it below.
  const feedback = sanitize(messages.join('\n')).slice(0, 12000);
  if (blocked && event === 'PreToolUse') {
    return { hookSpecificOutput: {
      hookEventName: event, permissionDecision: 'deny', permissionDecisionReason: sanitize(blocked),
    } };
  }
  if (!feedback) return {};
  return event === 'Stop'
    ? { systemMessage: feedback }
    : { hookSpecificOutput: { hookEventName: event, additionalContext: feedback } };
}

async function main() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error('Hook input exceeds 1 MiB');
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const warnings = [];
  const write = process.stderr.write;
  process.stderr.write = function (chunk) { warnings.push(String(chunk)); return true; };
  let result;
  try { result = await run(input); } finally { process.stderr.write = write; }
  if (warnings.length) {
    const { sanitize } = require('../../.claude/hooks/lib/sanitize');
    const warning = sanitize(warnings.join('')).slice(0, 8000);
    if (['SessionStart', 'PreToolUse', 'PostToolUse'].includes(input.hook_event_name)) {
      result.hookSpecificOutput ||= { hookEventName: input.hook_event_name };
      result.hookSpecificOutput.additionalContext = [result.hookSpecificOutput.additionalContext, warning].filter(Boolean).join('\n');
    } else if (input.hook_event_name !== 'SessionEnd') {
      result.systemMessage = [result.systemMessage, warning].filter(Boolean).join('\n');
    }
  }
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main().catch(error => {
    // A malformed input or broken adapter must not silently skip a pre-tool guard.
    process.stderr.write(`[Codex hooks] ${error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = { patchPaths, editPaths };
