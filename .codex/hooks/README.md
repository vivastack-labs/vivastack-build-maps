# Codex hooks

Claude の `.claude/hooks/scripts/` を再利用し、Codex のライフサイクルイベントに対応する。
登録は `.codex/hooks.json`、入力の変換と Codex 固有の処理は `run.js` に置く。
Node.js はリポジトリ指定の 26 を使う。Codex CLI 0.169.0 の hooks 仕様に対応する。
ルートの `package.json` は ES Modules なので、ここだけ `package.json` で
`type: commonjs` を指定する。既存の Claude スクリプトと同じ形式で読み込める。

## 有効化

1. リポジトリのルートで `codex` を起動し、このプロジェクトを信頼する。
2. `/hooks` を開き、`.codex/hooks.json` のコマンドを確認して信頼する。
3. 新しいセッションを開始する。開始時のコンテキストと音声もここから有効になる。

設定を追加しただけでは実行されない。Codex は未確認・変更後の hooks をスキップする。
信頼の記録は利用者が Codex 内で行う。スクリプトはリポジトリ内の共有実装も呼ぶため、
更新時にはそちらの差分も確認する。信頼チェックを無効にする起動オプションは不要。

## 対応表

| Codex イベント | 処理 | Claude との差分 |
| --- | --- | --- |
| SessionStart | ブランチ・最新コミット・変更状態・前回の編集ファイルを渡す、音声 | Codex の記録だけを復元。会話の要約は生成しない |
| PreToolUse / Bash | `--no-verify`・通常の force push を拒否、gitleaks、strict の commit-quality | Codex の `permissionDecision: deny` に変換 |
| PreToolUse / apply_patch | linter / formatter の設定変更を拒否 | パッチの追加・更新・削除・移動元と移動先をすべて検査 |
| PostToolUse | ツール利用数、マスク済みコマンドログ、PR URL、ビルド結果、編集ファイルを記録 | Bash の文字列出力を変換。ビルド結果は終了コードを取得できた場合だけ通知 |
| PostToolUse / apply_patch | JSON 構文、Markdown / Python / Go の品質確認、console.log の注意 | stderr の注意も Codex の追加コンテキストへ変換 |
| Stop | JS / TS の Prettier 自動整形・ESLint・型検査、Markdown / YAML / Shell の検査、セッション保存、音声 | 前回の Stop 後に編集したファイルだけを対象にする。型検査はプロジェクト全体 |
| PreCompact / PostCompact | 圧縮前に活動情報を保存、圧縮を記録、音声 | Codex の圧縮イベントを利用 |
| SessionEnd | 活動情報を保存 | Codex 本体の上限 3 秒に合わせ、音声は Stop 時に再生する |
| PermissionRequest | 音声のみ | 許可・拒否の判断は返さず、Codex の承認フローを維持 |

`exec_command` も Codex からは `Bash` として届く。`apply_patch` は
`tool_input.command` のパッチからファイルを取り出す。編集後の読み取りはリポジトリ内の
実在ファイルに限定し、リポジトリ外を指すシンボリックリンクと `.claude/` の資源は除外する。
Stop 時にも再確認し、編集後にリンク先が変わっていても外部ファイルを整形しない。
複数ファイルを含むパッチに保護対象があれば、パッチ全体を実行前に拒否する。
保護対象へのシンボリックリンクも検査する。MCP 等の `path` 引数は編集として扱わない。

## 編集後と終了時の検査

`PostToolUse` は JSON 構文とデバッグ出力を確認し、診断を Codex の追加コンテキストに返す。
終了時の検査は `checks.js` にあり、共有スクリプトの Claude 用の状態には書き込まない。

- JS / TS：リポジトリの `node_modules/.bin/prettier --write`、ESLint、TS を編集した場合は `tsc --noEmit`。未導入のツールは取得せず注意を返す。Prettier がなければ JS の構文を `node --check` で確認する。
- Markdown：ローカルの `markdownlint-cli2`。YAML：`yamllint`。`content/` 配下は `content/.yamllint` を使う。Shell：`shellcheck`。
- 検査全体の上限は240秒、Stop hook は保存・音声の時間を含め270秒。診断は `systemMessage` で表示し、自動的に継続ターンを作らない。通常の `pnpm lint`・`pnpm typecheck`・テストもタスクの検証として実行する。
- `stop_hook_active` が真なら再検査せず、対象ファイルを次の通常の Stop まで保持する。検査が終わった対象は蓄積から外す。

