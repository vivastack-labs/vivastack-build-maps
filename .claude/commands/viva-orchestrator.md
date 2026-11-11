---
description: "Run a plan through developer → reviewer → tester → post-processing subagents with auto-retry and logging"
argument-hint: "[plan-path | retry]"
origin: VivaStack
---

<!-- Project-local definition. Sourced from `.claude/commands/`. If using the published plugin, see plugin docs. -->

> Adapted from the viva-orchestrator PRD. Part of the VivaStack PRP workflow series.

# viva-orchestrator

Drive a `.plan.md` file through a four-stage subagent pipeline: `orch-developer` → `orch-code-reviewer` → `orch-tester` → `orch-post-processing`. Handles auto-retry on reviewer or tester failure, structured logging, and report aggregation.

**Input**: `$ARGUMENTS`

---

## Phase 0 — DETECT

Parse `$ARGUMENTS` to determine execution mode:

| Argument | Mode | Action |
|---|---|---|
| `retry` | Resume mode | Read latest log, find interruption point, resume from next stage |
| Ends with `.plan.md` | Single-plan mode | Run that one plan through the full pipeline |
| *(blank / empty)* | Batch mode | Loop over `.claude/PRPs/plans/*.plan.md`, sorted oldest first |

### Single-plan mode

Set `planPath = $ARGUMENTS`. Verify the file exists:

```bash
ls "$planPath" 2>/dev/null || echo "ERROR: plan file not found"
```

If the file does not exist, stop with: "Plan file not found: `$planPath`. Run `/prp-plan` to generate one."

### Batch mode (blank argument)

```bash
ls -tr .claude/PRPs/plans/*.plan.md 2>/dev/null
```

If no files found, output: "No plan files in `.claude/PRPs/plans/`. Done." and exit cleanly.

Process each plan in the list order. On any plan failure, stop the loop — do NOT continue to the next plan.

### Resume mode (`retry`)

Jump to Phase 1 — INIT (resume sub-section).

**CHECKPOINT**: Mode determined. Plan path(s) resolved.

---

## Phase 1 — INIT

### Normal start

Create the log file:

```bash
mkdir -p .claude/PRPs/logs
LOG_FILE=".claude/PRPs/logs/$(date -u +%Y%m%d_%H%M%S)_orchestrator.log"
```

