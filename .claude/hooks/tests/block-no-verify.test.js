'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/block-no-verify');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

test('blocks git commit --no-verify', async () => {
  const result = await run({ tool_input: { command: 'git commit --no-verify -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('blocks git commit -n shorthand', async () => {
  const result = await run({ tool_input: { command: 'git commit -n -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('blocks core.hooksPath bypass', async () => {
  const result = await run({ tool_input: { command: 'git -c core.hooksPath=/dev/null commit -m "bad"' } });
  assert.equal(result.decision, 'block');
});

test('allows normal git commit', async () => {
  const result = await run({ tool_input: { command: 'git commit -m "good commit"' } });
  assertAllowed(result);
});

test('allows non-git commands', async () => {
  const result = await run({ tool_input: { command: 'npm test --no-verify' } });
  assertAllowed(result);
});

// --- issue #36：つないだコマンドも1つずつ確かめる ---

test('blocks --no-verify in a git command chained after another command', async () => {
  for (const command of ['cat > m <<EOF && git commit --no-verify -F m', 'git add . && git commit -n -m x', 'echo x; git push --no-verify']) {
    const result = await run({ tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('blocks -n combined with other short options of git commit', async () => {
  const result = await run({ tool_input: { command: 'git commit -anm "bad"' } });
  assert.equal(result?.decision, 'block');
});

test('blocks setting core.hooksPath with git config', async () => {
  const result = await run({ tool_input: { command: 'git config core.hooksPath /dev/null && git commit -m x' } });
  assert.equal(result?.decision, 'block');
});

test('allows -n of a later non-git command and of other git subcommands (CLAUDE.md の誤検出)', async () => {
  for (const command of ['git status; grep -n foo x', 'git log -n 5', 'git grep -n foo', 'git config --get core.hooksPath']) {
    assertAllowed(await run({ tool_input: { command } }));
  }
});

test('allows --no-* options other than --no-verify and words inside the commit message', async () => {
  for (const command of ['git revert --no-edit HEAD', 'git commit -m "skip --no-verify and -n here"', 'git commit -m "x" -m "--no-renames"', 'git commit -mn']) {
    assertAllowed(await run({ tool_input: { command } }));
  }
});

// --- レビューの指摘 ---

test('blocks -n after -S or -u, after a line continuation, and inside command substitutions or sh -c', async () => {
  for (const command of ['git commit -S -n -m x', 'git commit -u -n -m x', 'git commit -m x \\\n--no-verify', 'echo "$(git commit -n -m x)"', 'bash -c "git commit --no-verify"']) {
    const result = await run({ tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('blocks core.hooksPath given with --config-env', async () => {
  const result = await run({ tool_input: { command: 'git --config-env=core.hooksPath=HOOKS commit -m x' } });
  assert.equal(result?.decision, 'block');
});

test('allows reading core.hooksPath with only the key, and commands written in a heredoc body', async () => {
  for (const command of ['git config core.hooksPath', "cat > m <<'EOF'\ngit commit --no-verify\nEOF"]) {
    assertAllowed(await run({ tool_input: { command } }));
  }
});

test('blocks aliases that add --no-verify, core.hooksPath given by GIT_CONFIG_KEY_*, and abbreviated --no-verify (security review)', async () => {
  for (const command of [
    'git config alias.ci "commit --no-verify"',
    'git -c alias.ci="commit --no-verify" ci -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
    'git commit --no-veri -m x'
  ]) {
    const result = await run({ tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('blocks options with a command substitution attached (security review, 4th)', async () => {
  for (const command of ['git commit --no-verify$(true) -m x', 'git commit -n$(true) -m x']) {
    const result = await run({ tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});