## プロファイルと状態

Claude と同じ `VCW_HOOK_PROFILE`（既定 `standard`）、`VCW_DISABLED_HOOKS` を使う。
`.claude/settings.json` の `env` は Codex には読み込まれないため、シェルから指定する。

```bash
VCW_HOOK_PROFILE=minimal codex
VCW_HOOK_PROFILE=strict codex
# 音声だけ止める例。複数の ID はカンマ区切り。
VCW_DISABLED_HOOKS=codex:audio:Stop,codex:audio:SessionStart codex
```

共有処理の hook ID は対応する Claude hooks の ID を維持する。
音声の ID は `codex:audio:<イベント名>`。`minimal` は開始情報、設定ファイル保護、
Git hook の迂回防止、音声を実行する。通常の force push の拒否は Claude と同じく
`standard` / `strict` で有効。

状態・ログは Git 除外済みの `.codex/hooks/state/` に保存する。
Codex 専用の `state.js` を利用し、Claude の既定の
`~/.claude/vivastack-cc-workflows/` と混ざらない。
`.claude` 配下は変更せず、状態保存に依存しない共通処理だけを読み込む。
既存の `VCW_PLUGIN_ROOT` は使わず、常にこのリポジトリの `.claude` を参照する。
別の作業ディレクトリや端末の絶対パスを設定ファイルに埋め込む必要はない。

## 移植しない処理・制約

- Claude 固有の Agent ゲート、会話 JSONL の解析、CLAUDE.md の自動提案、Claude の単価による課金集計は移植しない。
- `gateguard` は Claude 側で無効化されているため登録しない。tmux への誘導、Claude 固有のセキュリティ担当エージェントの強制も登録しない。
- デザイン候補を製品規約に昇格させるチェックは追加しない。UI の判断は `AGENTS.md` と `docs/design-system.md` に従う。
- `npx` で整形・lint ツールを取得する処理は実行しない。Prettier・ESLint・TypeScript・markdownlint は `pnpm install` で入る。`gitleaks`、`yamllint`、`shellcheck`、Python / Go の共有チェックが呼ぶ `ruff`・`gofmt` は別途必要。未導入時には省略または注意を返す。
- 音声は既存の `.claude/hooks/audios/` と `play-audio.js` を利用する。再生コマンドや音声デバイスがない環境では何もしない。
- Git チェックは共有の `git-command.js` が解釈できる呼び出しを対象とする（連結した Git コマンドも検査）。任意のシェルスクリプトや `write_stdin` に後から送るコマンド、シェルによる直接のファイル書き込みを網羅する仕組みではない。Codex の sandbox / 承認設定も使う。
- Claude 専用の `PostToolUseFailure`、`StopFailure`、`TaskCreated`、`TaskCompleted`、`Notification`、`InstructionsLoaded`、worktree / 設定変更等のイベントは登録しない。MCP の障害バックオフ、Claude のガバナンスログ・学習抽出・デスクトップ通知も移植していない。
- 品質確認は注意として返し、Stop から継続ターンを自動生成しない。入力不正やアダプターの例外は終了コード 2 とし、実行前のガードを黙って省略しない。
- ログは自動削除しない。必要に応じて `.codex/hooks/state/` を整理する。前回情報は編集パスと Git 情報だけで、完了状況や学習進捗の判定には使わない。

## 確認

LLM や外部 API を呼ばずに実行できる。

```bash
node --test .codex/hooks/run.test.js
```

CI でも文書だけの変更かどうかにかかわらず、このテストを実行し、
Codex hooks 本体の行・分岐・関数のカバレッジをそれぞれ80%以上に保つ。
テストは `/tmp` の一時リポジトリで入力と出力、拒否、状態保存、診断の表示を検証する。
ルートを `type: module` にした環境で起動し、必要な外部コマンドはスタブにする。
実リポジトリのエントリーポイントの起動と `.claude/` の不変性も検証する。
実際の commit / push や音声再生は行わない。

仕様: [OpenAI Hooks](https://learn.chatgpt.com/docs/hooks)。
