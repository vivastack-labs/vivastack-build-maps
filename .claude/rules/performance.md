# Performance Optimization

## Model Selection Strategy

**Haiku 4.5** (90% of Sonnet capability, 3x cost savings):
- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Sonnet 4.6** (Best coding model):
- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Opus 4.8** (Deepest reasoning — latest Opus on the Anthropic API):
- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks
- The `opus` alias resolves to Opus 4.8 and defaults to **high** effort

### Effort Levels

Tune reasoning depth with `/effort` (or `effortLevel` in settings):
- `xhigh` — deepest reasoning, for the hardest Opus 4.8 tasks
- `ultracode` — `xhigh` reasoning plus automatic workflow orchestration
  (session-only; combines deep reasoning with dynamic workflows)

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Extended Thinking + Plan Mode

Extended thinking is enabled by default, reserving up to 31,999 tokens for internal reasoning.

Control extended thinking via:
- **Toggle**: Option+T (macOS) / Alt+T (Windows/Linux)
- **Config**: Set `alwaysThinkingEnabled` in `~/.claude/settings.json`
- **Depth**: On adaptive-thinking models (Opus 4.7+, the Claude 5 family),
  reasoning depth is controlled by effort level (`/effort` or `effortLevel`
  in settings); `MAX_THINKING_TOKENS` is a no-op there
- **Verbose mode**: Ctrl+O to see thinking output

For complex tasks requiring deep reasoning:
1. Ensure extended thinking is enabled (on by default)
2. Enable **Plan Mode** for structured approach
3. Use multiple critique rounds for thorough analysis
4. Use split role sub-agents for diverse perspectives

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
