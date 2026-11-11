'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { statePath, readJSON } = require('../lib/state');

async function run(input) {
  const cwd = input?.cwd || process.cwd();
  const lines = [];

  // Git context (replaces .claude/hooks/session-start.sh)
  try {
    const branch = execSync('git branch --show-current', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const commit = execSync('git log -1 --oneline', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const dirty = execSync('git status --porcelain', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean).length;
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    lines.push(`=== Session Context (${ts}) ===`);
    lines.push(`Branch: ${branch}`);
    lines.push(`Latest commit: ${commit}`);
    lines.push(dirty > 0 ? `Uncommitted changes: ${dirty} file(s)` : 'Working tree: clean');
    lines.push('===');
  } catch { /* not a git repo */ }

  // Session memory hydration
  try {
    const sessionsDir = statePath('sessions');
    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('-session.tmp'))
      .sort().reverse();

    const projectName = path.basename(cwd);
    const best = files.find(f => f.includes(projectName)) || files[0];

    if (best) {
      const content = fs.readFileSync(path.join(sessionsDir, best), 'utf8');
      const m = content.match(/<!-- VCW:SUMMARY:START -->([\s\S]*?)<!-- VCW:SUMMARY:END -->/);
      if (m) {
        lines.push('\n=== Previous Session Summary ===');
        lines.push(m[1].trim());
        lines.push('===');
      }
    }
  } catch { /* no sessions yet */ }

  // Pending CLAUDE.md suggestion drafts (Stop hook output, awaiting review)
  try {
    const sessionsDir = statePath('sessions');
    const suggestions = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('-claude-md-suggest.md'))
      .sort().reverse()
      .slice(0, 3);
    if (suggestions.length) {
      lines.push('\n=== Pending CLAUDE.md update suggestions ===');
      lines.push('Drafts written by the Stop hook — review and copy useful items into CLAUDE.md, then delete:');
      for (const f of suggestions) {
        lines.push(`  - ${path.join(sessionsDir, f)}`);
      }
      lines.push('===');
    }
  } catch { /* no sessions dir yet */ }

  // Project type detection
  try {
    const langs = [];
    if (fs.existsSync(path.join(cwd, 'package.json'))) langs.push('javascript/typescript');
    if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) langs.push('python');
    if (fs.existsSync(path.join(cwd, 'go.mod'))) langs.push('go');
    if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) langs.push('rust');
    if (langs.length) lines.push(`Project type: ${JSON.stringify({ languages: langs })}`);
  } catch { /* ignore */ }

  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  };
}

module.exports = { run };
