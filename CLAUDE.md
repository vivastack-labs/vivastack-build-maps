# CLAUDE.md

共通の指示は AGENTS.md に書く（Codex と共有するため）。Claude Code 固有の内容だけをここに追記する。

@AGENTS.md

## Claude Code 固有の注意

- **Bash ツールの Node.js**：Bash ツールのシェルでは nvm が読み込まれず、`pnpm` が見つからない。pnpm を使うコマンドの前に `source ~/.nvm/nvm.sh && nvm use` を付ける。
- **security-trigger に止められたら**：`git commit` の前に動く hook が、セキュリティに関わる語（`fetch(`・`readFile`・`token` など）を含む変更を止める。security-reviewer エージェントでステージした変更をレビューし、CRITICAL・HIGH を直してから、`node .claude/hooks/scripts/mark-security-reviewed.js` を実行して、もう一度 `git commit` する（そのときのステージの内容だけが通る）。`git add` と `git commit` を1つのコマンドでつなぐと、レビューの前に内容を確かめられないので止まる。分けて実行する。
