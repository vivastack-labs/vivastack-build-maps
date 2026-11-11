'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sanitize: redacts AWS access key', () => {
  const { sanitize } = require('../lib/sanitize');
  const result = sanitize('key=AKIAIOSFODNN7EXAMPLE');
  assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitize: redacts GitHub token', () => {
  const { sanitize } = require('../lib/sanitize');
  const result = sanitize('token ghp_' + 'A'.repeat(36));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitize: redacts password= pattern', () => {
  const { sanitize } = require('../lib/sanitize');
  const result = sanitize('mysql -u root --password=secret123');
  assert.ok(!result.includes('secret123'));
});

test('sanitize: leaves plain text untouched', () => {
  const { sanitize } = require('../lib/sanitize');
  const result = sanitize('git status --short');
  assert.equal(result, 'git status --short');
});
