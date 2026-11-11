'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const GATED_AGENT = 'viva-developer';

function defaultStateRoot() {
  return path.join(os.homedir(), '.claude', 'vivastack-cc-workflows');
}

// True iff the run log contains an entry written by viva-coordinator's
// Plan Approval Gate (Step 3): {"status":"plan_approved", ...}.
function isPlanApproved(runJsonlPath) {
  let raw;
  try {
    raw = fs.readFileSync(runJsonlPath, 'utf8');
  } catch {
    return false; // no run log → treat as not approved (fail closed)
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj && obj.status === 'plan_approved') return true;
  }
  return false;
}

async function run(input, deps = {}) {
  const subagent = input?.tool_input?.subagent_type || '';
  // Only the viva-developer spawn is gated. Every other Agent call
  // (forks, Explore, reviewers, planner, tester, etc.) passes through.
  if (subagent !== GATED_AGENT) return null;

  const stateRoot = deps.stateRoot || defaultStateRoot();
  const runJsonl = path.join(stateRoot, 'runs', 'latest', 'run.jsonl');

  if (isPlanApproved(runJsonl)) return null;

  return {
    decision: 'block',
    reason:
      '[VCW] Plan approval gate: viva-developer must not start until the ' +
      'user has explicitly approved the plan.\n' +
      `No "plan_approved" entry was found in the current run log:\n  ${runJsonl}\n` +
      'viva-coordinator must complete Step 3 (Plan Approval Gate) first — ' +
      'present docs/plans/<date>-<name>.md, obtain explicit user approval, ' +
      'and append a {"status":"plan_approved"} line to run.jsonl — before ' +
      'launching viva-developer.',
  };
}

module.exports = { run, isPlanApproved };
