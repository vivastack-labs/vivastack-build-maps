'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KNOWN_MODULES = ['frontend', 'backend', 'infra'];
const RULES_FILE = '.claude-module-rules.md';

/**
 * Resolve which module (if any) the current working directory belongs to.
 * Returns 'frontend', 'backend', 'infra', or null.
 */
function detectModule(cwd) {
  const parts = cwd.split(path.sep);
  for (const mod of KNOWN_MODULES) {
    if (parts.includes(mod)) return mod;
  }
  return null;
}

/**
 * Find the project root by walking up from cwd until a .claude directory is found.
 */
function findProjectRoot(cwd) {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Run a shell command silently; return '' on error. */
function shell(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }).trim();
  } catch {
    return '';
  }
}

/** Read module rules file; return content or null. */
function readModuleRules(rulesPath) {
  try {
    return fs.readFileSync(rulesPath, 'utf8');
  } catch {
    return null;
  }
}

/** Recent git commits touching a module directory (up to 5). */
function recentModuleCommits(moduleDir, cwd) {
  const rel = path.relative(cwd, moduleDir);
  return shell(`git log --oneline -5 -- "${rel}"`, { cwd });
}

/** Files changed on current branch vs main/master for this module. */
function changedFiles(moduleDir, cwd) {
  const rel = path.relative(cwd, moduleDir);
  const base = shell('git rev-parse --verify main 2>/dev/null || git rev-parse --verify master', { cwd });
  if (!base) return '';
  return shell(`git diff --name-only ${base}...HEAD -- "${rel}"`, { cwd });
}

/** Open GitHub issues mentioning this module (best-effort, requires gh). */
function openIssues(moduleName) {
  const raw = shell(`gh issue list --label "${moduleName}" --state open --json title,number --jq '.[] | "#\\(.number) \\(.title)"'`);
  if (raw) return raw;
  return shell(`gh issue list --search "${moduleName}" --state open --json title,number --jq '.[] | "#\\(.number) \\(.title)"'`);
}

async function run(input) {
  const cwd = input?.cwd || process.cwd();
  const projectRoot = findProjectRoot(cwd) || cwd;
  const lines = [];

  // ── Case 1: inside a known module directory ──────────────────────────────
  const activeModule = detectModule(cwd);
  if (activeModule) {
    const moduleDir = path.join(projectRoot, activeModule);
    const rulesPath = path.join(moduleDir, RULES_FILE);
    const rules = readModuleRules(rulesPath);

    lines.push(`=== Module Context: ${activeModule} ===`);
    if (rules) {
      lines.push(rules.trim());
    } else {
      lines.push(`(no ${RULES_FILE} found — consider creating one)`);
    }

    const commits = recentModuleCommits(moduleDir, projectRoot);
    if (commits) {
      lines.push('\nRecent commits in this module:');
      lines.push(commits.split('\n').map(l => `  ${l}`).join('\n'));
    }

    const changed = changedFiles(moduleDir, projectRoot);
    if (changed) {
      lines.push('\nFiles changed on this branch (this module):');
      lines.push(changed.split('\n').map(l => `  ${l}`).join('\n'));
    }

    const issues = openIssues(activeModule);
    if (issues) {
      lines.push(`\nOpen GitHub issues (${activeModule}):`);
      lines.push(issues.split('\n').map(l => `  ${l}`).join('\n'));
    }

    lines.push('===');
  }

  // ── Case 2: at project root — show module overview ───────────────────────
  if (!activeModule) {
    const present = KNOWN_MODULES.filter(m => fs.existsSync(path.join(projectRoot, m)));
    if (present.length === 0) return null;

    lines.push('=== Module Overview ===');
    lines.push(`Packages found: ${present.join(', ')}`);
    lines.push('Open with `cd <package> && claude` for module-specific context.');

    for (const mod of present) {
      const commits = recentModuleCommits(path.join(projectRoot, mod), projectRoot);
      if (commits) {
        lines.push(`\nRecent ${mod} commits:`);
        lines.push(commits.split('\n').slice(0, 3).map(l => `  ${l}`).join('\n'));
      }
    }
    lines.push('===');
  }

  if (lines.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  };
}

module.exports = { run, detectModule, findProjectRoot, readModuleRules };
