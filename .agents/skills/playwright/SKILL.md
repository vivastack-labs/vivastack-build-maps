---
name: "playwright"
description: "Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow debugging) via `playwright-cli` or the bundled wrapper script."
---


# Playwright CLI Skill

Drive a real browser from the terminal using `playwright-cli`. Prefer the bundled wrapper script so the CLI works even when it is not globally installed.
Treat this skill as CLI-first automation. For the learning plan's comparison captures, keep using the existing `tests/capture.spec.ts`; do not create replacement test files.

## Repository setup

Run commands from the repository root. The CLI is pinned in `package-lock.json`.
Check `node_modules/.bin/playwright-cli`; if missing, run `npm ci`.
A global install is unnecessary. Missing browser binaries can be installed with
`node_modules/.bin/playwright-cli install-browser chromium` (network required).

```bash
export PWCLI="$(git rev-parse --show-toplevel)/.agents/skills/playwright/scripts/playwright_cli.sh"
```

The wrapper uses the project's local CLI and repository root, including
`.playwright/codex.config.json` when opening a browser: isolated Chromium, headless, 1440×900.
An explicit `--config` overrides this default. The shared `.playwright/cli.config.json` keeps its existing headed settings.
Use `--headed` only when a visible window is needed and available.

## Quick start

Use the wrapper script:

```bash
"$PWCLI" open https://playwright.dev
"$PWCLI" snapshot
"$PWCLI" click e15
"$PWCLI" type "Playwright"
"$PWCLI" press Enter
"$PWCLI" screenshot
```

## Core workflow

1. Open the page.
2. Snapshot to get stable element refs.
3. Interact using refs from the latest snapshot.
4. Re-snapshot after navigation or significant DOM changes.
5. Capture artifacts (screenshot, pdf, traces) when useful.

Minimal loop:

```bash
"$PWCLI" open https://example.com
"$PWCLI" snapshot
"$PWCLI" click e3
"$PWCLI" snapshot
```

## When to snapshot again

Snapshot again after:

- navigation
- clicking elements that change the UI substantially
- opening/closing modals or menus
- tab switches

Refs can go stale. When a command fails due to a missing ref, snapshot again.

## Recommended patterns

### Form fill and submit

```bash
"$PWCLI" open https://example.com/form
"$PWCLI" snapshot
"$PWCLI" fill e1 "user@example.com"
"$PWCLI" fill e2 "password123"
"$PWCLI" click e3
"$PWCLI" snapshot
```

### Debug a UI flow with traces

```bash
"$PWCLI" open https://example.com --headed
"$PWCLI" tracing-start
# ...interactions...
"$PWCLI" tracing-stop
```

### Multi-tab work

```bash
"$PWCLI" tab-new https://example.com
"$PWCLI" tab-list
"$PWCLI" tab-select 0
"$PWCLI" snapshot
```

## Wrapper script

The wrapper script runs `node_modules/.bin/playwright-cli` from the repository root. It does not download packages implicitly:

```bash
"$PWCLI" --help
```

Prefer the wrapper to preserve the pinned CLI version. Use a named session (`-s=costlens`) and close only that session when finished.

## References

Open only what you need:

- CLI command reference: `references/cli.md`
- Practical workflows and troubleshooting: `references/workflows.md`

## Guardrails

- Always snapshot before referencing element ids like `e12`.
- Re-snapshot when refs seem stale.
- Prefer explicit commands over `eval` and `run-code` unless needed.
- When you do not have a fresh snapshot, use placeholder refs like `eX` and say why; do not bypass refs with `run-code`.
- Use `--headed` when a visual check will help.
- Store temporary CLI snapshots and logs in `.playwright-cli/` (gitignored). Save shared screenshots explicitly to `artifacts/<STEP>/<LABEL>/` and open them with an image-viewing tool to verify the actual page.
- Default to CLI commands and workflows, not Playwright test specs.
