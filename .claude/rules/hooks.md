# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

### Newer lifecycle events (Claude Code v2.1.x)

- **InstructionsLoaded**: Fires when `CLAUDE.md` / `.claude/rules/*.md` load into
  context. Matcher on `load_reason` (`session_start`, `nested_traversal`,
  `path_glob_match`, `include`, `compact`). Observe-only.
- **UserPromptExpansion**: Fires when a slash command or MCP prompt expands,
  before it reaches Claude. **Can block** (prevents expansion) and inject
  `additionalContext`. Matcher on `command_name` (e.g. `deploy|review`).
- **PostToolBatch**: Fires after a batch of parallel tool calls resolves, before
  the next model call. **Can block** (stops the agentic loop). No matcher.
- **MessageDisplay**: Fires while an assistant message is displayed. Display-only
  — cannot block; rewrites on-screen text via `displayContent` without changing
  the transcript. No matcher.

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
