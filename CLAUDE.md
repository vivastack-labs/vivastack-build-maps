# CLAUDE.md

共通の指示は AGENTS.md に書く（Codex と共有するため）。Claude Code 固有の内容だけをここに追記する。

@AGENTS.md

## Claude Code 固有の注意

- **Bash ツールの Node.js**：Bash ツールのシェルでは nvm が読み込まれず、`pnpm` が見つからない。pnpm を使うコマンドの前に `source ~/.nvm/nvm.sh && nvm use` を付ける。
- **hooks の誤検出**：`.claude/hooks/scripts/block-no-verify.js` は、`git` で始まるコマンドの中に空白に続く `-n` があると、後ろに続く別のコマンドの引数（例：`git status; grep -n foo x`）でも止める。`git` と `-n` を使うコマンドは別々に実行するか、`--line-number` のような長い形の引数を使う。
