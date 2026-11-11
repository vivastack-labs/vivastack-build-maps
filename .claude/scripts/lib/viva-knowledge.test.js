'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  HEADER,
  oneLine,
  symptomKey,
  parseKnowledge,
  renderKnowledge,
  applyUpsert,
  upsertFile,
  parseArgv,
} = require('./viva-knowledge');

function tmpMd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viva-kn-'));
  return path.join(dir, 'viva-knowledge.md');
}

test('oneLine: collapses newlines and runs of whitespace', () => {
  assert.equal(oneLine('a\n  b   c\n'), 'a b c');
  assert.equal(oneLine(null), '');
});

test('symptomKey: text before first " -> "', () => {
  assert.equal(symptomKey('unvalidated input -> add zod'), 'unvalidated input');
  assert.equal(symptomKey('no separator here'), 'no separator here');
});

test('upsertFile: creates file with header when missing', () => {
  const md = tmpMd();
  upsertFile({
    mdPath: md, category: 'security:input-validation',
    symptom: 'unvalidated body', resolution: 'add zod schema',
    runId: '20260518-auth-ab3f', ts: '2026-05-18T04:31:00Z',
  });
  const out = fs.readFileSync(md, 'utf8');
  assert.ok(out.startsWith(HEADER));
  assert.match(out, /## category: security:input-validation/);
  assert.match(out, /\*\*Latest:\*\* unvalidated body -> add zod schema/);
  assert.match(out, /\*\*Seen:\*\* 1x - last run 20260518-auth-ab3f \(2026-05-18T04:31:00Z\)/);
});

test('upsertFile: new distinct category is appended, existing kept', () => {
  const md = tmpMd();
  upsertFile({ mdPath: md, category: 'lint:markdown', symptom: 's1', resolution: 'r1', runId: 'run-a', ts: 't1' });
  upsertFile({ mdPath: md, category: 'tester:edge-case', symptom: 's2', resolution: 'r2', runId: 'run-b', ts: 't2' });
  const model = parseKnowledge(fs.readFileSync(md, 'utf8'));
  assert.deepEqual(model.order, ['lint:markdown', 'tester:edge-case']);
  assert.equal(model.sections['lint:markdown'].seen, 1);
  assert.equal(model.sections['tester:edge-case'].latest, 's2 -> r2');
});

test('upsertFile: same category demotes old Latest to a bullet and bumps Seen', () => {
  const md = tmpMd();
  upsertFile({ mdPath: md, category: 'code-review:naming', symptom: 'bad name A', resolution: 'rename A', runId: 'run-1', ts: 't1' });
  upsertFile({ mdPath: md, category: 'code-review:naming', symptom: 'bad name B', resolution: 'rename B', runId: 'run-2', ts: 't2' });

  const s = parseKnowledge(fs.readFileSync(md, 'utf8')).sections['code-review:naming'];
  assert.equal(s.seen, 2);
  assert.equal(s.latest, 'bad name B -> rename B');
  assert.equal(s.lastRun, 'run-2');
  assert.deepEqual(s.bullets, ['bad name A -> rename A (run-1)']);
});

test('applyUpsert: history dedupes by symptom and caps at 3', () => {
  let model = parseKnowledge('');
  const mk = (sym, run) => ({ category: 'tester:flaky', symptom: sym, resolution: 'fix', runId: run, ts: run });
  ['a', 'b', 'c', 'd'].forEach((sym, i) => applyUpsert(model, mk(sym, `r${i}`)));
  // latest = d; history should be most-recent 3 demoted: c, b, a -> capped to c,b,a (3)
  let s = model.sections['tester:flaky'];
  assert.equal(s.latest, 'd -> fix');
  assert.equal(s.bullets.length, 3);
  assert.deepEqual(s.bullets.map((b) => b.split(' -> ')[0]), ['c', 'b', 'a']);

  // re-report symptom 'b' — old 'b' bullet must be removed (dedupe by symptom)
  applyUpsert(model, mk('b', 'r9'));
  s = model.sections['tester:flaky'];
  assert.equal(s.latest, 'b -> fix');
  const keys = s.bullets.map((x) => x.split(' -> ')[0]);
  assert.equal(keys.filter((k) => k === 'b').length, 0);
  assert.ok(s.bullets.length <= 3);
});

test('upsertFile: unresolved variant records decision, no fix recipe', () => {
  const md = tmpMd();
  upsertFile({
    mdPath: md, category: 'tester:integration', symptom: 'intermittent timeout',
    unresolvedDecision: 'skipped', runId: 'run-x', ts: 'tx',
  });
  const s = parseKnowledge(fs.readFileSync(md, 'utf8')).sections['tester:integration'];
  assert.equal(s.latest, 'intermittent timeout -> UNRESOLVED (user: skipped)');
});

test('render/parse round-trips a multi-section model', () => {
  let model = parseKnowledge('');
  applyUpsert(model, { category: 'a:x', symptom: 's', resolution: 'r', runId: 'r1', ts: 't1' });
  applyUpsert(model, { category: 'b:y', symptom: 's2', resolution: 'r2', runId: 'r2', ts: 't2' });
  const round = parseKnowledge(renderKnowledge(model));
  assert.deepEqual(round.order, model.order);
  assert.equal(round.sections['a:x'].latest, 's -> r');
  assert.equal(round.sections['b:y'].latest, 's2 -> r2');
});

test('parseArgv: resolved form', () => {
  const o = parseArgv(['upsert', '/x.md', 'security:secret', 'leaked key', 'use env var', 'run-1', 'ts1']);
  assert.equal(o.category, 'security:secret');
  assert.equal(o.resolution, 'use env var');
  assert.equal(o.unresolvedDecision, undefined);
});

test('parseArgv: --unresolved:<decision> form', () => {
  const o = parseArgv(['upsert', '/x.md', 'tester:flaky', 'sym', '--unresolved:overridden', 'run-2']);
  assert.equal(o.resolution, undefined);
  assert.equal(o.unresolvedDecision, 'overridden');
});

test('parseArgv: rejects unknown command and missing args', () => {
  assert.throws(() => parseArgv(['nope']), /unknown command/);
  assert.throws(() => parseArgv(['upsert', '/x.md']), /usage:/);
});
