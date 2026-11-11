'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('statePath: returns path inside ~/.claude/vivastack/', () => {
  const { statePath } = require('../lib/state');
  const p = statePath('sessions', 'foo.tmp');
  assert.ok(p.startsWith(path.join(os.homedir(), '.claude', 'vivastack')));
  assert.ok(p.endsWith('foo.tmp'));
});

test('atomicWrite + readJSON: round-trips JSON data', () => {
  const { statePath, atomicWrite, readJSON } = require('../lib/state');
  const p = statePath('tmp', `test-${Date.now()}.json`);
  const data = { hello: 'world', n: 42 };
  atomicWrite(p, data);
  const result = readJSON(p, null);
  assert.deepEqual(result, data);
  fs.unlinkSync(p);
});

test('readJSON: returns fallback for missing file', () => {
  const { readJSON } = require('../lib/state');
  const result = readJSON('/nonexistent/path.json', { default: true });
  assert.deepEqual(result, { default: true });
});
