'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitShell, gitInvocations } = require('../lib/git-command');

// --- splitShell（issue #36：つないだコマンドを1つずつに分ける） ---

test('splitShell: splits on &&, ||, ;, |, & and newlines', () => {
  assert.deepEqual(splitShell('git add . && git commit -m x; echo ok || true | cat & sleep 1\nls'), [
    ['git', 'add', '.'],
    ['git', 'commit', '-m', 'x'],
    ['echo', 'ok'],
    ['true'],
    ['cat'],
    ['sleep', '1'],
    ['ls']
  ]);
});

test('splitShell: keeps separators and spaces inside quotes as part of the token', () => {
  assert.deepEqual(splitShell(`git commit -m "fix; -n && x" && echo 'a | b'`), [
    ['git', 'commit', '-m', 'fix; -n && x'],
    ['echo', 'a | b']
  ]);
});

test('splitShell: handles escapes, joined quotes and subshell parentheses', () => {
  assert.deepEqual(splitShell(`(cd x && git push a\\ b) && echo "say \\"hi\\""x`), [
    ['cd', 'x'],
    ['git', 'push', 'a b'],
    ['echo', 'say "hi"x']
  ]);
});

test('splitShell: returns nothing for empty input', () => {
  assert.deepEqual(splitShell(''), []);
  assert.deepEqual(splitShell('  ;  && '), []);
});

// --- gitInvocations ---

test('gitInvocations: finds git calls anywhere in a chained command', () => {
  const calls = gitInvocations('cat > msg <<EOF && git add . && git commit -F msg');
  assert.deepEqual(
    calls.map(call => [call.subcommand, call.args]),
    [
      ['add', ['.']],
      ['commit', ['-F', 'msg']]
    ]
  );
});

test('gitInvocations: skips env assignments, env, global options with values, and paths to git', () => {
  const calls = gitInvocations('FOO=1 env BAR=2 /usr/bin/git -C repo -c core.hooksPath=/dev/null --no-pager commit -m x');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].subcommand, 'commit');
  assert.deepEqual(calls[0].args, ['-m', 'x']);
  assert.deepEqual(calls[0].globalArgs, ['-C', 'repo', '-c', 'core.hooksPath=/dev/null', '--no-pager']);
});

test('gitInvocations: ignores non-git commands and the word git inside arguments', () => {
  assert.deepEqual(gitInvocations('echo git commit && grep -n git file'), []);
  assert.deepEqual(gitInvocations('gitleaks detect'), []);
});

// --- commit の引数 ---

test('parseCommitArgs: separates options from option values and paths', () => {
  const { parseCommitArgs } = require('../lib/git-command');
  assert.deepEqual(parseCommitArgs(['-m', '-n', '-F', 'msg', '--author', 'a <b>', '-anm', 'x', 'src/a.ts', '--', 'b.ts']), {
    options: ['-m', '-F', '--author', '-anm'],
    paths: ['src/a.ts', 'b.ts']
  });
});

test('hasShortFlag: finds a letter before the first option that takes a value', () => {
  const { hasShortFlag } = require('../lib/git-command');
  assert.equal(hasShortFlag('-anm', 'n'), true);
  assert.equal(hasShortFlag('-am', 'a'), true);
  assert.equal(hasShortFlag('-mn', 'n'), false);
  assert.equal(hasShortFlag('--all', 'a'), false);
});

test('commitsUnstaged: true only when the commit also takes working-tree content', () => {
  const { commitsUnstaged } = require('../lib/git-command');
  // -mn x の x は -m の値ではなくパス（-m の値は n）
  for (const args of [['-mn', 'x'], ['-am', 'x'], ['-a', '-m', 'x'], ['--all'], ['--inc', 'a.ts'], ['-p'], ['-m', 'x', 'src/a.ts'], ['--', 'b.ts'], ['--pathspec-from-file=list']]) {
    assert.equal(commitsUnstaged(args), true, args.join(' '));
  }
  for (const args of [['-m', 'x'], ['-F', 'msg.txt'], ['-m', 'a', '--author', 'a <b>'], ['-mn'], ['--amend', '--no-edit']]) {
    assert.equal(commitsUnstaged(args), false, args.join(' '));
  }
});

// --- レビューの指摘（シェルの書き方による見落とし） ---

test('splitShell: removes backslash-newline line continuations (HIGH-2)', () => {
  assert.deepEqual(splitShell('git commit -m x \\\n--no-verify'), [['git', 'commit', '-m', 'x', '--no-verify']]);
  assert.deepEqual(splitShell('git co\\\nmmit -n'), [['git', 'commit', '-n']]);
  assert.deepEqual(splitShell('git commit -m "a\\\nb"'), [['git', 'commit', '-m', 'ab']]);
});

test('splitShell: skips heredoc bodies, so quotes in the body do not hide later commands (MEDIUM-1)', () => {
  assert.deepEqual(splitShell("cat > m <<'EOF'\ndon't\ngit push -f\nEOF\ngit push --force"), [['cat'], ['git', 'push', '--force']]);
  assert.deepEqual(splitShell('cat <<-END && git commit -n\n\tbody\n\tEND\nls'), [['cat'], ['git', 'commit', '-n'], ['ls']]);
  assert.deepEqual(splitShell('cat <<< "here string" && ls'), [['cat'], ['ls']]);
});

test('splitShell: falls back to dropping quote characters when a quote is never closed (N4)', () => {
  assert.deepEqual(splitShell(`echo "don't && git push -f`), [
    ['echo', 'dont'],
    ['git', 'push', '-f']
  ]);
  assert.deepEqual(splitShell(`echo $'it\\'s'; git push '--force'`).at(-1), ['git', 'push', '--force']);
});

