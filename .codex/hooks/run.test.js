'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const REPO = path.resolve(__dirname, '../..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maps-hooks-'));
  const hooks = path.join(root, '.codex/hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(REPO, '.claude'), path.join(root, '.claude'), 'dir');
  execFileSync('git', ['init', '-q', root]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function call(event, extra = {}, env = {}, raw) {
    const bootstrap = 'require(process.argv[1]).main(process.argv[2]).catch(error => { process.stderr.write(error.message); process.exitCode=2; });';
    const result = spawnSync(process.execPath, ['-e', bootstrap, path.join(__dirname, 'run.js'), root], {
      cwd: root,
      encoding: 'utf8',
      input: raw ?? JSON.stringify({ cwd: root, session_id: 'test/session', hook_event_name: event, ...extra }),
      env: {
        ...process.env,
        PATH: path.join(root, 'node_modules/.bin') + path.delimiter + process.env.PATH,
        VCW_HOOK_PROFILE: 'standard',
        VCW_DISABLED_HOOKS: '',
        ...env,
        // Prevent real audio playback in tests, while allowing explicit enable tests.
        ...(!('VCW_DISABLED_HOOKS' in env) ? { VCW_DISABLED_HOOKS: `codex:audio:${event}` } : {})
      }
    });
    return { ...result, json: result.stdout ? JSON.parse(result.stdout) : null };
  }
  function bin(name, body) {
    const target = path.join(root, 'node_modules/.bin', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(target), 'package.json'), '{"type":"commonjs"}');
    fs.writeFileSync(target, `#!${process.execPath}\n${body}`, { mode: 0o755 });
    return target;
  }
  bin('gitleaks', 'process.exitCode=0;');
  return { root, hooks, call, bin };
}

test('patch parser covers add, update, delete and both rename paths', () => {
  const { patchPaths } = require('./run');
  assert.deepEqual(patchPaths('*** Begin Patch\n*** Add File: new file.js\n+x\n*** Update File: old.js\n*** Move to: moved.js\n@@\n*** Delete File: deleted.js\n*** End Patch'), [
    'new file.js',
    'old.js',
    'moved.js',
    'deleted.js'
  ]);
});

// 開発概要書 10.1: Claude と Codex に共通の開発規約を適用する。
test('実リポジトリの ESM 設定でも登録済みのエントリーポイントが起動する', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.js')], {
    cwd: REPO,
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: REPO, tool_name: 'Bash', tool_input: { command: 'git status' } })
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('Stop はローカルの Prettier・ESLint・TypeScript を実行し、型エラーを通知する', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'checks.jsonl');
  for (const name of ['prettier', 'eslint', 'tsc']) {
    bin(
      name,
      `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({name:${JSON.stringify(name)},args:process.argv.slice(2),cwd:process.cwd()})+'\\n');` +
        (name === 'tsc' ? "process.stderr.write('TS2322: type mismatch'); process.exitCode=1;" : '')
    );
  }
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(root, 'edited.ts'), 'export const count: number = "bad";');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: edited.ts' } });
  const stop = call('Stop');
  assert.equal(stop.status, 0, stop.stderr);
  assert.match(stop.json.systemMessage, /TS2322/);
  const checks = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    checks.map(check => check.name),
    ['prettier', 'eslint', 'tsc']
  );
  assert.ok(checks.every(check => check.cwd === root));
  assert.ok(checks[0].args.includes('--write'));
  assert.deepEqual(checks[2].args, ['--noEmit']);
  call('Stop');
  assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 3);
});

test('PostToolUse は Bash の文字列出力から PR 作成を通知する', t => {
  const { call } = fixture(t);
  const result = call('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'gh pr create' }, tool_response: 'https://github.com/example/maps/pull/12' });
  assert.match(result.json.hookSpecificOutput.additionalContext, /PR created.*pull\/12/);
});

test('MCP の path 引数を編集ファイルとして扱わない', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'broken.json'), '{broken');
  const result = call('PostToolUse', { tool_name: 'mcp__files__read', tool_input: { path: 'broken.json' } });
  assert.deepEqual(result.json, {});
});

