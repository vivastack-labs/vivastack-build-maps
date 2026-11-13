'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./helpers/test-utils');

// Non-git command → pass through
test('block-force-push: non-git command → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'ls -la' }
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push without --force → pass through
test('block-force-push: git push without --force → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push origin main' }
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push --force-with-lease → allowed
test('block-force-push: git push --force-with-lease → pass', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force-with-lease origin main' }
  });
  assert.ok(result == null || result.decision !== 'block');
});

// git push --force → block
test('block-force-push: git push --force → block', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force origin main' }
  });
  assert.equal(result?.decision, 'block');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

// git push -f shorthand → block
test('block-force-push: git push -f → block', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push -f origin main' }
  });
  assert.equal(result?.decision, 'block');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

// Combined: --force-with-lease must not match --force check
test('block-force-push: --force-with-lease is not treated as --force', async () => {
  const result = await runScript('scripts/block-force-push.js', {
    tool_input: { command: 'git push --force-with-lease' }
  });
  assert.ok(result == null || result.decision !== 'block');
});

// --- issue #36：つないだコマンドも1つずつ確かめる ---

test('block-force-push: force push chained after another command → block', async () => {
  for (const command of ['echo x && git push --force origin main', 'cat > m <<EOF; git push -f']) {
    const result = await runScript('scripts/block-force-push.js', { tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('block-force-push: -f combined with other short options or a +refspec → block', async () => {
  for (const command of ['git push -uf origin main', 'git push origin +main']) {
    const result = await runScript('scripts/block-force-push.js', { tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('block-force-push: --force-if-includes, other commands with --force, and push in a message → pass', async () => {
  for (const command of ['git push --force-with-lease --force-if-includes', 'git add --force x && git push', 'git commit -m "git push --force"']) {
    const result = await runScript('scripts/block-force-push.js', { tool_input: { command } });
    assert.ok(result == null || result.decision !== 'block', command);
  }
});

test('block-force-push: force push after a line continuation or after a heredoc → block', async () => {
  for (const command of ['git push origin main \\\n--force', "cat > m <<'EOF'\ndon't\nEOF\ngit push --force"]) {
    const result = await runScript('scripts/block-force-push.js', { tool_input: { command } });
    assert.equal(result?.decision, 'block', command);
  }
});

test('block-force-push: git push --mirror → block (security review)', async () => {
  const result = await runScript('scripts/block-force-push.js', { tool_input: { command: 'git push --mirror origin' } });
  assert.equal(result?.decision, 'block');
});
