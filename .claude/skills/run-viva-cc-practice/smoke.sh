#!/usr/bin/env bash
# Smoke driver for viva-cc-practice hooks dispatcher.
# Run from repo root: bash .claude/skills/run-viva-cc-practice/smoke.sh
set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/.claude/hooks"
SCRIPTS_DIR="$HOOKS_DIR/scripts"
DISPATCHER="$HOOKS_DIR/run-with-flags.js"

pass=0; fail=0

# Helper: pipe JSON to dispatcher, capture stdout
run_hook() {
  local hook_id="$1" script="$2" profiles="$3" json="$4"
  printf '%s\n' "$json" | \
    VCW_HOOK_PROFILE=standard \
    VCW_PLUGIN_ROOT="$HOOKS_DIR" \
    node "$DISPATCHER" "$hook_id" "$SCRIPTS_DIR/$script" "$profiles" 2>/dev/null
}

ok()   { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1 — expected '$2', got '$3'"; fail=$((fail + 1)); }

echo "=== viva-cc-practice hooks smoke ==="

# 1. block-no-verify: --no-verify is blocked
out=$(run_hook vcw:pre:bash:block-no-verify block-no-verify.js minimal,standard,strict \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}')
if echo "$out" | grep -q '"decision":"block"'; then
  ok "block-no-verify: --no-verify → block"
else
  fail "block-no-verify: --no-verify → block" '{"decision":"block",...}' "$out"
fi

# 2. block-no-verify: safe command passes through (empty output)
out=$(run_hook vcw:pre:bash:block-no-verify block-no-verify.js minimal,standard,strict \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m x"}}')
if [ -z "$out" ]; then
  ok "block-no-verify: safe command → pass"
else
  fail "block-no-verify: safe command → pass" "(empty)" "$out"
fi

# 3. block-force-push: --force is blocked
out=$(run_hook vcw:pre:bash:block-force-push block-force-push.js minimal,standard,strict \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}')
if echo "$out" | grep -q '"decision":"block"'; then
  ok "block-force-push: --force → block"
else
  fail "block-force-push: --force → block" '{"decision":"block",...}' "$out"
fi

# 4. block-force-push: --force-with-lease is allowed
out=$(run_hook vcw:pre:bash:block-force-push block-force-push.js minimal,standard,strict \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force-with-lease origin main"}}')
if [ -z "$out" ]; then
  ok "block-force-push: --force-with-lease → pass"
else
  fail "block-force-push: --force-with-lease → pass" "(empty)" "$out"
fi

# 5. profile gate: hook requiring standard/strict is silent for minimal profile
out=$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}\n' | \
  VCW_HOOK_PROFILE=minimal \
  VCW_PLUGIN_ROOT="$HOOKS_DIR" \
  node "$DISPATCHER" vcw:pre:bash:block-no-verify "$SCRIPTS_DIR/block-no-verify.js" standard,strict 2>/dev/null)
if [ -z "$out" ]; then
  ok "profile gate: minimal profile skips standard-only hook"
else
  fail "profile gate: minimal profile skips standard-only hook" "(empty)" "$out"
fi

echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
