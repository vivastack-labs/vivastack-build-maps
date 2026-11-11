# Codex hooks

Claude の `.claude/hooks/scripts/` を再利用し、Codex のライフサイクルイベントに対応する。
登録は `.codex/hooks.json`、入力の変換と Codex 固有の処理は `run.js` に置く。
Node.js 22 以降を使う。Codex CLI 0.167.0 で確認。

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
| PostToolUse | ツール利用数、マスク済みコマンドログ、PR URL、編集ファイルを記録 | Codex の Bash / apply_patch 入力を共有処理へ渡す |
| PostToolUse / apply_patch | JSON 構文、Markdown / Python / Go の品質確認、console.log の注意 | stderr の注意も Codex の追加コンテキストへ変換 |
| Stop | Markdown / YAML / Shell の確認、JS の構文検査、セッション保存、音声 | 前回の Stop 後に編集したファイルだけ検査。自動整形はしない |
| PreCompact / PostCompact | 圧縮前に活動情報を保存、圧縮を記録、音声 | Codex の圧縮イベントを利用 |
| SessionEnd | 活動情報を保存 | Codex 本体の上限 3 秒に合わせ、音声は Stop 時に再生する |
| PermissionRequest | 音声のみ | 許可・拒否の判断は返さず、Codex の承認フローを維持 |

`exec_command` も Codex からは `Bash` として届く。`apply_patch` は
`tool_input.command` のパッチからファイルを取り出す。編集後の読み取りはリポジトリ内の
実在ファイルに限定し、リポジトリ外を指すシンボリックリンクは除外する。
複数ファイルを含むパッチに保護対象があれば、パッチ全体を実行前に拒否する。

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
- `npx` で整形・lint ツールを取得する処理は実行しない。共有チェックが呼ぶ `gitleaks`、`markdownlint-cli2`、`yamllint`、`shellcheck`、`ruff`、`gofmt` は別途インストールが必要。未導入時には省略または注意を返す。
- JS は `node --check` による構文確認のみ。TypeScript の型検査、ESLint、自動整形は各タスクの検証コマンドで実行する。
- 音声は既存の `.claude/hooks/audios/` と `play-audio.js` を利用する。再生コマンドや音声デバイスがない環境では何もしない。
- 共有の Git チェックは先頭が `git` のコマンドを対象とする。複合シェル、ラッパー経由、シェルによる直接のファイル書き込みなどを網羅する仕組みではない。Codex の sandbox / 承認設定も使う。
- 品質確認は注意として返し、Stop から継続ターンを自動生成しない。入力不正やアダプターの例外は終了コード 2 とし、実行前のガードを黙って省略しない。
- ログは自動削除しない。必要に応じて `.codex/hooks/state/` を整理する。前回情報は編集パスと Git 情報だけで、完了状況や学習進捗の判定には使わない。

## 確認

LLM や外部 API を呼ばずに実行できる。

```bash
node --test .codex/hooks/run.test.js
```

テストは `/tmp` の一時リポジトリで入力と出力、拒否、状態保存、診断の表示を検証する。
実際の commit / push や音声再生は行わない。

仕様: [OpenAI Hooks](https://learn.chatgpt.com/docs/hooks)。
