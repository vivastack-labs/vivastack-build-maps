'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { repositoryFile, checkFiles } = require('./checks');
const { createState } = require('./state');

const REPO = path.resolve(__dirname, '../..');
const SHARED = path.join(REPO, '.claude/hooks');
const ALL = ['minimal', 'standard', 'strict'];
const STANDARD = ['standard', 'strict'];

/** apply_patch の追加・更新・削除・移動元と移動先をすべて取り出す。 */
function patchPaths(command) {
  const paths = [];
  for (const line of command.split('\n')) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/);
    if (match) paths.push(match[1].trimEnd());
  }
  return [...new Set(paths)];
}

/** 編集ツールだけを対象に変更パスを取り出す。MCP 等の path 引数は読まない。 */
function editPaths(input) {
  const args = input.tool_input || {};
  if (input.tool_name === 'apply_patch') return patchPaths(args.command || '');
  if (input.tool_name === 'MultiEdit') return (args.edits || []).flatMap(edit => [edit.file_path || args.file_path].filter(Boolean));
  return /^(Edit|Write)$/.test(input.tool_name || '') ? [args.file_path || args.path].filter(Boolean) : [];
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

async function run(input, repo) {
  // Set before loading shared modules. Never use an external Claude plugin path.
  process.env.VCW_PLUGIN_ROOT = path.join(repo, '.claude');
  process.env.CLAUDE_PROJECT_DIR = repo;
  process.env.PATH = [path.join(repo, 'node_modules/.bin'), process.env.PATH].filter(Boolean).join(path.delimiter);
  const { statePath, atomicWrite, readJSON } = createState(path.join(repo, '.codex/hooks/state'));
  const { isHookEnabled } = require('../../.claude/hooks/lib/hook-flags');
  const { sanitize } = require('../../.claude/hooks/lib/sanitize');
  const cwd = path.resolve(input.cwd || repo);
  process.chdir(cwd);
  const event = input.hook_event_name;
  const session = createHash('sha256')
    .update(String(input.session_id || 'default'))
    .digest('hex')
    .slice(0, 24);
  const localInput = { ...input, session_id: session, tool_response: typeof input.tool_response === 'string' ? { output: input.tool_response } : input.tool_response };
  const messages = [];
  let blocked;

  async function shared(id, script, payload = localInput, profiles = STANDARD) {
    if (blocked || !isHookEnabled(id, profiles)) return;
    const result = await require(path.join(SHARED, 'scripts', `${script}.js`)).run(payload);
    if (result?.decision === 'block') {
      blocked = script === 'security-trigger'
        ? result.reason.replaceAll('node .claude/hooks/scripts/mark-security-reviewed.js', 'node .codex/hooks/mark-security-reviewed.js')
        : result.reason;
    }
  }

  function filesForSession(kind = 'files') {
    try {
      return [
        ...new Set(
          fs
            .readFileSync(statePath('tmp', `${session}-${kind}.txt`), 'utf8')
            .split('\n')
            .filter(Boolean)
        )
      ];
    } catch {
      return [];
    }
  }

  function saveSession() {
    if (!isHookEnabled('vcw:stop:session-end', STANDARD)) return;
    const summary = {
      session,
      updated: new Date().toISOString(),
      branch: git(cwd, ['branch', '--show-current']),
      files: filesForSession().map(file => path.relative(repo, file))
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
      const sessions = statePath('sessions');
      fs.mkdirSync(sessions, { recursive: true });
      const summaries = fs
        .readdirSync(sessions)
        .filter(file => file.endsWith('.json'))
        .map(file => readJSON(statePath('sessions', file)))
        .filter(summary => typeof summary?.updated === 'string' && Array.isArray(summary.files))
        .sort((a, b) => b.updated.localeCompare(a.updated));
      if (summaries[0]) messages.push(`Previous hook activity (file paths only): ${JSON.stringify(summaries[0])}`);
      messages.push('開発規約: AGENTS.md / docs/development-overview.md。');
    }
    await audio();
  } else if (event === 'PreToolUse') {
    if (input.tool_name === 'Bash') {
      await shared('vcw:pre:bash:block-no-verify', 'block-no-verify', localInput, ALL);
      await shared('project:pre:bash:block-force-push', 'block-force-push');
      await shared('project:pre:bash:gitleaks', 'gitleaks');
      await shared('project:pre:bash:security-trigger', 'security-trigger');
      await shared('vcw:pre:bash:commit-quality', 'commit-quality', localInput, ['strict']);
    } else if (/^(apply_patch|Edit|Write|MultiEdit)$/.test(input.tool_name || '')) {
      for (const file of editPaths(input)) {
        const absolute = path.resolve(cwd, file);
        const targets = [absolute];
        if (fs.existsSync(absolute)) targets.push(fs.realpathSync(absolute));
        for (const target of targets) {
          await shared(
            'vcw:pre:edit:config-protection',
            'config-protection',
            {
              ...localInput,
              tool_input: { file_path: target }
            },
            ALL
          );
        }
        if (blocked) break;
      }
    }
  } else if (event === 'PostToolUse') {
    if (isHookEnabled('vcw:post:activity-tracker', STANDARD)) {
      fs.appendFileSync(
        statePath('metrics', 'tool-usage.jsonl'),
        JSON.stringify({
          ts: new Date().toISOString(),
          tool: input.tool_name || 'unknown',
          session
        }) + '\n'
      );
    }
    if (input.tool_name === 'Bash') {
      if (isHookEnabled('vcw:post:bash:command-log', STANDARD)) {
        fs.appendFileSync(statePath('bash-commands.log'), `[${new Date().toISOString()}] ${sanitize(input.tool_input?.command || '')}\n`);
      }
      await shared('vcw:post:bash:pr-created', 'pr-created');
      // 開始しただけの非同期コマンドを、ビルド成功として通知しない。
      if (Number.isInteger(localInput.tool_response?.exit_code)) {
        await shared('vcw:post:bash:build-complete', 'build-complete');
      }
    }
    for (const file of editPaths(input)) {
      const absolute = repositoryFile(repo, path.resolve(cwd, file));
      if (!absolute) continue;
      if (isHookEnabled('vcw:post:edit:accumulator', STANDARD)) {
        fs.appendFileSync(statePath('tmp', `${session}-files.txt`), absolute + '\n');
        fs.appendFileSync(statePath('tmp', `${session}-pending.txt`), absolute + '\n');
      }
      const payload = { ...localInput, tool_input: { file_path: absolute } };
      await shared('vcw:post:edit:quality-gate', 'quality-gate', payload);
      await shared('vcw:post:edit:console-warn', 'console-warn', payload);
    }
  } else if (event === 'Stop') {
    // Claude の状態や資源を書き換えず、Codex が蓄積したファイルだけを検査する。
    if (!input.stop_hook_active) {
      messages.push(...checkFiles(repo, filesForSession('pending'), id => isHookEnabled(id, STANDARD)));
      fs.rmSync(statePath('tmp', `${session}-pending.txt`), { force: true });
    }
    saveSession();
    await audio();
  } else if (event === 'PreCompact') {
    saveSession();
    if (isHookEnabled('vcw:compact:pre', STANDARD)) {
      fs.appendFileSync(statePath('sessions', 'compaction.log'), `[${new Date().toISOString()}] Context compaction triggered\n`);
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
    return {
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: 'deny',
        permissionDecisionReason: sanitize(blocked)
      }
    };
  }
  if (!feedback) return {};
  return event === 'Stop' ? { systemMessage: feedback } : { hookSpecificOutput: { hookEventName: event, additionalContext: feedback } };
}

/** stdin の Codex イベントを処理し、結果を JSON で返す。保存先は既定でこのリポジトリ。 */
async function main(repo = REPO) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error('Hook input exceeds 1 MiB');
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.hook_event_name !== 'string') {
    throw new Error('Hook input must be an object with hook_event_name');
  }
  if (['PreToolUse', 'PostToolUse'].includes(input.hook_event_name)) {
    if (typeof input.tool_name !== 'string' || !input.tool_input || typeof input.tool_input !== 'object') {
      throw new Error('Tool hooks require tool_name and tool_input');
    }
    if (['Bash', 'apply_patch'].includes(input.tool_name) && typeof input.tool_input.command !== 'string') {
      throw new Error('Bash / apply_patch requires a string command');
    }
  }
  const warnings = [];
  const write = process.stderr.write;
  process.stderr.write = function (chunk) {
    warnings.push(String(chunk));
    return true;
  };
  let result;
  try {
    result = await run(input, repo);
  } finally {
    process.stderr.write = write;
  }
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

module.exports = { patchPaths, editPaths, main };
