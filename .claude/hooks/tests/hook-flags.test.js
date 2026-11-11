'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('isHookEnabled: allows hook when profile matches', () => {
  process.env.VCW_HOOK_PROFILE = 'standard';
  delete process.env.VCW_DISABLED_HOOKS;
  const { isHookEnabled } = require('../lib/hook-flags');
  assert.equal(isHookEnabled('vcw:test', ['minimal', 'standard', 'strict']), true);
});

test('isHookEnabled: blocks strict-only hook at standard profile', () => {
  process.env.VCW_HOOK_PROFILE = 'standard';
  delete process.env.VCW_DISABLED_HOOKS;
  delete require.cache[require.resolve('../lib/hook-flags')];
  const { isHookEnabled } = require('../lib/hook-flags');
  assert.equal(isHookEnabled('vcw:test', ['strict']), false);
});

test('isHookEnabled: blocks explicitly disabled hook', () => {
  process.env.VCW_HOOK_PROFILE = 'strict';
  process.env.VCW_DISABLED_HOOKS = 'vcw:test:hook';
  delete require.cache[require.resolve('../lib/hook-flags')];
  const { isHookEnabled } = require('../lib/hook-flags');
  assert.equal(isHookEnabled('vcw:test:hook', ['minimal', 'standard', 'strict']), false);
});

test('isHookEnabled: defaults to standard when VCW_HOOK_PROFILE unset', () => {
  delete process.env.VCW_HOOK_PROFILE;
  delete process.env.VCW_DISABLED_HOOKS;
  delete require.cache[require.resolve('../lib/hook-flags')];
  const { isHookEnabled } = require('../lib/hook-flags');
  assert.equal(isHookEnabled('vcw:test', ['standard', 'strict']), true);
  assert.equal(isHookEnabled('vcw:test', ['strict']), false);
});