test('Stop の直前にリポジトリ外へのリンクに変わったファイルも検査から除外する', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'unexpected.txt');
  bin('prettier', `require('node:fs').writeFileSync(${JSON.stringify(log)}, 'ran');`);
  const edited = path.join(root, 'edited.js');
  fs.writeFileSync(edited, 'const value=1;');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: edited.js' } });
  fs.unlinkSync(edited);
  fs.symlinkSync(path.join(REPO, 'package.json'), edited);
  assert.equal(call('Stop').status, 0);
  assert.equal(fs.existsSync(log), false);
});

test('設定の保護はシンボリックリンク先にも適用する', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, '.prettierrc'), '{}');
  fs.symlinkSync(path.join(root, '.prettierrc'), path.join(root, 'alias.json'));
  const result = call('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: alias.json' } });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('gitleaks は Claude の環境変数を引き継がず、このリポジトリだけを検査する', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'scan.jsonl');
  // 漏洩の終了コードは 77（--exit-code 77）。それ以外の非 0 は設定の読み込みエラーなどとして通す
  bin('gitleaks', `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()})+'\\n'); process.exitCode=77;`);
  // .gitleaks.toml がなければ -c を付けず、gitleaks の既定のルールで検査する
  fs.writeFileSync(path.join(root, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
  const result = call('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: 修正"' } }, { CLAUDE_PROJECT_DIR: '/another-project' });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, 'deny');
  const scan = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.equal(scan.cwd, root);
  assert.ok(scan.args.includes(path.join(root, '.gitleaks.toml')));
  assert.ok(scan.args.includes('--redact'));
});

test('コンテンツの YAML は専用の yamllint 設定で検査する', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'yaml.jsonl');
  bin('yamllint', `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');`);
  fs.mkdirSync(path.join(root, 'content'), { recursive: true });
  fs.writeFileSync(path.join(root, 'content/example.yaml'), 'name: test\n');
  fs.writeFileSync(path.join(root, 'workflow.yml'), 'name: test\n');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: content/example.yaml\n*** Update File: workflow.yml' } });
  assert.equal(call('Stop').status, 0);
  const checks = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(checks, [[path.join(root, 'workflow.yml')], ['-c', path.join(root, 'content/.yamllint'), path.join(root, 'content/example.yaml')]]);
});

test('Claude の資源は、編集イベントが届いても Stop の自動整形に渡さない', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'unexpected.txt');
  bin('prettier', `require('node:fs').writeFileSync(${JSON.stringify(log)}, 'ran');`);
  const resource = path.join(REPO, '.claude/hooks/scripts/quality-gate.js');
  const before = fs.readFileSync(resource);
  assert.deepEqual(call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: .claude/hooks/scripts/quality-gate.js' } }).json, {});
  assert.equal(call('Stop').status, 0);
  assert.equal(fs.existsSync(log), false);
  assert.deepEqual(fs.readFileSync(resource), before);
});

test('圧縮・終了で保存した活動情報を再開時に読み、破損した状態は無視する', t => {
  const { root, hooks, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'edited.json'), '{}');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: edited.json' } });
  assert.equal(call('PreCompact').status, 0);
  assert.deepEqual(call('PostCompact').json, {});
  assert.equal(call('SessionEnd').status, 0);
  const sessions = path.join(hooks, 'state/sessions');
  fs.writeFileSync(path.join(sessions, 'corrupt.json'), '{broken');
  fs.writeFileSync(path.join(sessions, 'incomplete.json'), '{}');
  fs.writeFileSync(path.join(sessions, 'wrong-type.json'), '{"updated":123}');
  const start = call('SessionStart');
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.json.hookSpecificOutput.additionalContext, /edited.json/);
  assert.match(fs.readFileSync(path.join(sessions, 'compaction.log'), 'utf8'), /compaction/);
});

