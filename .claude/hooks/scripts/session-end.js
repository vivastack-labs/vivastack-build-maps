// plugins/vivastack-core/hooks/scripts/session-end.js
'use strict';
const fs = require('fs');
const path = require('path');
const { statePath, atomicWrite } = require('../lib/state');

const START_MARKER = '<!-- VCW:SUMMARY:START -->';
const END_MARKER = '<!-- VCW:SUMMARY:END -->';

function parseTranscript(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return { tasks: [], tools: {}, files: [] };

  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const tasks = [], toolCounts = {}, files = new Set();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.role === 'user' && typeof entry.message?.content === 'string') {
        tasks.push(entry.message.content.slice(0, 120));
      }
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            toolCounts[block.name] = (toolCounts[block.name] || 0) + 1;
            const fp = block.input?.file_path || block.input?.path;
            if (fp) files.add(fp);
          }
        }
      }
    } catch { /* malformed line */ }
  }

  return {
    tasks: tasks.slice(-10),
    tools: Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 20),
    files: [...files].slice(0, 30),
  };
}

async function run(input) {
  try {
    const transcriptPath = input?.transcript_path;
    const sessionId = (input?.session_id || Date.now().toString()).replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 16);
    const date = new Date().toISOString().slice(0, 10);
    const sessionFile = statePath('sessions', `${date}-${sessionId}-session.tmp`);

    const { tasks, tools, files } = transcriptPath
      ? parseTranscript(transcriptPath)
      : { tasks: [], tools: [], files: [] };

    const summary = [
      `Session: ${date}-${sessionId}`,
      tasks.length ? `\nTasks (last ${tasks.length}):\n${tasks.map(t => `  - ${t}`).join('\n')}` : '',
      tools.length ? `\nTop tools:\n${tools.map(([t, n]) => `  ${t}: ${n}`).join('\n')}` : '',
      files.length ? `\nFiles touched:\n${files.map(f => `  ${f}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    // Idempotent write — preserve content outside markers
    let existing = '';
    if (fs.existsSync(sessionFile)) existing = fs.readFileSync(sessionFile, 'utf8');

    const beforeMarker = existing.includes(START_MARKER)
      ? existing.slice(0, existing.indexOf(START_MARKER))
      : existing;

    const content = `${beforeMarker}${START_MARKER}\n${summary}\n${END_MARKER}\n`;
    atomicWrite(sessionFile, content);
  } catch { /* non-blocking */ }
}

module.exports = { run };
