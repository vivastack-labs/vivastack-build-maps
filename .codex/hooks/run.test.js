'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { patchPaths } = require('./run');
const REPO = path.resolve(__dirname, '../..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'costlens-hooks-'));
  const hooks = path.join(root, '.codex/hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'run.js'), path.join(hooks, 'run.js'));
  fs.copyFileSync(path.join(__dirname, 'state.js'), path.join(hooks, 'state.js'));
  fs.symlinkSync(path.join(REPO, '.claude'), path.join(root, '.claude'), 'dir');
  execFileSync('git', ['init', '-q', root]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function call(event, extra = {}, env = {}, raw) {
    const result = spawnSync(process.execPath, [path.join(hooks, 'run.js')], {
      cwd: root, encoding: 'utf8',
      input: raw ?? JSON.stringify({ cwd: root, session_id: 'test/session', hook_event_name: event, ...extra }),
      env: { ...process.env, VCW_HOOK_PROFILE: 'standard', VCW_DISABLED_HOOKS: '', ...env,
        // Prevent real audio playback in tests, while allowing explicit enable tests.
        ...(!('VCW_DISABLED_HOOKS' in env) ? { VCW_DISABLED_HOOKS: `codex:audio:${event}` } : {}),
      },
    });
    return { ...result, json: result.stdout ? JSON.parse(result.stdout) : null };
  }
  return { root, hooks, call };
}

test('patch parser covers add, update, delete and both rename paths', () => {
  assert.deepEqual(patchPaths('*** Begin Patch\n*** Add File: new file.js\n+x\n*** Update File: old.js\n*** Move to: moved.js\n@@\n*** Delete File: deleted.js\n*** End Patch'),
    ['new file.js', 'old.js', 'moved.js', 'deleted.js']);
});

for (const command of ['git commit --no-verify -m test', 'git push -f', 'git push --force']) {
  test(`Codex denies ${command} without executing it`, t => {
    const { call } = fixture(t);
    const { json, status } = call('PreToolUse', { tool_name: 'Bash', tool_input: { command } });
    assert.equal(status, 0);
    assert.equal(json.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(json.hookSpecificOutput.hookEventName, 'PreToolUse');
  });
}

test('safe Bash input and force-with-lease pass', t => {
  const { call } = fixture(t);
  for (const command of ['git status', 'git push --force-with-lease', 'node --version']) {
    assert.notEqual(call('PreToolUse', { tool_name: 'Bash', tool_input: { command } }).json
      .hookSpecificOutput?.permissionDecision, 'deny');
  }
});

test('all patch paths checked, including rename destination and deletion', t => {
  const { call } = fixture(t);
  for (const patch of [
    '*** Add File: okay.js\n+ok\n*** Update File: eslint.config.js',
    '*** Update File: source.js\n*** Move to: .prettierrc',
    '*** Delete File: biome.json',
  ]) {
    assert.equal(call('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch } })
      .json.hookSpecificOutput.permissionDecision, 'deny');
  }
});

test('profiles and explicit disabled IDs preserve Claude semantics', t => {
  const { call } = fixture(t);
  const force = { tool_name: 'Bash', tool_input: { command: 'git push --force' } };
  assert.deepEqual(call('PreToolUse', force, { VCW_HOOK_PROFILE: 'minimal' }).json, {});
  const bypass = { tool_name: 'Bash', tool_input: { command: 'git commit --no-verify' } };
  assert.deepEqual(call('PreToolUse', bypass, { VCW_DISABLED_HOOKS: 'vcw:pre:bash:block-no-verify' }).json, {});
  assert.equal(call('PreToolUse', bypass, { VCW_HOOK_PROFILE: 'minimal' })
    .json.hookSpecificOutput.permissionDecision, 'deny');
});

test('post-edit diagnostics become Codex context and track every file', t => {
  const { root, hooks, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'broken.json'), '{broken');
  fs.writeFileSync(path.join(root, 'script.js'), 'console.log("test");');
  const result = call('PostToolUse', { tool_name: 'apply_patch', tool_input: {
    command: '*** Update File: broken.json\n*** Add File: script.js',
  } });
  assert.equal(result.status, 0);
  assert.match(result.json.hookSpecificOutput.additionalContext, /Quality gate/);
  assert.match(result.json.hookSpecificOutput.additionalContext, /console.log/);
  const tmp = path.join(hooks, 'state/tmp');
  const files = fs.readFileSync(path.join(tmp, fs.readdirSync(tmp).find(file => file.endsWith('-files.txt'))), 'utf8');
  assert.match(files, /broken.json/);
  assert.match(files, /script.js/);
});

test('symlinks outside the repo are excluded from post-edit reads', t => {
  const { root, hooks, call } = fixture(t);
  fs.symlinkSync(path.join(REPO, 'package.json'), path.join(root, 'outside.json'));
  assert.deepEqual(call('PostToolUse', { tool_name: 'apply_patch', tool_input: {
    command: '*** Update File: outside.json',
  } }).json, {});
  assert.ok(!fs.existsSync(path.join(hooks, 'state/tmp')) ||
    !fs.readdirSync(path.join(hooks, 'state/tmp')).some(file => file.endsWith('-files.txt')));
});

test('Stop checks JS syntax, clears pending files and restores repo-local activity', t => {
  const { root, hooks, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'syntax.js'), 'const = ;');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Add File: syntax.js' } });
  const stop = call('Stop');
  assert.equal(stop.status, 0);
  assert.match(stop.json.systemMessage, /SyntaxError/);
  assert.equal(call('Stop').json.systemMessage, undefined);
  const start = call('SessionStart');
  assert.match(start.json.hookSpecificOutput.additionalContext, /syntax.js/);
  assert.ok(fs.readdirSync(path.join(hooks, 'state/sessions')).some(file => file.endsWith('.json')));
});

test('Bash logs mask secrets and state stays in Codex directory', t => {
  const { hooks, call } = fixture(t);
  call('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'echo password=example-value' } });
  const log = fs.readFileSync(path.join(hooks, 'state/bash-commands.log'), 'utf8');
  assert.match(log, /REDACTED/);
  assert.doesNotMatch(log, /example-value/);
});

test('invalid or oversized input fails closed', t => {
  const { call } = fixture(t);
  for (const raw of ['{invalid', 'x'.repeat(1024 * 1024 + 1)]) {
    assert.equal(call('PreToolUse', {}, {}, raw).status, 2);
  }
});

test('manifest contains only implemented events and portable quoted commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, '.codex/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.hooks).sort(),
    ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact', 'Stop', 'SessionEnd', 'PermissionRequest'].sort());
  for (const groups of Object.values(manifest.hooks)) {
    for (const group of groups) for (const handler of group.hooks) {
      assert.equal(handler.type, 'command');
      assert.equal(handler.command, 'node "$(git rev-parse --show-toplevel)/.codex/hooks/run.js"');
    }
  }
});