test('承認通知は許可や拒否の判断を返さない', t => {
  const { call } = fixture(t);
  assert.deepEqual(call('PermissionRequest').json, {});
});

test('実行中の Stop hook は検査を繰り返さず pending を保持する', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'checks.txt');
  bin('prettier', `require('node:fs').writeFileSync(${JSON.stringify(log)}, 'ran');`);
  fs.writeFileSync(path.join(root, 'edited.js'), 'const value=1;');
  call('PostToolUse', { tool_name: 'apply_patch', tool_input: { command: '*** Update File: edited.js' } });
  call('Stop', { stop_hook_active: true });
  assert.equal(fs.existsSync(log), false);
  call('Stop');
  assert.equal(fs.readFileSync(log, 'utf8'), 'ran');
});

test('ビルドの通知は終了コードを確認してから返す', t => {
  const { call } = fixture(t);
  const payload = { tool_name: 'Bash', tool_input: { command: 'pnpm build' } };
  assert.deepEqual(call('PostToolUse', payload).json, {});
  assert.match(call('PostToolUse', { ...payload, tool_response: { exit_code: 1 } }).json.hookSpecificOutput.additionalContext, /Build failed/);
});

test('minimal は編集の検査・集計を行わず、strict はコミット形式も検査する', t => {
  const { root, hooks, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'example.js'), 'const value=1;');
  call('PostToolUse', { tool_name: 'Write', tool_input: { file_path: 'example.js' } }, { VCW_HOOK_PROFILE: 'minimal' });
  assert.deepEqual(call('Stop', {}, { VCW_HOOK_PROFILE: 'minimal' }).json, {});
  assert.equal(fs.existsSync(path.join(hooks, 'state/metrics/tool-usage.jsonl')), false);
  const commit = call('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git commit -m "invalid message"' } }, { VCW_HOOK_PROFILE: 'strict' });
  assert.equal(commit.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(commit.json.hookSpecificOutput.permissionDecisionReason, /Commit message/);
});

test('Edit・MultiEdit のパスも検査し、通常の関数ツールには介入しない', t => {
  const { call } = fixture(t);
  for (const [tool_name, tool_input] of [
    ['Edit', { path: '.prettierrc' }],
    ['Write', { file_path: '.eslintrc.json' }],
    ['MultiEdit', { edits: [{ file_path: 'example.js' }, { file_path: 'eslint.config.js' }] }]
  ]) {
    assert.equal(call('PreToolUse', { tool_name, tool_input }).json.hookSpecificOutput.permissionDecision, 'deny');
  }
  assert.deepEqual(call('PreToolUse', { tool_name: 'update_plan', tool_input: {} }).json, {});
});

test('対応する音声イベントを共有プレイヤーに渡す（再生コマンドはスタブ）', t => {
  const { root, call, bin } = fixture(t);
  const log = path.join(root, 'audio.txt');
  for (const name of ['aplay', 'paplay', 'afplay']) {
    bin(name, `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.at(-1)+'\\n');`);
  }
  for (const event of ['SessionStart', 'Stop', 'PreCompact', 'PostCompact', 'PermissionRequest']) {
    assert.equal(call(event, {}, { WSL_DISTRO_NAME: '', VCW_DISABLED_HOOKS: '' }).status, 0);
  }
  const audio = fs.readFileSync(log, 'utf8');
  for (const folder of ['sessionstart', 'stop', 'precompact', 'postcompact', 'agent_permissionrequest']) {
    assert.ok(audio.includes(`${folder}.wav`));
  }
});