test('splitShell: parses command substitutions as separate commands (MEDIUM-2)', () => {
  // 置換の結果は分からない。語には何も残さない（cd の行き先の判定は gitInvocations が内部で行う）
  assert.deepEqual(splitShell('echo `git push -f` done'), [
    ['git', 'push', '-f'],
    ['echo', '', 'done']
  ]);
  assert.deepEqual(splitShell('git commit -m "$(git push -f)"'), [
    ['git', 'push', '-f'],
    ['git', 'commit', '-m', '']
  ]);
  assert.deepEqual(splitShell("echo '$(not run)'"), [['echo', '$(not run)']]);
});

test('splitShell: removes redirections with their targets, but keeps > and < inside quotes', () => {
  assert.deepEqual(splitShell('git push 2>&1 | tail && ls &> out && cat < in >> out 2> err && echo ">x"'), [['git', 'push'], ['tail'], ['ls'], ['cat'], ['echo', '>x']]);
});

test('gitInvocations: sees git behind shell keywords and wrappers (MEDIUM-2)', () => {
  for (const command of [
    'if true; then git push -f; fi',
    '{ git push -f; }',
    '! git push -f',
    'command git push -f',
    'time git push -f',
    'sudo git push -f',
    'nohup git push -f',
    'xargs git push -f',
    '/usr/bin/env git push -f',
    'env -i PATH=/bin git push -f',
    'exec git push -f'
  ]) {
    assert.deepEqual(
      gitInvocations(command).map(call => call.subcommand),
      ['push'],
      command
    );
  }
});

test('gitInvocations: parses the script of sh -c and bash -c (MEDIUM-2)', () => {
  assert.deepEqual(
    gitInvocations(`bash -c "git add . && git push -f"`).map(call => call.subcommand),
    ['add', 'push']
  );
  assert.deepEqual(
    gitInvocations(`sh -lc 'git commit -n'`).map(call => call.subcommand),
    ['commit']
  );
});

test('gitInvocations: records the directory from cd and -C (MEDIUM-6)', () => {
  const calls = gitInvocations('cd sub && git -C inner commit -m x && cd /abs && git commit -m y && cd - && git status');
  assert.deepEqual(
    calls.map(call => call.dir),
    ['sub/inner', '/abs', null]
  );
});

test('gitInvocations: --exec-path does not take the next word as its value (LOW)', () => {
  assert.deepEqual(
    gitInvocations('git --exec-path commit -n').map(call => call.subcommand),
    ['commit']
  );
});

test('parseCommitArgs: -S and -u take only an attached value, not the next word (HIGH-1)', () => {
  const { parseCommitArgs, hasShortFlag } = require('../lib/git-command');
  assert.deepEqual(parseCommitArgs(['-S', '-n', '-u', '-a', '-m', 'x']).options, ['-S', '-n', '-u', '-a', '-m']);
  assert.deepEqual(parseCommitArgs(['-Sn', 'src/a.ts']), { options: ['-Sn'], paths: ['src/a.ts'] });
  assert.equal(hasShortFlag('-Sn', 'n'), false);
  assert.equal(hasShortFlag('-un', 'n'), false);
  assert.equal(hasShortFlag('-nS', 'n'), true);
});

test('gitInvocations: records env assignments, drops redirections from args, and accepts git.exe (security review)', () => {
  const [call] = gitInvocations('GIT_INDEX_FILE=/tmp/i git.exe commit -m x 2>&1 > /dev/null 2> err.log');
  assert.equal(call.subcommand, 'commit');
  assert.deepEqual(call.args, ['-m', 'x']);
  assert.deepEqual(call.env, ['GIT_INDEX_FILE=/tmp/i']);
});

// --- 2回目のレビューの指摘 ---

test('gitInvocations: skips wrapper options and positional arguments per wrapper (MEDIUM-A)', () => {
  for (const command of ['sudo -n git push -f', 'sudo -u root git push -f', 'timeout 10 git push -f', 'timeout -s KILL 10 git push -f', 'xargs -n 1 git push -f', 'bash -o pipefail -c "git push -f"', 'nice -n 5 git push -f']) {
    assert.deepEqual(
      gitInvocations(command).map((call) => call.subcommand),
      ['push'],
      command
    );
  }
});

test('gitInvocations: --git-dir and --work-tree make the directory unknown (LOW-2)', () => {
  assert.equal(gitInvocations('git --git-dir=../r/.git commit -m x')[0].dir, null);
  assert.equal(gitInvocations('git --work-tree ../r commit -m x')[0].dir, null);
});

// --- 3回目のセキュリティレビューの指摘 ---

test('splitShell: parses process substitutions as separate commands (N7)', () => {
  assert.deepEqual(splitShell('git push <(echo) -f && diff >(cat) x'), [['echo'], ['git', 'push', '', '-f'], ['cat'], ['diff', '', 'x']]);
});

test('gitInvocations: cd to a variable, a command substitution or a glob makes the directory unknown (N2)', () => {
  for (const command of ['cd $(git rev-parse --show-toplevel) && git commit -m x', 'cd "$PROJ" && git commit -m x', 'cd src/* && git commit -m x']) {
    const commit = gitInvocations(command).find((call) => call.subcommand === 'commit');
    assert.equal(commit.dir, null, command);
  }
});

test('gitInvocations: a command substitution attached to an option does not hide the option (security review, 4th)', () => {
  assert.deepEqual(gitInvocations('git push -f$(true)')[0].args, ['-f']);
  assert.deepEqual(gitInvocations('git push --force"$(true)"')[0].args, ['--force']);
});