Write the header:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ORCHESTRATOR START" >> "$LOG_FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] PLAN: $planPath" >> "$LOG_FILE"
```

Initialize in-memory state:

```
{
  planPath: string,            // path to current plan file
  planName: string,            // stem of plan file (e.g. "feature-auth")
  currentAgent: string,        // name of currently running agent
  developerAgentId: string,    // captured from Agent tool return (if available)
  retryCount: number,          // current retry count (max: 3)
  agentResults: []             // { agent, status, reportPath, timestamp }
}
```

Derive `planName` from the plan file stem:
- `feature-auth.plan.md` → `feature-auth`
- `.claude/PRPs/plans/my-feature.plan.md` → `my-feature`

### Resume mode

Read the most recent log file:

```bash
ls -t .claude/PRPs/logs/*_orchestrator.log 2>/dev/null | head -1
```

Parse the last `AGENT:* COMPLETE` line to identify the last completed stage.

| Last completed stage | Resume from |
|---|---|
| (none) | Phase 2 — DEVELOPER |
| `orch-developer` | Phase 3 — REVIEWER |
| `orch-code-reviewer` | Phase 4 — TESTER |
| `orch-tester` | Phase 5 — POST-PROCESSING |
| `orch-post-processing` | Already complete — report and exit |

If the last line is `MAX_RETRY_EXCEEDED`, stop: "Last run hit the retry cap. Inspect reports in `.claude/PRPs/reports/` manually before re-running."

**CHECKPOINT**: Log file ready. State initialized.

---

## Phase 2 — DEVELOPER

Log the start:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-developer START" >> "$LOG_FILE"
```

Invoke the developer agent using the Agent tool:

```
subagent_type: orch-developer
description: Execute plan implementation
model: sonnet
prompt: |
  Execute the viva-prp-implement skill for the following plan:
  Plan file: {planPath}
  Return exactly one line of JSON as your final message:
  {"status": "success" | "failure", "reportPath": "<path>"}
```

Capture the agent's final JSON output as `developerResult`. Also attempt to capture the agent identifier returned by the Agent tool — if the platform surfaces an `agentId` field in the return value, store it as `developerAgentId` for use in retry (Phase 6).

Log the captured agent identifier immediately after invocation:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-developer agentId=$developerAgentId" >> "$LOG_FILE"
```

If `developerAgentId` is unavailable (empty or not surfaced by the platform), log `agentId=unavailable` so the log remains parseable.

Parse `developerResult`:

| `developerResult.status` | Action |
|---|---|
| `"success"` | Log COMPLETE, store result, proceed to Phase 3 |
| `"failure"` | Log COMPLETE with failure, stop — no auto-retry for developer failure |

Log the completion:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-developer COMPLETE status=$status reportPath=$reportPath" >> "$LOG_FILE"
```

On developer failure, output to user:

```
Developer agent failed. Manual intervention required.
Report: {developerResult.reportPath}
Re-run with: /viva-orchestrator retry
```

**CHECKPOINT**: Developer complete (success) or stopped (failure).

---

## Phase 3 — REVIEWER

Log the start:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-code-reviewer START" >> "$LOG_FILE"
```

Invoke the reviewer agent:

```
subagent_type: orch-code-reviewer
description: Review implementation against plan
model: sonnet
prompt: |
  Review the implementation for the following plan:
  Plan file: {planPath}
  Developer report: {developerResult.reportPath}
  Return exactly one line of JSON as your final message:
  {"status": "success" | "failure", "reportPath": "<path>"}
```

Log the completion:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-code-reviewer COMPLETE status=$status reportPath=$reportPath" >> "$LOG_FILE"
```

| `reviewerResult.status` | Action |
|---|---|
| `"success"` | Store result, proceed to Phase 4 |
| `"failure"` | Enter Phase 6 — RETRY (failed agent: `orch-code-reviewer`) |

**CHECKPOINT**: Reviewer complete (success) or retry triggered (failure).

---

## Phase 4 — TESTER

Log the start:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-tester START" >> "$LOG_FILE"
```

Invoke the tester agent:

```
subagent_type: orch-tester
description: Run project test suite
model: haiku
prompt: |
  Run the test suite for the following plan:
  Plan file: {planPath}
  Return exactly one line of JSON as your final message:
  {"status": "success" | "failure", "reportPath": "<path>"}
```

Log the completion:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-tester COMPLETE status=$status reportPath=$reportPath" >> "$LOG_FILE"
```

| `testerResult.status` | Action |
|---|---|
| `"success"` | Store result, proceed to Phase 5 |
| `"failure"` | Enter Phase 6 — RETRY (failed agent: `orch-tester`) |

**CHECKPOINT**: Tester complete (success) or retry triggered (failure).

---

## Phase 5 — POST-PROCESSING

Log the start:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-post-processing START" >> "$LOG_FILE"
```

Invoke the post-processing agent:

```
subagent_type: orch-post-processing
description: Commit implementation changes
model: haiku
prompt: |
  Commit the changes for the following plan:
  Plan file: {planPath}
  Return exactly one line of JSON as your final message:
  {"status": "success" | "failure", "reportPath": "<path>"}
```

Log the completion:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AGENT:orch-post-processing COMPLETE status=$status reportPath=$reportPath" >> "$LOG_FILE"
```

| `postResult.status` | Action |
|---|---|
| `"success"` | Proceed to Phase 8 — REPORT |
| `"failure"` | Log failure, stop — no auto-retry for post-processing; report to user for manual fix |

On post-processing failure:

```
Post-processing failed. The implementation is complete and tests pass, but the commit failed.
Report: {postResult.reportPath}
Fix manually: git add -A && git commit -m "feat: ..."
```

**CHECKPOINT**: Post-processing complete (success) or stopped with manual action required.

---

## Phase 6 — RETRY LOOP

Only entered when `orch-code-reviewer` or `orch-tester` reports failure.

### Step 1: Increment and check retry count

```
retryCount += 1
if retryCount > 3:
  log MAX_RETRY_EXCEEDED
  stop
```

Log:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] RETRY $retryCount/3: failed agent=$failedAgent reportPath=$failedReportPath" >> "$LOG_FILE"
```

If `retryCount > 3`:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] MAX_RETRY_EXCEEDED plan=$planName" >> "$LOG_FILE"
```

Output to user: "Maximum retries (3) exceeded. Inspect reports in `.claude/PRPs/reports/` and fix manually."

Stop.

### Step 2: Re-assign fix to developer

Retry state decisions:

| `retryCount` | Failed Agent | Action |
|---|---|---|
| 0..2 | `orch-code-reviewer` | Re-assign to developer → re-run reviewer |
| 0..2 | `orch-tester` | Re-assign to developer → re-run reviewer → re-run tester |
| 3+ | any | Stop, log MAX_RETRY_EXCEEDED |
| any | `orch-developer` | Stop, no auto-retry |

Attempt `SendMessage` to the original developer agent to preserve context:

```
SendMessage:
  to: {developerAgentId}
  message: |
    The following agent reported failure:
    Agent: {failedAgent}
    Report: {failedReportPath}
    Read the report, identify the issues, and fix them.
    Return exactly one line of JSON as your final message:
    {"status": "success" | "failure", "reportPath": "<path>"}
```

**GOTCHA — SendMessage availability**: The `SendMessage` tool may not be available in all Claude Code runtimes, and `developerAgentId` may not be surfaced by the `Agent` tool's return value. If `SendMessage` is unavailable or returns an error:

Fallback — spawn a fresh `orch-developer` with the failure context in the prompt:

```
subagent_type: orch-developer
description: Fix implementation issues from failure report
model: sonnet
prompt: |
  A previous implementation attempt failed validation.
  Plan file: {planPath}
  Failure report: {failedReportPath}
  Read the failure report, identify the issues, and fix them.
  The plan may already be in plans/completed/ — check both locations.
  Return exactly one line of JSON as your final message:
  {"status": "success" | "failure", "reportPath": "<path>"}
```

Note: The fresh spawn fallback loses the original developer agent's context. This is a known degradation; it is documented here so users are aware when reviewing retry logs.

### Step 3: Re-enter pipeline

After developer returns success:

- If failed agent was `orch-code-reviewer`: re-enter Phase 3 — REVIEWER.
- If failed agent was `orch-tester`: re-enter Phase 3 — REVIEWER, then Phase 4 — TESTER.

**CHECKPOINT**: Retry issued. Pipeline resumes from appropriate stage.

---

## Phase 7 — LOOP (batch mode only)

This phase applies only when running in batch mode (blank `$ARGUMENTS`).

After a plan completes Phase 5 successfully:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] PLAN COMPLETE: $planName" >> "$LOG_FILE"
```

Move to the next plan in the sorted list. Repeat Phases 2 through 5 for each plan.

On any plan failure (developer, reviewer cap exceeded, tester cap exceeded, post-processing failure): stop the loop. Do NOT continue to the next plan.

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] LOOP ABORTED at plan=$planName" >> "$LOG_FILE"
```

**CHECKPOINT**: All plans processed (success) or loop aborted (failure).

---

## Phase 8 — REPORT

Write the final log line:

```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ORCHESTRATOR COMPLETE plan=$planName status=$overallStatus retries=$retryCount" >> "$LOG_FILE"
```

Print the user-facing summary:

```
## Orchestration Complete

- **Plan**: {planPath}
- **Branch**: {current branch}
- **Status**: All stages complete

### Stage Summary

| Stage | Status | Report |
|---|---|---|
| Developer | pass | {developerResult.reportPath} |
| Code Reviewer | pass | {reviewerResult.reportPath} |
| Tester | pass | {testerResult.reportPath} |
| Post-Processing | pass | {postResult.reportPath} |

### Retry Summary

Retries used: {retryCount} / 3

### Artifacts

- Log: {LOG_FILE}
- Reports: .claude/PRPs/reports/{planName}_orch-*.md

> Next step: Run `/code-review` for a final human review, or `/prp-pr` to create a pull request.
```

---

## Edge Cases

| Case | Behavior |
|---|---|
| `$ARGUMENTS` blank, no `.plan.md` files | Warning + clean exit |
| Plan file path invalid | Developer returns failure → orchestrator stops |
| All 4 agents succeed first try | No retry, single log file |
| Reviewer fails once, succeeds on retry 1 | `retryCount=1` logged |
| Tester fails 3 times | `MAX_RETRY_EXCEEDED` logged, orchestrator stops |
| Developer fails (initial run) | No auto-retry, user directed to inspect report |
| `SendMessage` unavailable | Fresh `orch-developer` spawn with report context (fallback) |
| Test suite undefined in project | Tester returns `success` + `warning: "no tests defined"` |
| Post-processing finds nothing to commit | `success` + warning (developer may have already committed) |
| Multi-plan batch, plan 2 fails | Loop aborts; plan 3 not started |
| Concurrent orchestrator invocations on same plan | User error; each run creates a unique timestamped log, but reports overwrite |