test('開始情報・編集ファイルの蓄積を個別に無効化できる', t => {
  const { root, hooks, call } = fixture(t);
  assert.deepEqual(call('SessionStart', {}, { VCW_DISABLED_HOOKS: 'vcw:session:start,codex:audio:SessionStart' }).json, {});
  fs.writeFileSync(path.join(root, 'example.json'), '{}');
  call('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: 'example.json' } }, { VCW_DISABLED_HOOKS: 'vcw:post:edit:accumulator' });
  const tmp = path.join(hooks, 'state/tmp');
  assert.ok(!fs.existsSync(tmp) || fs.readdirSync(tmp).length === 0);
});

test('実エントリーポイントは不正な入力に終了コード2を返す', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { encoding: 'utf8', input: '{invalid' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Codex hooks/);
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
    assert.notEqual(call('PreToolUse', { tool_name: 'Bash', tool_input: { command } }).json.hookSpecificOutput?.permissionDecision, 'deny');
  }
});

test('all patch paths checked, including rename destination and deletion', t => {
  const { call } = fixture(t);
  for (const patch of ['*** Add File: okay.js\n+ok\n*** Update File: eslint.config.js', '*** Update File: source.js\n*** Move to: .prettierrc', '*** Delete File: biome.json']) {
    assert.equal(call('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch } }).json.hookSpecificOutput.permissionDecision, 'deny');
  }
});

test('profiles and explicit disabled IDs preserve Claude semantics', t => {
  const { call } = fixture(t);
  const force = { tool_name: 'Bash', tool_input: { command: 'git push --force' } };
  assert.deepEqual(call('PreToolUse', force, { VCW_HOOK_PROFILE: 'minimal' }).json, {});
  const bypass = { tool_name: 'Bash', tool_input: { command: 'git commit --no-verify' } };
  assert.deepEqual(call('PreToolUse', bypass, { VCW_DISABLED_HOOKS: 'vcw:pre:bash:block-no-verify' }).json, {});
  assert.equal(call('PreToolUse', bypass, { VCW_HOOK_PROFILE: 'minimal' }).json.hookSpecificOutput.permissionDecision, 'deny');
});

test('post-edit diagnostics become Codex context and track every file', t => {
  const { root, hooks, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'broken.json'), '{broken');
  fs.writeFileSync(path.join(root, 'script.js'), 'console.log("test");');
  const result = call('PostToolUse', {
    tool_name: 'apply_patch',
    tool_input: {
      command: '*** Update File: broken.json\n*** Add File: script.js'
    }
  });
  assert.equal(result.status, 0);
  assert.match(result.json.hookSpecificOutput.additionalContext, /Quality gate/);
  assert.match(result.json.hookSpecificOutput.additionalContext, /console.log/);
  const tmp = path.join(hooks, 'state/tmp');
  const files = fs.readFileSync(
    path.join(
      tmp,
      fs.readdirSync(tmp).find(file => file.endsWith('-files.txt'))
    ),
    'utf8'
  );
  assert.match(files, /broken.json/);
  assert.match(files, /script.js/);
});

test('symlinks outside the repo are excluded from post-edit reads', t => {
  const { root, hooks, call } = fixture(t);
  fs.symlinkSync(path.join(REPO, 'package.json'), path.join(root, 'outside.json'));
  assert.deepEqual(
    call('PostToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Update File: outside.json'
      }
    }).json,
    {}
  );
  assert.ok(!fs.existsSync(path.join(hooks, 'state/tmp')) || !fs.readdirSync(path.join(hooks, 'state/tmp')).some(file => file.endsWith('-files.txt')));
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
  for (const raw of [
    '{invalid',
    'null',
    '[]',
    '{}',
    JSON.stringify({ hook_event_name: 'PreToolUse' }),
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} }),
    'x'.repeat(1024 * 1024 + 1)
  ]) {
    assert.equal(call('PreToolUse', {}, {}, raw).status, 2);
  }
});

