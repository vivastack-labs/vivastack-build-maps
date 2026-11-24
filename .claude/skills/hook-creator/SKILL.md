---
name: hook-creator
description: >
  Create a new Claude Code hook for this project using TDD. Use this skill
  whenever someone wants to add a hook, implement automation for a Claude Code
  lifecycle event (PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd,
  PreCompact, PermissionRequest, TaskCreated, TaskCompleted), intercept a tool
  call, block dangerous commands, run side-effect scripts, or wire up any
  event-driven behavior in .claude/hooks/. Also trigger when the user says
  things like "hook into", "run something when Claude", "block X", "detect Y
  before commit", or "notify me when Z happens". Enforces the full RED →
  GREEN → register → document TDD cycle.
---

# Hook Creator

This skill guides you through creating a new hook for this project using
test-driven development. Every step is sequential — do not skip ahead.

## Before you start

Read `hooks-reference.md` (next to this file) for the hook event types, and
`.claude/rules/hooks.md` for the permission rules.
The key files you'll touch:

```
.claude/hooks/
├── scripts/<name>.js        ← new hook script
├── tests/<name>.test.js     ← new test (write FIRST)
├── hooks.json               ← source-of-truth registry
├── README.md                ← documentation
└── run-with-flags.js        ← dispatcher (do not modify)

.claude/settings.json        ← mirrors hooks.json (must stay in sync)
```

## Step 0 — Clarify intent

Nail these five things before writing any code:

1. **Event** — which lifecycle event fires this hook?

   | Event | Typical use |
   |-------|-------------|
   | `PreToolUse` | Block / redirect before a tool runs |
   | `PostToolUse` | Log, notify, lint after a tool runs |
   | `Stop` | Format, summarize at end of Claude's turn |
   | `SessionStart` | Inject context when a session opens |
   | `SessionEnd` | Clean up when session closes |
   | `PreCompact` | Record state before compaction |
   | `PermissionRequest` / `TaskCreated` / `TaskCompleted` | Notifications |
   | `InstructionsLoaded` | React when CLAUDE.md / rules load (matcher: `load_reason`) |
   | `UserPromptExpansion` | Gate slash command / MCP prompt expansion (matcher: `command_name`) |
   | `PostToolBatch` | Inspect a resolved batch of parallel tool calls |
   | `MessageDisplay` | Rewrite on-screen assistant text (display-only) |

2. **Matcher** — which tool/field does it target? (`Bash`,
   `Edit|Write|MultiEdit`, `Agent`, `mcp_.*`, `.*`, or none). A few newer events
   match on a non-tool field instead: `UserPromptExpansion` → `command_name`,
   `InstructionsLoaded` → `load_reason`. `PostToolBatch` and `MessageDisplay`
   have no matcher.

3. **Block or observe?** — `PreToolUse`, `UserPromptExpansion`, and
   `PostToolBatch` can return `{ decision: 'block' }`. `MessageDisplay` is
   display-only (rewrites text via `displayContent`, cannot block). All other
   events are side-effect only — returning `decision` has no effect.

4. **Profile** — which profiles run this hook?

   | Profile | When active |
   |---------|-------------|
   | `minimal` | CI, automation, always-on safety |
   | `standard` | Normal development (default) |
   | `strict` | Extra enforcement, opt-in |

   Use `minimal,standard,strict` for security-critical hooks.

5. **Hook ID** — format: `<scope>:<event>:<matcher>:<name>`
   Examples: `vcw:pre:bash:block-no-verify`, `project:stop:format-yaml`

## Step 1 — Write the test (RED)

Create `tests/<name>.test.js` **before writing the script**.

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./helpers/test-utils');

// Non-triggering input → hook must pass through (return null)
test('<name>: irrelevant input → pass', async () => {
  const result = await runScript('scripts/<name>.js', {
    tool_input: { command: 'ls -la' },
  });
  assert.ok(result == null || result.decision !== 'block');
});

// Triggering input → hook must block with a reason
test('<name>: dangerous input → block', async () => {
  const result = await runScript('scripts/<name>.js', {
    tool_input: { command: '<trigger-command>' },
  });
  assert.equal(result?.decision, 'block');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});
```

Confirm RED — the file does not exist yet so the import fails:

```bash
cd .claude/hooks && node tests/<name>.test.js
# Expected: error (module not found) — that is the RED signal
```

Do not proceed until you see a failure.

## Step 2 — Implement the script (GREEN)

Create `scripts/<name>.js`:

```js
'use strict';

async function run(input) {
  // Extract the relevant field for your event/matcher
  const cmd = input?.tool_input?.command || '';          // Bash
  // const filePath = input?.tool_input?.file_path || ''; // Edit/Write

  // Early guard — skip inputs that don't concern this hook
  if (/* not relevant */) return null;

  // Detection logic
  if (/* bad condition */) {
    return {
      decision: 'block',
      reason: '[VCW] One-line explanation.\nWhat to do instead.',
    };
  }
  return null;
}

