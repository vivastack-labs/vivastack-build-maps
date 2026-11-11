'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, isPlanApproved } = require('../scripts/viva-plan-gate');

function assertAllowed(result) {
  assert.ok(result == null || result.decision === 'allow');
}

// Builds a temp stateRoot with runs/latest/run.jsonl containing `lines`.
// Pass lines=null to omit the run.jsonl entirely.
function mkStateRoot(lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'viva-gate-'));
  const latest = path.join(root, 'runs', 'latest');
  fs.mkdirSync(latest, { recursive: true });
  if (lines != null) {
    fs.writeFileSync(path.join(latest, 'run.jsonl'), lines.join('\n') + '\n');
  }
  return root;
}

test('allows non-viva-developer Agent calls (Explore fork)', async () => {
  const result = await run({ tool_input: { subagent_type: 'Explore' } });
  assertAllowed(result);
});

test('allows Agent calls with no subagent_type (plain fork)', async () => {
  const result = await run({ tool_input: { prompt: 'do research' } });
  assertAllowed(result);
});

test('allows other viva agents (e.g. viva-tester)', async () => {
  const result = await run({ tool_input: { subagent_type: 'viva-tester' } });
  assertAllowed(result);
});

test('blocks viva-developer when plan not approved', async () => {
  const stateRoot = mkStateRoot([
    JSON.stringify({ status: 'started', run_id: 'r1' }),
    JSON.stringify({ agent: 'viva-planner', status: 'completed' }),
  ]);
  const result = await run({ tool_input: { subagent_type: 'viva-developer' } }, { stateRoot });
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /Plan approval gate/);
});

test('allows viva-developer once plan is approved', async () => {
  const stateRoot = mkStateRoot([
    JSON.stringify({ status: 'started', run_id: 'r1' }),
    JSON.stringify({ agent: 'viva-coordinator', status: 'plan_approved', plan_doc: '/x.md' }),
  ]);
  const result = await run({ tool_input: { subagent_type: 'viva-developer' } }, { stateRoot });
  assertAllowed(result);
});

test('blocks viva-developer when run log is missing (fail closed)', async () => {
  const stateRoot = mkStateRoot(null);
  const result = await run({ tool_input: { subagent_type: 'viva-developer' } }, { stateRoot });
  assert.equal(result.decision, 'block');
});

test('isPlanApproved tolerates malformed JSONL lines', () => {
  const root = mkStateRoot([
    'not json at all',
    '{ partial',
    JSON.stringify({ status: 'plan_approved' }),
  ]);
  assert.equal(isPlanApproved(path.join(root, 'runs', 'latest', 'run.jsonl')), true);
});

test('isPlanApproved returns false for unreadable path', () => {
  assert.equal(isPlanApproved('/no/such/run.jsonl'), false);
});
