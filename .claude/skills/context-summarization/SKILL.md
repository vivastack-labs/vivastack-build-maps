---
name: context-summarization
description: Create a detailed conversation summary that replaces history for context compaction. Preserves all user instructions verbatim, captures task state, and defines the exact next step so an agent can resume cold.
origin: viva-cc-workflows
---

# Context Summarization

Generate a structured summary that **replaces** the current conversation history.
The agent resuming from this summary will have zero other context — it must be
self-contained and complete.

## When to Activate

- User explicitly requests a context summary or compaction
- Approaching context limits and work needs to continue in a new session
- Handing off a long-running task to a fresh agent
- After the `/clear` command when the user wants a fresh start with preserved state
- When asked to "summarize the conversation" for resumption purposes

## Analysis Step (mandatory — internal, before writing)

Before writing the summary, reason through the conversation:

1. Extract every user instruction, requirement, and constraint — look for imperative
   language ("do X", "never Y", "always Z", "MUST", "DO NOT")
2. Decide: is this a **repeatable workflow** (processing N items, same steps each
   iteration) or a **linear task** (one-shot implementation, debugging session)?
3. Trace the action timeline chronologically: what was attempted, what succeeded,
   what failed, what changed direction
4. Identify the exact state at summary time — not what was planned, but what is
   actually true right now

## Output Format

The summary must contain every section below. Write "N/A" or "None" only if a
section genuinely has no content — never omit a section.

---

### 1. USER INSTRUCTIONS

The most critical section. Loss of user instructions causes the agent to deviate.

- Verbatim initial task definition (quote the user's exact words when possible)
- Every explicit requirement and acceptance criterion
- All "DO NOT", "ALWAYS", "MUST", "NEVER" constraints
- Any corrections or feedback that changed the approach mid-task

### 2. TASK TEMPLATE _(include only for repeatable workflows)_

If the task is a repeatable workflow (same steps applied to N items):

- **Pattern:** The step sequence repeated each iteration
- **Decision criteria:** How to decide what to do at each branch point
- **Completed example:** One full iteration shown end-to-end
- **Remaining items:** What has not yet been processed

Omit this section entirely for linear (non-repeating) tasks.

### 3. CONSTRAINTS AND RULES

- All user-specified rules and restrictions (technical and process)
- Edge cases discovered during the work and how they were resolved
- Environmental constraints (specific tools, versions, commands that must/must not
  be used)
- Scope boundaries (what is explicitly out of scope)

### 4. ACTIONS TAKEN

Chronological log of meaningful actions:

- Files read, written, or edited (with paths)
- Commands run and their outcomes
- Pages visited and elements interacted with (for browser-driven tasks)
- Forms filled, buttons clicked, API calls made
- Agent invocations and their results

Focus on **what actually happened**, not what was planned.

### 5. ERRORS AND FIXES

- What went wrong, the exact error or symptom, and how it was resolved
- Approaches that failed and **why** they failed (so they are not retried)
- Partial fixes that helped but did not fully resolve an issue
- Known workarounds and their limitations

### 6. PROGRESS TRACKING

For linear tasks:
- What is confirmed complete (with evidence: test passed, output verified, etc.)
- What is in progress and its current state
- What has not been started yet

For repeatable workflows:
- Items completed vs. remaining (list both explicitly)
- Current position in the queue

### 7. CURRENT STATE

- Working directory and relevant file paths
- Current branch, last commit, and whether working tree is clean
- Active URL or application state (for browser-driven tasks)
- Authentication/login status if relevant
- Any background processes or servers still running
- Environment variables or secrets that were set

### 8. NEXT STEP

The single most important action to take when resuming. Be precise enough that
zero thinking is required about where to start.

Bad: "Continue the implementation."
Good: "Run `cd .claude/hooks && npm test` — the session-start test at line 42 is
still failing because the mock for `child_process` returns the wrong exit code.
Fix `tests/session-start.test.js` first, then re-run."

---

## Output Rules

- Write the summary in plain Markdown, no extra wrapper or preamble
- Use the section headers exactly as shown above
- Preserve user quotes verbatim in section 1 — paraphrase nowhere in that section
- Do not speculate about intent; report only what was observed
- If information for a section is genuinely unavailable, write it explicitly:
  "Not observed in this conversation."
- The summary replaces the conversation — it must stand alone

## Final Step (mandatory)

After writing the summary to the conversation, save it to a checkpoint file:

1. Get the current timestamp: `date +%Y%m%d%H%M%S`
2. Create the directory if it doesn't exist: `mkdir -p docs/checkpoints`
3. Write the summary content to `docs/checkpoints/[yyyymmddhhmmss].md`

The checkpoint file is the durable record — it survives `/clear` and session restarts.

## Example Skeleton

```markdown
## 1. USER INSTRUCTIONS

> "Create a detailed summary of this conversation that will REPLACE the conversation
> history. The agent will continue working with only this summary..."

Requirements:
- Preserve ALL user instructions verbatim
- Include all 8 sections
- DO NOT omit sections — write "N/A" if empty
- MUST identify repeatable workflows and include TASK TEMPLATE section

## 2. TASK TEMPLATE

N/A — this is a one-shot summarization task, not a repeatable workflow.

## 3. CONSTRAINTS AND RULES

- Summary replaces history entirely; must be self-contained
- User instructions section must quote verbatim, not paraphrase
- "NEXT STEP" must be actionable without additional context

## 4. ACTIONS TAKEN

1. Read `.claude/skills/git-workflow/SKILL.md` to understand skill format
2. Read `.claude/skills/safety-guard/SKILL.md` for a compact skill example
3. Created `.claude/skills/context-summarization/SKILL.md`

## 5. ERRORS AND FIXES

None encountered.

## 6. PROGRESS TRACKING

- Complete: skill file created
- Remaining: none

## 7. CURRENT STATE

- Working directory: `/home/biba/works/viva-cc-practice`
- Branch: `main`, working tree clean
- New file: `.claude/skills/context-summarization/SKILL.md` (unstaged)

## 8. NEXT STEP

Stage and commit the new skill file:
`git add .claude/skills/context-summarization/SKILL.md && git commit -m "feat: add context-summarization skill"`
```
