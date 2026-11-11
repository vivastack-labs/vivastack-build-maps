'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function fresh() {
  delete require.cache[require.resolve('../scripts/play-audio')];
  return require('../scripts/play-audio');
}

test('play-audio: getAudioPath returns null when VCW_PLUGIN_ROOT unset', () => {
  const orig = process.env.VCW_PLUGIN_ROOT;
  delete process.env.VCW_PLUGIN_ROOT;
  const { getAudioPath } = fresh();
  assert.strictEqual(getAudioPath('SessionStart'), null);
  if (orig !== undefined) process.env.VCW_PLUGIN_ROOT = orig;
});

test('play-audio: getAudioPath returns null for unknown event', () => {
  process.env.VCW_PLUGIN_ROOT = '/fake/root';
  const { getAudioPath } = fresh();
  assert.strictEqual(getAudioPath('UnknownEvent'), null);
  assert.strictEqual(getAudioPath(undefined), null);
});

test('play-audio: getAudioPath constructs correct WAV path for each event', () => {
  process.env.VCW_PLUGIN_ROOT = '/fake/root';
  const { getAudioPath } = fresh();
  const base = (folder) => path.join('/fake/root', 'hooks', 'audios', folder, `${folder}.wav`);
  assert.strictEqual(getAudioPath('SessionStart'),      base('sessionstart'));
  assert.strictEqual(getAudioPath('SessionEnd'),        base('sessionend'));
  assert.strictEqual(getAudioPath('PermissionRequest'), base('agent_permissionrequest'));
  assert.strictEqual(getAudioPath('TaskCreated'),       base('taskcreated'));
  assert.strictEqual(getAudioPath('TaskCompleted'),     base('taskcompleted'));
  // migrated from reference
  assert.strictEqual(getAudioPath('PostCompact'),       base('postcompact'));
  assert.strictEqual(getAudioPath('PreCompact'),        base('precompact'));
  assert.strictEqual(getAudioPath('Notification'),      base('notification'));
  assert.strictEqual(getAudioPath('Stop'),              base('stop'));
  assert.strictEqual(getAudioPath('WorktreeCreate'),    base('worktreecreate'));
  assert.strictEqual(getAudioPath('WorktreeRemove'),    base('worktreeremove'));
  assert.strictEqual(getAudioPath('ConfigChange'),      base('configchange'));
  assert.strictEqual(getAudioPath('StopFailure'),       base('stopfailure'));
  assert.strictEqual(getAudioPath('CwdChanged'),        base('cwdchanged'));
  assert.strictEqual(getAudioPath('FileChanged'),       base('filechanged'));
  assert.strictEqual(getAudioPath('PermissionDenied'),  base('permissiondenied'));
  // newer lifecycle events (v2.1.x) — assets from claude-code-best-practice
  assert.strictEqual(getAudioPath('UserPromptExpansion'), base('userpromptexpansion'));
  assert.strictEqual(getAudioPath('PostToolBatch'),       base('posttoolbatch'));
  assert.strictEqual(getAudioPath('MessageDisplay'),      base('messagedisplay'));
  assert.strictEqual(getAudioPath('InstructionsLoaded'),  base('instructionsloaded'));
});

test('play-audio: EVENT_AUDIO_MAP has exactly 20 entries', () => {
  const { EVENT_AUDIO_MAP } = fresh();
  assert.strictEqual(Object.keys(EVENT_AUDIO_MAP).length, 20);
});

test('play-audio: run() returns null for unknown event', async () => {
  process.env.VCW_PLUGIN_ROOT = '/fake/root';
  const { run } = fresh();
  const result = await run({ hook_event_name: 'UnknownEvent' });
  assert.strictEqual(result, null);
});

test('play-audio: run() returns null when VCW_PLUGIN_ROOT unset', async () => {
  const orig = process.env.VCW_PLUGIN_ROOT;
  delete process.env.VCW_PLUGIN_ROOT;
  const { run } = fresh();
  const result = await run({ hook_event_name: 'SessionStart' });
  assert.strictEqual(result, null);
  if (orig !== undefined) process.env.VCW_PLUGIN_ROOT = orig;
});

test('play-audio: run() returns null even when playback fails (nonexistent path)', async () => {
  process.env.VCW_PLUGIN_ROOT = '/nonexistent/path';
  const { run } = fresh();
  const result = await run({ hook_event_name: 'SessionStart' });
  assert.strictEqual(result, null);
});

test('play-audio: run() returns null when input is empty', async () => {
  process.env.VCW_PLUGIN_ROOT = '/fake/root';
  const { run } = fresh();
  assert.strictEqual(await run({}), null);
  assert.strictEqual(await run(null), null);
  assert.strictEqual(await run(undefined), null);
});