module.exports = { run };
```

Run tests again and confirm GREEN:

```bash
cd .claude/hooks && node tests/<name>.test.js
# Expected: all tests pass
```

Then run the full suite to catch regressions:

```bash
cd .claude/hooks && npm test
```

Coverage check:

```bash
cd .claude/hooks && npm run coverage
# Target: ≥80% lines/functions, ≥65% branches
```

## Step 3 — Register in `hooks.json`

Add the entry under the correct event and matcher. Follow this shape exactly:

```json
{
  "type": "command",
  "command": "node $VCW_PLUGIN_ROOT/hooks/run-with-flags.js <hookId> $VCW_PLUGIN_ROOT/hooks/scripts/<name>.js <profiles-csv>",
  "timeout": 5
}
```

Timeout guide:
- Quick regex checks: `5`
- Shell commands (gitleaks, lint tools): `10–30`
- Formatters or type-checkers at Stop: `30–270`

Add `"statusMessage": "..."` for SessionStart hooks that inject context.

## Step 4 — Mirror in `settings.json`

Copy the identical entry into the matching section of `.claude/settings.json`.
`hooks.json` is the source of truth; `settings.json` must mirror it.
If they diverge, the plugin cache may silently override your changes (see CLAUDE.md).

## Step 5 — Document in `README.md`

Add an entry to `.claude/hooks/README.md` under the appropriate event section.

**Complex hooks** (detection logic, state, external commands) get the full block:

```markdown
#### `<name>.js` — <one-line description>

**Hook ID:** `<hookId>` | **プロファイル:** <profiles>

**全体の流れ**
\`\`\`text
Event
  └─► run(input)
        ├─► guard condition → null
        └─► trigger condition → block / side-effect
\`\`\`

**返り値**
\`\`\`js
{ decision: 'block', reason: '...' }  // or null
\`\`\`

**ポイント**
- Key constraint or edge case
```

**Simple advisory/logging hooks** get a compact one-liner:

```markdown
#### `<name>.js` — <one-line description>
**Hook ID:** `...` | **プロファイル:** ...
**目的:** One sentence. **返り値:** 常に `null`
```

Also add a row to the test file table at the bottom of README.md.

## Step 6 — Smoke test

```bash
echo '{"tool_input":{"command":"<trigger-command>"}}' \
  | node .claude/hooks/run-with-flags.js <hookId> \
      .claude/hooks/scripts/<name>.js minimal,standard,strict
```

Verify the JSON output matches what you expect.

---

## Patterns reference

### Blocking (PreToolUse / Bash)

```js
async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (!/^\s*git\s/.test(cmd)) return null;
  // Block --force / -f but allow --force-with-lease and --force-if-includes
  const FORCE_RE = /(?:^|\s)(?:--force(?!-with-lease|-if-includes|[-\w])|-f(?=\s|$))/;
  if (FORCE_RE.test(cmd)) {
    return { decision: 'block', reason: '[VCW] Force-push blocked.\nUse --force-with-lease instead.' };
  }
  return null;
}
```

### File-path guard (PreToolUse / Edit|Write|MultiEdit)

```js
async function run(input) {
  const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
  if (!filePath) return null;
  if (/protected-file-pattern/.test(filePath)) {
    return { decision: 'block', reason: '[VCW] Direct edits to this file are blocked.' };
  }
  return null;
}
```

### Side-effect only (PostToolUse / Stop)

```js
async function run(input) {
  try {
    // Log, notify, format — never return { decision: 'block' }
    process.stderr.write('[VCW] Advisory message\n');
  } catch { /* non-blocking */ }
}
```

### Persistent state across invocations

```js
const { statePath, atomicWrite, readJSON } = require('../lib/state');
const STATE_FILE = statePath('myfeature/state.json');

async function run(input) {
  const state = readJSON(STATE_FILE) || {};
  // read / update state
  atomicWrite(STATE_FILE, state);
  return null;
}
```

### Secret masking before logging

```js
const { sanitize } = require('../lib/sanitize');
process.stderr.write(`[VCW] cmd: ${sanitize(cmd)}\n`);
```

---

## Test utilities cheat-sheet

From `tests/helpers/test-utils.js`:

| Function | Use when |
|----------|----------|
| `runScript(rel, input)` | Unit test — in-process, fast |
| `runHook(rel, input, flags?, env?)` | Integration test — via `run-with-flags.js`, tests profile gating |
| `createTempDir()` | Hook reads/writes temp files |
| `withEnv(vars, fn)` | Hook depends on env variables |

---

## Common mistakes

- **No early guard** — always return `null` for irrelevant inputs before any logic
- **Blocking from PostToolUse/Stop** — the harness ignores `decision` there; use `process.stderr.write` for feedback
- **`hooks.json` / `settings.json` out of sync** — both must have the same entry
- **Using `console.log`** — always use `process.stderr.write()` for human-readable output
- **Missing `'use strict';`** — every hook script starts with it
- **Throwing instead of returning null** — wrap in `try/catch`, return null on error
- **Forgetting to export `run`** — `module.exports = { run }` is required
