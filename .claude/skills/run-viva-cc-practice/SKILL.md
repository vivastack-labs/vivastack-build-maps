---
name: run-viva-cc-practice
description: >-
  Run, start, build, test, or smoke-test the viva-cc-practice hooks dispatcher.
  Use when asked to run a hook, test the dispatcher, verify hook behavior,
  screenshot the app, or confirm a change to a hook script works.
---

# run-viva-cc-practice

This repo has no GUI or server — its runtime surface is the hooks dispatcher at
`.claude/hooks/run-with-flags.js`. Hook scripts in `.claude/hooks/scripts/` are
invoked by Claude Code lifecycle events; you drive them by piping JSON to the
dispatcher CLI. The smoke driver at `.claude/skills/run-viva-cc-practice/smoke.sh`
covers the key behaviors.

## Prerequisites

Node.js (already present — the hooks tests use it). No additional packages needed.

## Run (agent path)

### Smoke driver — verify dispatcher and key hooks

```bash
bash .claude/skills/run-viva-cc-practice/smoke.sh
```

Expected output:
```
=== viva-cc-practice hooks smoke ===
  PASS: block-no-verify: --no-verify → block
  PASS: block-no-verify: safe command → pass
  PASS: block-force-push: --force → block
  PASS: block-force-push: --force-with-lease → pass
  PASS: profile gate: minimal profile skips standard-only hook

Results: 5 passed, 0 failed
```

### Drive a hook manually

Pipe a JSON event to the dispatcher:

```bash
printf '<json>\n' | \
  VCW_HOOK_PROFILE=standard \
  VCW_PLUGIN_ROOT=.claude/hooks \
  node .claude/hooks/run-with-flags.js \
    <hookId> \
    <absolute-path-to-script> \
    <profiles-csv>
```

**Input JSON shape** (Claude Code hook event):
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "git commit --no-verify -m x" }
}
```

**Output:**
- Hook blocked → `{"decision":"block","reason":"..."}` on stdout
- Hook passed → empty stdout, exit 0
- Hook error → message on stderr, exit 0 (errors never crash Claude)

**Example — test block-no-verify:**
```bash
printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}\n' | \
  VCW_HOOK_PROFILE=standard \
  VCW_PLUGIN_ROOT="$(pwd)/.claude/hooks" \
  node .claude/hooks/run-with-flags.js \
    vcw:pre:bash:block-no-verify \
    "$(pwd)/.claude/hooks/scripts/block-no-verify.js" \
    minimal,standard,strict
```

### Run the full test suite

```bash
cd .claude/hooks && npm test
```

All 23 tests should pass.

## Run (human path)

There is no interactive UI. The "app" is a CLI dispatcher invoked by Claude Code.
To see it in action, use Claude Code normally — hooks fire automatically on
`git commit`, file edits, session start, etc.

## Gotchas

**Env var in pipelines**: `VAR=val printf ... | node ...` — the inline assignment
applies only to `printf`, NOT to `node` on the right side of `|`. Always put
`VAR=val` before `node`:

```bash
# WRONG — node sees the exported VCW_HOOK_PROFILE, not 'minimal'
VCW_HOOK_PROFILE=minimal printf '...\n' | node dispatcher.js ...

# CORRECT
printf '...\n' | VCW_HOOK_PROFILE=minimal node dispatcher.js ...
```

**Script path must be absolute (or resolvable relative to VCW_PLUGIN_ROOT)**:
The dispatcher resolves `scriptPath` as `path.resolve(VCW_PLUGIN_ROOT, scriptPath)`.
Safest: always use an absolute path (e.g., `"$(pwd)/.claude/hooks/scripts/foo.js"`).

**Profile gate uses exported env var**: `VCW_HOOK_PROFILE` is exported in this
project's shell sessions (default: `standard`). Override it inline on the `node`
side of any pipe, not the `printf` side.

## Troubleshooting

**`Cannot find module '...'`** — the `scriptPath` argument resolved to the wrong
path. Use `"$(pwd)/.claude/hooks/scripts/<name>.js"` as an absolute path.

**Hook fires but does nothing when you expect a block** — check the profiles CSV
arg matches the current `VCW_HOOK_PROFILE`. A hook registered for `standard,strict`
is silent under `minimal`.

**`[VCW] Hook error (...): ...`** on stderr — the script threw; the dispatcher
swallows it and exits 0. Read the error message to diagnose.
