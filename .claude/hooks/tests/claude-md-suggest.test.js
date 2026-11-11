'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'vivastack-cc-workflows', 'sessions');

function uniqueSessionId(label) {
  return `cms-test-${label}-${process.pid}-${Date.now()}`;
}

function writeTranscript(tmpDir, entries) {
  const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
  fs.writeFileSync(transcriptPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return transcriptPath;
}

function findSuggestionFile(sessionId) {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const f = fs.readdirSync(SESSIONS_DIR).find(name => name.includes(sessionId) && name.endsWith('-claude-md-suggest.md'));
  return f ? path.join(SESSIONS_DIR, f) : null;
}

function cleanupSuggestion(sessionId) {
  const f = findSuggestionFile(sessionId);
  if (f) fs.unlinkSync(f);
}

test('claude-md-suggest: non-blocking with empty input', async () => {
  delete require.cache[require.resolve('../scripts/claude-md-suggest')];
  const { run } = require('../scripts/claude-md-suggest');
  const result = await run({});
  assert.ok(result == null, 'must never block');
});

test('claude-md-suggest: missing transcript writes nothing and returns null', async () => {
  const sessionId = uniqueSessionId('no-transcript');
  delete require.cache[require.resolve('../scripts/claude-md-suggest')];
  const { run } = require('../scripts/claude-md-suggest');
  const result = await run({ session_id: sessionId, transcript_path: '/nonexistent/path.jsonl' });
  assert.ok(result == null);
  assert.equal(findSuggestionFile(sessionId), null, 'no suggestion file should be written');
});

test('claude-md-suggest: transcript with no signals writes nothing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-'));
  const sessionId = uniqueSessionId('no-signal');
  try {
    const transcriptPath = writeTranscript(tmpDir, [
      { type: 'user', message: { role: 'user', content: 'show me the file' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }] } },
    ]);
    delete require.cache[require.resolve('../scripts/claude-md-suggest')];
    const { run } = require('../scripts/claude-md-suggest');
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    assert.equal(findSuggestionFile(sessionId), null, 'low-signal session: no file');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanupSuggestion(sessionId);
  }
});

test('claude-md-suggest: captures user correction signals', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-'));
  const sessionId = uniqueSessionId('correction');
  try {
    const transcriptPath = writeTranscript(tmpDir, [
      { type: 'user', message: { role: 'user', content: 'no, you should always run npm test from .claude/hooks not from the root' } },
      { type: 'user', message: { role: 'user', content: 'from now on, use settings.local.json for local overrides' } },
    ]);
    delete require.cache[require.resolve('../scripts/claude-md-suggest')];
    const { run } = require('../scripts/claude-md-suggest');
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    const file = findSuggestionFile(sessionId);
    assert.ok(file, 'expected suggestion file to be written');
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('CLAUDE.md'), 'header should mention CLAUDE.md');
    assert.ok(content.includes('npm test') || content.includes('correction') || content.toLowerCase().includes('should always'),
      `correction text should be surfaced. got: ${content}`);
    assert.ok(content.toLowerCase().includes('from now on') || content.includes('settings.local.json'),
      'persistent-rule signal should be surfaced');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanupSuggestion(sessionId);
  }
});

test('claude-md-suggest: captures repeated bash commands', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-'));
  const sessionId = uniqueSessionId('repeated-bash');
  try {
    // 3 invocations of the same command — workflow worth documenting
    const repeated = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cd .claude/hooks && npm test' } }] } };
    const entries = [
      // need at least one user message so transcript looks like a real session
      { type: 'user', message: { role: 'user', content: 'something the user said' } },
      repeated, repeated, repeated,
    ];
    const transcriptPath = writeTranscript(tmpDir, entries);
    delete require.cache[require.resolve('../scripts/claude-md-suggest')];
    const { run } = require('../scripts/claude-md-suggest');
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    const file = findSuggestionFile(sessionId);
    assert.ok(file, 'expected suggestion file when repeated bash commands appear');
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('npm test'), 'repeated command should be listed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanupSuggestion(sessionId);
  }
});

test('claude-md-suggest: idempotent overwrite (no duplicate suggestions)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-'));
  const sessionId = uniqueSessionId('idempotent');
  try {
    const transcriptPath = writeTranscript(tmpDir, [
      { type: 'user', message: { role: 'user', content: 'from now on, prefer pnpm over npm' } },
    ]);
    delete require.cache[require.resolve('../scripts/claude-md-suggest')];
    const { run } = require('../scripts/claude-md-suggest');
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    const matches = fs.readdirSync(SESSIONS_DIR).filter(f => f.includes(sessionId) && f.endsWith('-claude-md-suggest.md'));
    assert.equal(matches.length, 1, `expected exactly one suggestion file, got ${matches.length}: ${matches.join(', ')}`);
    const content = fs.readFileSync(path.join(SESSIONS_DIR, matches[0]), 'utf8');
    // signal text should appear exactly once after idempotent rewrite
    const occurrences = content.split('prefer pnpm').length - 1;
    assert.equal(occurrences, 1, `expected single occurrence of signal text, got ${occurrences}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanupSuggestion(sessionId);
  }
});

test('claude-md-suggest: writes session id and date into filename', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-'));
  const sessionId = uniqueSessionId('filename');
  try {
    const transcriptPath = writeTranscript(tmpDir, [
      { type: 'user', message: { role: 'user', content: 'from now on, use the strict profile in CI' } },
    ]);
    delete require.cache[require.resolve('../scripts/claude-md-suggest')];
    const { run } = require('../scripts/claude-md-suggest');
    await run({ session_id: sessionId, transcript_path: transcriptPath });
    const file = findSuggestionFile(sessionId);
    assert.ok(file, 'file should exist');
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(path.basename(file).startsWith(today), `filename should start with date: ${path.basename(file)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanupSuggestion(sessionId);
  }
});
