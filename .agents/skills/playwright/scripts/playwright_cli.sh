#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cli="$repo_root/node_modules/.bin/playwright-cli"
if [[ ! -x "$cli" ]]; then
  echo "Playwright CLI is missing. Run npm ci from $repo_root." >&2
  exit 1
fi

has_session_flag=false
has_config_flag=false
opens_browser=false
for arg in "$@"; do
  case "$arg" in
    -s|-s=*|--session|--session=*) has_session_flag=true ;;
    --config|--config=*) has_config_flag=true ;;
    open) opens_browser=true ;;
  esac
done

cmd=("$cli")
if [[ "$has_session_flag" == false && -n "${PLAYWRIGHT_CLI_SESSION:-}" ]]; then
  cmd+=(--session "$PLAYWRIGHT_CLI_SESSION")
fi
cmd+=("$@")
if [[ "$opens_browser" == true && "$has_config_flag" == false ]]; then
  cmd+=(--config "$repo_root/.playwright/codex.config.json")
fi
cd -- "$repo_root"
exec "${cmd[@]}"