test('manifest contains only implemented events and portable quoted commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, '.codex/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.hooks).sort(), ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact', 'Stop', 'SessionEnd', 'PermissionRequest'].sort());
  for (const groups of Object.values(manifest.hooks)) {
    for (const group of groups)
      for (const handler of group.hooks) {
        assert.equal(handler.type, 'command');
        assert.equal(handler.command, 'node "$(git rev-parse --show-toplevel)/.codex/hooks/run.js"');
      }
  }
});

// 開発概要書10.1: セキュリティレビューの規約をCodexにも適用する。
test('security-trigger は機密変更を拒否し、Codex のレビュー手順を案内する', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'client.js'), 'fetch("https://example.test");');
  execFileSync('git', ['add', 'client.js'], { cwd: root });
  const payload = { tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: 修正"' } };
  const result = call('PreToolUse', payload, { SECURITY_REVIEWED: '' });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /SECURITY TRIGGER/);
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /node \.codex\/hooks\/mark-security-reviewed.js/);
  assert.doesNotMatch(result.json.hookSpecificOutput.permissionDecisionReason, /node \.claude\//);
  assert.deepEqual(call('PreToolUse', payload, { VCW_HOOK_PROFILE: 'minimal', SECURITY_REVIEWED: '' }).json, {});
  assert.deepEqual(call('PreToolUse', payload, { VCW_DISABLED_HOOKS: 'project:pre:bash:security-trigger', SECURITY_REVIEWED: '' }).json, {});
  assert.deepEqual(call('PreToolUse', { ...payload, tool_input: { command: 'git push' } }, { SECURITY_REVIEWED: '' }).json, {});
});

test('Codex のレビュー記録は同じステージだけを通し、変更後は再び拒否する', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'client.js'), 'fetch("https://example.test");');
  execFileSync('git', ['add', 'client.js'], { cwd: root });
  const marker = spawnSync(process.execPath, [path.join(__dirname, 'mark-security-reviewed.js')], { cwd: root, encoding: 'utf8' });
  assert.equal(marker.status, 0, marker.stderr);
  assert.ok(fs.existsSync(path.join(root, '.git/security-reviewed')));
  const payload = { tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: 修正"' } };
  assert.deepEqual(call('PreToolUse', payload, { SECURITY_REVIEWED: '' }).json, {});
  fs.appendFileSync(path.join(root, 'client.js'), '\nfetch("https://example.test/changed");');
  execFileSync('git', ['add', 'client.js'], { cwd: root });
  assert.equal(call('PreToolUse', payload, { SECURITY_REVIEWED: '' }).json.hookSpecificOutput.permissionDecision, 'deny');
});

test('Codex のレビュー記録はステージが空なら失敗する', t => {
  const { root } = fixture(t);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'mark-security-reviewed.js')], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ステージした変更がありません/);
});

// 開発概要書10.1: Codex入力の省略値でもコミット前ガードを維持する。
test('cwd・session_id が省略されても機密変更を検出する', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'auth.js'), 'export const enabled = true;');
  execFileSync('git', ['add', 'auth.js'], { cwd: root });
  const raw = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: 修正"' } });
  const result = call('PreToolUse', {}, { SECURITY_REVIEWED: '' }, raw);
  assert.equal(result.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('レビュー記録があっても作業ツリーを含むコミットは拒否する', t => {
  const { root, call } = fixture(t);
  fs.writeFileSync(path.join(root, 'auth.js'), 'export const enabled = true;');
  execFileSync('git', ['add', 'auth.js'], { cwd: root });
  const marker = spawnSync(process.execPath, [path.join(__dirname, 'mark-security-reviewed.js')], { cwd: root, encoding: 'utf8' });
  assert.equal(marker.status, 0, marker.stderr);
  for (const command of ['git commit -a -m "fix: 修正"', 'git add auth.js && git commit -m "fix: 修正"']) {
    const result = call('PreToolUse', { tool_name: 'Bash', tool_input: { command } }, { SECURITY_REVIEWED: '' });
    assert.equal(result.json.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /インデックスを変える/);
  }
});
