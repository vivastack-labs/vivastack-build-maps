'use strict';
/**
 * Shared test utilities for vivastack-core/hooks tests.
 * Provides helpers for spawning hook scripts via stdin/stdout,
 * temporary directory management, and environment isolation.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Root of the hooks package (two levels up from this file: tests/helpers → tests → hooks) */
const HOOKS_ROOT = path.resolve(__dirname, '../..');

/** Path to the main hook dispatcher */
const RUN_WITH_FLAGS = path.join(HOOKS_ROOT, 'run-with-flags.js');

/**
 * Run a hook script via run-with-flags.js with JSON stdin input.
 * @param {string} scriptRelPath - Script path relative to HOOKS_ROOT (e.g. 'scripts/block-no-verify.js')
 * @param {object} inputObj - JSON-serialisable stdin payload
 * @param {string[]} [flags] - Hook flags (default: 'minimal,standard,strict')
 * @param {object} [envOverrides] - Additional env vars to merge
 * @returns {{ status: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runHook(scriptRelPath, inputObj, flags = 'minimal,standard,strict', envOverrides = {}) {
  const result = spawnSync(
    process.execPath,
    [RUN_WITH_FLAGS, 'vcw:test', scriptRelPath, flags],
    {
      input: JSON.stringify(inputObj),
      encoding: 'utf8',
      env: {
        ...process.env,
        VCW_PLUGIN_ROOT: HOOKS_ROOT,
        VCW_DISABLED_HOOKS: 'vcw:hooks-log',
        ...envOverrides,
      },
    }
  );

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (_) {
    // stdout may be empty or non-JSON for some hooks
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

/**
 * Run a script module directly (require-based, in-process).
 * @param {string} scriptRelPath - Path relative to HOOKS_ROOT
 * @param {object} inputObj - Passed as argument to script's `run(input)` function
 * @returns {Promise<*>} Result from the script's run() function
 */
async function runScript(scriptRelPath, inputObj) {
  const scriptPath = path.join(HOOKS_ROOT, scriptRelPath);
  const mod = require(scriptPath);
  return mod.run(inputObj);
}

/**
 * Create a temporary directory and return its path + a cleanup function.
 * @returns {{ tmpDir: string, cleanup: () => void }}
 */
function createTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-hooks-test-'));
  return {
    tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

/**
 * Temporarily set environment variables and restore them after fn() completes.
 * @param {object} vars - Env vars to set (undefined value means delete)
 * @param {Function} fn - Sync or async function to run
 */
async function withEnv(vars, fn) {
  const originals = {};
  for (const [k, v] of Object.entries(vars)) {
    originals[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [k, orig] of Object.entries(originals)) {
      if (orig === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = orig;
      }
    }
  }
}

module.exports = { HOOKS_ROOT, RUN_WITH_FLAGS, runHook, runScript, createTempDir, withEnv };
