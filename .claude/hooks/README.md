# .claude/hooks — フックシステムリファレンス

このディレクトリには Claude Code のライフサイクルイベントに応答する 33 本のフックスクリプトが含まれる。
すべてのフックはディスパッチャー `run-with-flags.js` を経由して実行される。

---

## アーキテクチャ

### ディスパッチャー (`run-with-flags.js`)

```text
イベント発火 (SessionStart / PreToolUse / Stop / ...)
  └─► node run-with-flags.js <hookId> <scriptPath> <profiles-csv>
        ├─► stdin を最大 1 MB 読み込み (超過分は切り捨て)
        ├─► isHookEnabled(hookId, profiles) チェック
        │     → 無効 or プロファイル不一致なら exit 0 (サイレント)
        ├─► パストラバーサルガード
        │     → scriptPath が VCW_PLUGIN_ROOT 外なら exit 1
        ├─► hooks-log-YYYY-MM-DD.jsonl へ記録 (vcw:hooks-log が有効なら)
        ├─► require(scriptPath).run(input) を呼び出し
        └─► 戻り値を JSON で stdout に出力 (null なら無出力)
              ※ 例外が発生しても常に exit 0 — フックは Claude をクラッシュさせない
```

### プロファイル

環境変数 `VCW_HOOK_PROFILE` で切り替える (デフォルト: `standard`)。

| Profile | 説明 | 主な用途 |
|---------|------|---------|
| `minimal` | 安全必須フックのみ | CI 環境、自動化 |
| `standard` | 通常開発フック全体 | 日常開発 (デフォルト) |
| `strict` | 追加強制フック含む | コード品質を最大化したい場合 |

特定フックを一時的に無効化するには `VCW_DISABLED_HOOKS=hookId1,hookId2` を設定する。
現在の無効フック: `vcw:pre:edit:gateguard`, `vcw:pre:bash:gateguard`。

### lib モジュール

| モジュール | 役割 |
|-----------|------|
| `lib/hook-flags.js` | `isHookEnabled(hookId, profiles)` — プロファイル判定とホック無効化リスト管理 |
| `lib/sanitize.js` | AWS キー・GitHub トークン・JWT・PEM・`password=` 等のシークレットをマスク |
| `lib/state.js` | `statePath()` / `atomicWrite()` / `readJSON()` — `~/.claude/vivastack-cc-workflows/` 下の状態管理 |

---

## フック一覧

---

### SessionStart

セッション開始時に実行される。コンテキスト注入用途が中心。

---

#### `session-start.js` — セッション記憶復元

**Hook ID:** `vcw:session:start` | **プロファイル:** minimal, standard, strict

**全体の流れ**

```text
SessionStart
  └─► run(input)
        ├─► git branch / git log / git status で現状取得
        ├─► sessions/*.session.tmp から前セッションサマリーを抽出
        ├─► sessions/*-claude-md-suggest.md の未レビューリストを収集
        ├─► package.json / pyproject.toml / go.mod / Cargo.toml で言語検出
        └─► additionalContext として返す
```

**動作の詳細**

1. **セッションヘッダー**: `=== Session Context (YYYY-MM-DD HH:MM) ===` 形式でブランチ名・最新コミット・変更ファイル数を出力
2. **前セッション復元**: `~/.claude/vivastack-cc-workflows/sessions/` から最新の `*-session.tmp` を探し、`<!-- VCW:SUMMARY:START -->` 〜 `<!-- VCW:SUMMARY:END -->` 間のサマリーを注入
3. **CLAUDE.md 提案**: 未レビューの `*-claude-md-suggest.md` ファイルのパスを最大 3 件表示
4. **言語検出**: リポジトリで使用している技術スタックを自動識別

**返り値**

```js
{
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: '=== Session Context ... ===\n...',
  },
}
```

**ポイント**

- セッションファイルが存在しない (初回) 場合はヘッダーのみ出力
- git が使えない環境でもフォールバックしてクラッシュしない

---

#### `module-context.js` — モジュールコンテキスト注入

**Hook ID:** `project:session:start:module-context` | **プロファイル:** standard, strict

**全体の流れ**

```text
SessionStart
  └─► run(input)
        ├─► detectModule(cwd) → frontend / backend / null
        │     ├─► モジュール内 (Case 1): 詳細コンテキスト
        │     └─► プロジェクトルート (Case 2): モジュール一覧
        └─► additionalContext として返す (モジュール無し → null)
```

**動作モード**

| 状況 | 出力内容 |
|------|---------|
| `cd frontend && claude` | `.claude-module-rules.md` の内容 + 直近5コミット + ブランチ差分ファイル + GitHub Issues |
| `claude` (ルートから) | モジュール一覧 + 各モジュール直近3コミット |
| モジュール未検出 | null (何も注入しない) |

**主要な関数**

| 関数 | 役割 |
|------|------|
| `detectModule(cwd)` | パスに `frontend`/`backend` が含まれるか判定 |
| `findProjectRoot(cwd)` | `.claude` ディレクトリを上方向に探索してルートを特定 |
| `readModuleRules(rulesPath)` | `.claude-module-rules.md` を読み込む |
| `recentModuleCommits(moduleDir, cwd)` | `git log --oneline -5` でモジュールの最近のコミット取得 |
| `changedFiles(moduleDir, cwd)` | `git diff --name-only main...HEAD` でブランチ差分取得 |
| `openIssues(moduleName)` | `gh issue list` で該当モジュールの open Issues を取得 |

**返り値**

```js
{
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: '=== Module Context: frontend ===\n...',
  },
}
// モジュール未検出の場合は null
```

**ポイント**

- `KNOWN_MODULES` 配列に追加するだけで新モジュールに対応
- `gh` コマンド未インストールでも graceful に動作
- `shell()` はエラー時に `''` を返す設計

---

### PreToolUse (Bash)

Bash ツール実行前に評価される。`{ decision: 'block', reason }` を返すと実行がキャンセルされる。

---

#### `block-no-verify.js` — git hook バイパス禁止

**Hook ID:** `vcw:pre:bash:block-no-verify` | **プロファイル:** minimal, standard, strict

**全体の流れ**

```text
PreToolUse (Bash)
  └─► run(input)
        ├─► コマンドが git コマンドでなければ → null
        ├─► --no-verify / -n / core.hooksPath= を検出
        │     → block
        └─► 検出なし → null
```

**検出パターン**

| パターン | 説明 |
|---------|------|
| `--no-verify` | git commit/push の hook 無効化フラグ |
| `-n` (短縮形) | `--no-verify` の短縮形 |
| `core.hooksPath=` | git 設定でフックパスを上書きする手法 |

**返り値**

```js
// ブロック時
{ decision: 'block', reason: 'Bypassing git hooks is not allowed...' }
// 許可時
null
```

**ポイント**

- git コマンド以外には反応しない
- CI での `--no-verify` 許可が必要なら `VCW_DISABLED_HOOKS` で除外

---

#### `gateguard-fact-force.js` — 破壊的操作の事前確認強制 (Bash)

**Hook ID:** `vcw:pre:bash:gateguard` | **プロファイル:** standard, strict

**全体の流れ**

```text
PreToolUse (Bash)
  └─► run(input)
        ├─► 破壊的パターンに一致するか検査
        │     (rm -rf / git reset --hard / git push --force /
        │      DROP TABLE / DELETE FROM / TRUNCATE /
        │      /dev/sd* への書き込み / mkfs.* / fork bomb)
        ├─► 未確認 (state に記録なし) → block
        │     "事実を列挙してから再試行せよ" と指示
        └─► 確認済み (state に記録あり) → null (通過)
              ※ 確認エントリは 30 分で失効
```

**状態管理**

- 状態ファイル: `~/.claude/vivastack-cc-workflows/gateguard/state-<sessionKey>.json`
- 最大エントリ数: 500
- 失効: 30 分

**返り値**

```js
// 初回 (未確認)
{ decision: 'block', reason: '破壊的操作を実行する前に...' }
// 二回目以降 (確認済み)
null
```

**ポイント**

- ブロック時は「影響ファイルのリストアップ」「可逆性の確認」「ユーザー指示の引用」を Claude に要求する
- Edit/Write でも同一スクリプトが動くが、その場合はファイルパス単位でゲートがかかる (後述)

---

#### `auto-tmux-dev.js` — dev サーバーの tmux 誘導

**Hook ID:** `vcw:pre:bash:auto-tmux-dev` | **プロファイル:** standard, strict

**目的:** 長時間起動するコマンドを tmux セッション内で実行させることで、Claude のコンテキストを汚染しない。

**検出対象:** `npm run dev` / `npm start` / `pnpm dev` / `yarn dev` / `bun dev` / `next dev` / `vite` / `astro dev`

**動作:** tmux が利用可能な場合、具体的な tmux コマンドを提示してブロック。tmux 未インストールなら null。

**返り値:** `{ decision: 'block', reason: 'tmux <session-name> で実行してください...' }` または `null`

---

#### `commit-quality.js` — Conventional Commits 強制 [strict]

**Hook ID:** `vcw:pre:bash:commit-quality` | **プロファイル:** strict のみ

**全体の流れ**

```text
PreToolUse (Bash)
  └─► run(input)
        ├─► git commit コマンドでなければ → null
        ├─► -m フラグあり → メッセージを Conventional Commits 形式で検証
        │     (feat|fix|refactor|docs|test|chore|perf|ci[(<scope>)]: <description>)
        ├─► コミットメッセージにシークレットパターンが含まれるか確認
        └─► git diff --cached でステージ済みファイルの
              console.log / debugger を検出
              → 検出なら block
```

**ブロック条件**

| 条件 | 理由 |
|------|------|
| 非 Conventional Commits 形式 | コミット履歴の一貫性 |
| メッセージ内のシークレット | 機密情報漏洩防止 |
| ステージ済みファイルの `console.log` | デバッグコードの混入防止 |

**返り値:** `{ decision: 'block', reason: '...' }` または `null`

---

#### `tmux-reminder.js` — 長時間コマンドへの tmux ヒント [strict]

**Hook ID:** `vcw:pre:bash:tmux-reminder` | **プロファイル:** strict のみ

**目的:** テスト・ビルド等の長時間コマンドに対して tmux 使用を stderr に提案する (ブロックしない)。

**検出対象:** `npm test` / `vitest` / `pytest` / `cargo build` / `docker build` / `playwright` / `cypress` / `jest`

**返り値:** 常に `null` (アドバイザリのみ、ブロックなし)

---

#### `git-push-reminder.js` — push 前レビュー想起 [strict]

**Hook ID:** `vcw:pre:bash:git-push-reminder` | **プロファイル:** strict のみ

**目的:** `git push` 前に変更内容を確認するよう stderr にリマインドを出す (ブロックしない)。

**検出対象:** `git push` を含むコマンド

**返り値:** 常に `null`

---

#### `gitleaks.js` — シークレット漏洩スキャン

**Hook ID:** `project:pre:bash:gitleaks` | **プロファイル:** standard, strict

**全体の流れ**

```text
PreToolUse (Bash)
  └─► run(input)
        ├─► git commit / git push 以外 → null
        ├─► gitleaks detect --no-git --quiet を実行
        │     ├─► exit 0 (クリーン) → null
        │     ├─► exit 非 0 (漏洩検出) → block
        │     └─► ENOENT (gitleaks 未インストール) → null (graceful)
        └─► block 時はスキャン結果を reason に含める
```

**返り値**

```js
// 漏洩検出
{ decision: 'block', reason: 'gitleaks detected secrets...' }
// クリーン or 未インストール
null
```

**ポイント**

- gitleaks がインストールされていなくてもクラッシュしない
- コミット・push 以外には反応しない

---

#### `security-trigger.js` — セキュリティレビュー強制

**Hook ID:** `project:pre:bash:security-trigger` | **プロファイル:** standard, strict

**全体の流れ**

```text
PreToolUse (Bash)
  └─► run(input)
        ├─► git commit / git push 以外 → null
        ├─► SECURITY_REVIEWED=1 が設定済み → null (bypass)
        ├─► git diff --cached --name-only でステージ済みファイルを取得
        ├─► ファイル名がセキュリティパターンに一致するか検査
        │     (auth / login / session / token / jwt / password / credential /
        │      oauth / DB操作 / ファイルI/O / HTTPクライアント / 暗号 など)
        ├─► diff の内容が同パターンに一致するか検査
        └─► 一致あり → block & security-reviewer エージェント使用を指示
```

**返り値**

```js
// フラグ対象ファイルあり
{
  decision: 'block',
  reason: 'セキュリティレビューが必要です:\n  [auth.ts] (filename)\n  [password] (content)',
}
// 対象なし
null
```

**ポイント**

- `SECURITY_REVIEWED=1` を設定すれば bypass できる
- ファイル名マッチと diff 内容マッチの両方を検査する

---

### PreToolUse (Edit | Write | MultiEdit)

ファイル編集系ツールの実行前に評価される。

---

#### `config-protection.js` — linter 設定ファイル保護

**Hook ID:** `vcw:pre:edit:config-protection` | **プロファイル:** minimal, standard, strict

**全体の流れ**

```text
PreToolUse (Edit|Write|MultiEdit)
  └─► run(input)
        ├─► ファイルパスを検査
        └─► 対象ファイルなら block
```

**ブロック対象ファイルパターン**

`.eslintrc.*` / `eslint.config.*` / `.prettierrc.*` / `prettier.config.*` /
`biome.json(c)` / `.ruff.toml` / `ruff.toml` / `.stylelintrc.*` / `stylelint.config.*` / `.markdownlint*`

**返り値**

```js
// 保護対象
{ decision: 'block', reason: 'linter 設定ファイルの直接編集は禁止されています...' }
// それ以外
null
```

**ポイント**

- 解除するには `VCW_DISABLED_HOOKS=vcw:pre:edit:config-protection` を設定
- `minimal` プロファイルでも常に有効

---

#### `gateguard-fact-force.js` — ファイル編集前の事実確認 (Edit)

**Hook ID:** `vcw:pre:edit:gateguard` | **プロファイル:** standard, strict
**現在の状態:** `VCW_DISABLED_HOOKS` により無効化中

**Bash 版との違い:** ファイルパス単位で「初回編集か否か」を判定する。初回は対象ファイルの利用箇所 (import/export) を確認してから再試行するよう指示してブロック。2 回目以降は通過。

**返り値:** Bash 版と同形式

---

#### `doc-file-warning.js` — 一時ファイル命名警告

**Hook ID:** `vcw:pre:write:doc-file-warning` | **プロファイル:** standard, strict

**目的:** `NOTES.md` / `TODO.txt` / `SCRATCH.md` 等の一時ファイルが `docs/` や `.claude/` 以外に作られそうな場合に stderr で移動先を提案する (ブロックしない)。

**検出対象:** `NOTES` / `TODO` / `SCRATCH` / `TEMP` / `DRAFT` / `WIP` / `FIXME` / `HACK` + `.md` / `.txt`

**除外ディレクトリ:** `docs/` / `.claude/` / `skills/` / `commands/` / `.github/`

**返り値:** 常に `null`

---

#### `suggest-compact.js` — `/compact` 提案

**Hook ID:** `vcw:pre:edit:suggest-compact` | **プロファイル:** standard, strict

**目的:** セッション内で Edit/Write/MultiEdit が 50 回呼ばれるたびに (以降 25 回ごと) `/compact` 実行を提案する。

**状態:** `~/.claude/vivastack-cc-workflows/tmp/compact-counter-<sessionId>.txt` にカウントを保持。

**返り値:** 常に `null` (アドバイザリのみ)

---

### PreToolUse (Agent)

---

#### `viva-plan-gate.js` — viva-developer 起動前プラン承認確認

**Hook ID:** `project:pre:agent:viva-plan-gate` | **プロファイル:** minimal, standard, strict

**全体の流れ**

```text
PreToolUse (Agent)
  └─► run(input)
        ├─► subagent_type が "viva-developer" 以外 → null (通過)
        ├─► ~/.claude/vivastack-cc-workflows/runs/latest/run.jsonl を読む
        │     ファイルなし → block (fails closed)
        ├─► run.jsonl に {"status":"plan_approved"} の行があるか検索
        │     なし → block
        └─► あり → null (通過)
```

**返り値**

```js
// プラン未承認
{ decision: 'block', reason: 'viva-developer は plan_approved なしに起動できません...' }
// 承認済み
null
```

**ポイント**

- ゲートは `viva-developer` のサブエージェントタイプにのみ反応する
- ファイルが存在しない場合は **fail closed** (ブロック) する
- プロンプト操作でスキップできない強制制約

---

### PreToolUse (mcp_.*)

---

#### `mcp-health-check.js` — MCP サーバー障害時バックオフ

**Hook ID:** `vcw:pre:mcp:health-check` | **プロファイル:** standard, strict

**全体の流れ**

```text
PreToolUse (mcp_.*)
  └─► run(input)
        ├─► ツール名から MCP サーバー名を解析 (mcp_<server>__<tool>)
        ├─► mcp-health-cache.json を読み込む
        ├─► 対象サーバーの障害エントリを確認
        │     ├─► エントリなし or 期限切れ → null (通過)
        │     └─► 有効なバックオフエントリあり → block
        └─► 期限切れエントリをクリーンアップ
```

**返り値**

```js
// バックオフ中
{ decision: 'block', reason: 'MCP server <name> is unhealthy (30s 残り)...' }
// 正常
null
```

**ポイント**

- `mcp-health-failure.js` (PostToolUseFailure) と対になる
- バックオフ期間はエラー種別で異なる (後述)

---

### PostToolUse (Bash)

ツール実行後に呼ばれる。`null` のみ返す (ブロック不可)。副作用専用。

---

#### `command-log.js` — Bash コマンド記録

**Hook ID:** `vcw:post:bash:command-log` | **プロファイル:** standard, strict

**目的:** 実行された Bash コマンドを `lib/sanitize.js` でシークレットをマスクしてから `~/.claude/vivastack-cc-workflows/bash-commands.log` に追記する。

**返り値:** 常に `undefined` (副作用のみ)

---

#### `pr-created.js` — PR URL 検出 & レビュー促進

**Hook ID:** `vcw:post:bash:pr-created` | **プロファイル:** standard, strict

**目的:** ツールの応答出力に `https://github.com/.../pull/\d+` パターンを検出し、`gh pr review <url>` コマンドを stderr に表示して次のアクションを促す。

**返り値:** 常に `undefined`

---

#### `build-complete.js` — ビルド成否通知

**Hook ID:** `vcw:post:bash:build-complete` | **プロファイル:** standard, strict

**目的:** `npm run build` / `pnpm build` / `cargo build` / `go build` の完了後、exit_code を読んでビルド成功・失敗を stderr に表示する。

**返り値:** 常に `undefined`

---

### PostToolUse (Edit | Write | MultiEdit)

---

#### `quality-gate.js` — 非 JS/TS ファイルの lint

**Hook ID:** `vcw:post:edit:quality-gate` | **プロファイル:** standard, strict

**全体の流れ**

```text
PostToolUse (Edit|Write|MultiEdit)
  └─► run(input)
        ├─► JS/TS ファイル (.js .ts .jsx .tsx) → スキップ (Stop で処理)
        ├─► .json → JSON.parse() で構文チェック
        ├─► .md   → markdownlint-cli2 を実行
        ├─► .go   → gofmt -l を実行
        ├─► .py   → ruff check を実行
        └─► エラーがあれば stderr に出力 (ブロックしない)
```

**返り値:** 常に `undefined`

**ポイント**

- ブロックではなく通知のみ — Claude は編集を継続できる
- JS/TS は `format-typecheck.js` (Stop) に委譲される

---

#### `design-quality-check.js` — フロントエンドデザイン汎用シグナル警告

**Hook ID:** `vcw:post:edit:design-quality-check` | **プロファイル:** standard, strict

**目的:** `.tsx` / `.jsx` / `.astro` / `.vue` / `.svelte` / `.css` ファイルを編集した際、"Get Started" CTA・`grid-cols-3/4`・`bg-gradient-to-`・`text-center`・`font-sans` 等の汎用デザインパターンを検出し、より意図的なデザインを提案する。

**返り値:** 常に `undefined`

---

#### `post-edit-accumulator.js` — Stop 時処理用ファイルリスト蓄積

**Hook ID:** `vcw:post:edit:accumulator` | **プロファイル:** standard, strict

**目的:** 編集された JS/TS ファイルのパスを `~/.claude/vivastack-cc-workflows/tmp/vcw-edited-<sessionId>.txt` に追記する。このファイルは Stop 時に `format-typecheck.js` / `format-yaml.js` / `format-markdown.js` が消費する。

**返り値:** 常に `undefined`

---

#### `console-warn.js` — console.log 検出 (編集直後)

**Hook ID:** `vcw:post:edit:console-warn` | **プロファイル:** standard, strict

**目的:** 編集直後の JS/TS ファイルを読んで `console.log(` の行番号を最大 5 件 stderr に報告する。

**返り値:** 常に `undefined`

---

### PostToolUse (.*)

すべてのツールに反応するキャッチオール。

---

#### `session-activity-tracker.js` — ツール使用メトリクス記録

**Hook ID:** `vcw:post:activity-tracker` | **プロファイル:** standard, strict

**目的:** `{ ts, tool, session }` を JSONL 形式で `~/.claude/vivastack-cc-workflows/metrics/tool-usage.jsonl` に追記する。

**返り値:** 常に `undefined`

---

### PostToolUseFailure (mcp_.*)

---

#### `mcp-health-failure.js` — MCP 障害分類 & バックオフ登録

**Hook ID:** `vcw:failure:mcp-health` | **プロファイル:** standard, strict

**全体の流れ**

```text
PostToolUseFailure (mcp_.*)
  └─► run(input)
        ├─► エラー内容を分類
        │     401/403                → auth_error    (5 分バックオフ)
        │     429/rate-limit         → rate_limit    (2 分バックオフ)
        │     502/503/connection     → transport_error (30 秒バックオフ)
        │     その他                  → server_error  (1 分バックオフ)
        └─► mcp-health-cache.json に unhealthy エントリを書き込む
              → 次回の mcp-health-check.js がブロックする
```

**返り値:** `undefined` (副作用のみ、ブロック不可)

**ポイント**

- `mcp-health-check.js` と対になって MCP サーバーの自動回路遮断器として機能する

---

### PreCompact

---

#### `pre-compact.js` — コンパクション記録

**Hook ID:** `vcw:compact:pre` | **プロファイル:** standard, strict

**目的:** コンパクション発生時刻を `~/.claude/vivastack-cc-workflows/sessions/compaction.log` に追記し、アクティブなセッションファイルにタイムスタンプ行を挿入する。

**返り値:** `undefined`

---

### Stop

ターン終了時に実行される。非同期処理・フォーマット・サマリー生成に使用。

---

#### `format-yaml.js` — YAML lint

**Hook ID:** `project:stop:format-yaml` | **プロファイル:** standard, strict | **タイムアウト:** 30 秒

**目的:** セッション中に編集された `.yml`/`.yaml` ファイルを蓄積リスト (`vcw-edited-<sessionId>.txt`) から読み込み、`yamllint` でエラーを報告する。

**返り値:** `undefined`

---

#### `format-markdown.js` — Markdown lint

**Hook ID:** `project:stop:format-markdown` | **プロファイル:** standard, strict | **タイムアウト:** 30 秒

**目的:** セッション中に編集された `.md` ファイルに `markdownlint-cli2` を実行してエラーを報告する。

**返り値:** `undefined`

---

#### `shellcheck.js` — Shell script lint
**Hook ID:** `project:stop:shellcheck` | **プロファイル:** standard, strict | **タイムアウト:** 30 秒
**目的:** セッション中に編集された `.sh` ファイルに `shellcheck` を実行してエラーを報告する。**返り値:** `undefined`

---

#### `format-typecheck.js` — JS/TS フォーマット & 型チェック

**Hook ID:** `vcw:stop:format-typecheck` | **プロファイル:** standard, strict | **タイムアウト:** 270 秒

**全体の流れ**

```text
Stop
  └─► run(input)
        ├─► vcw-edited-<sessionId>.txt から JS/TS ファイルを読み込み
        ├─► deduplicateFiles() で重複を除去
        ├─► groupByProjectRoot() で package.json ごとにグループ化
        └─► 各グループに対して:
              ├─► npx biome format --write (失敗なら npx prettier --write)
              ├─► npx eslint <files>
              └─► npx tsc --noEmit (tsconfig.json ごとに)
                    → エラーは stderr に出力
        └─► 蓄積ファイルを削除 (処理済み)
```

**主要な関数**

| 関数 | 役割 |
|------|------|
| `deduplicateFiles(files)` | パス重複を除去 |
| `groupByProjectRoot(files)` | 最近の `package.json` ディレクトリでグループ化 |

**返り値:** `undefined`

**ポイント**

- biome → prettier のフォールバックで多様な環境に対応
- tsconfig.json が複数あっても個別に `tsc` を実行する
- タイムアウト 270 秒は長いが、大きなプロジェクトの型チェックに必要

---

#### `check-console-log.js` — 変更ファイルの console.log 検出

**Hook ID:** `vcw:stop:check-console-log` | **プロファイル:** standard, strict | **タイムアウト:** 30 秒

**目的:** `git diff --name-only HEAD` で変更された JS/TS ファイルを特定し、`console.log(` の残存を最大 10 件 stderr に報告する。

**返り値:** `undefined`

---

#### `session-end.js` — セッションサマリー書き出し

**Hook ID:** `vcw:stop:session-end` | **プロファイル:** standard, strict | **タイムアウト:** 30 秒

**全体の流れ**

```text
Stop
  └─► run(input)
        ├─► セッションの transcript JSONL をパース
        ├─► 直近 10 件のユーザーメッセージをタスクとして抽出
        ├─► ツール使用回数 TOP 20 を集計
        ├─► 最大 30 件の操作ファイルパスを収集
        └─► ~/.claude/vivastack-cc-workflows/sessions/<date>-<sessionId>-session.tmp
              に <!-- VCW:SUMMARY:START --> 〜 <!-- VCW:SUMMARY:END --> で囲って書き込む
```

**返り値:** `undefined`

**ポイント**

- 冪等設計 — 同セッションで複数回 Stop が走っても上書きされる
- 次の `session-start.js` がこのファイルを読んで前セッションを復元する

---

#### `claude-md-suggest.js` — CLAUDE.md 更新提案生成

**Hook ID:** `project:stop:claude-md-suggest` | **プロファイル:** standard, strict | **タイムアウト:** 15 秒

**全体の流れ**

```text
Stop
  └─► run(input)
        ├─► transcript をスキャン
        │     ├─► 永続ルールパターン ("from now on" / "always" / "never" /
        │     │     "each time" / "whenever" / "every time") を検出
        │     ├─► 修正パターン ("no," / "you should" / "don't" /
        │     │     "stop" / "wrong" / "incorrect" / "instead") を検出
        │     └─► 3 回以上繰り返された Bash コマンドを検出
        ├─► セッション内で重複除去
        └─► シグナルありなら Markdown ドラフトを
              ~/.claude/vivastack-cc-workflows/sessions/<date>-<sessionId>-claude-md-suggest.md に出力
```

**返り値:** `null` (常に許可)

**ポイント**

- 次のセッション開始時に `session-start.js` がドラフトのパスを通知する
- ドラフトは自動で CLAUDE.md には反映されない — ユーザーが確認して手動でコピーする

---

#### `cost-tracker.js` — トークンコスト記録

**Hook ID:** `vcw:stop:cost-tracker` | **プロファイル:** standard, strict | **タイムアウト:** 10 秒

**目的:** `input.usage` から `input_tokens` / `output_tokens` を読み、モデル別の単価でコストを計算して `~/.claude/vivastack-cc-workflows/metrics/costs.jsonl` に追記する。

**単価 (per 1M tokens):**

| モデル | Input | Output |
|--------|-------|--------|
| Sonnet | $3 | $15 |
| Opus | $15 | $75 |
| Haiku | $0.8 | $4 |

**返り値:** `undefined`

---

#### `desktop-notify.js` — デスクトップ通知

**Hook ID:** `vcw:stop:desktop-notify` | **プロファイル:** standard, strict | **タイムアウト:** 10 秒

**目的:** Claude がターンを完了したことをデスクトップ通知で知らせる。

**プラットフォーム対応:**

| 環境 | 手段 |
|------|------|
| macOS | `osascript` |
| Windows / WSL | PowerShell `MessageBox` |
| Linux (非 WSL) | no-op |

**返り値:** `undefined`

---

#### `evaluate-session.js` — セッション評価ヒント [strict]

**Hook ID:** `vcw:stop:evaluate-session` | **プロファイル:** strict のみ | **タイムアウト:** 10 秒

**目的:** メッセージ数が 10 以上のセッションで、パターン抽出が可能である旨を stderr に通知する。

**返り値:** `undefined`

---

### SessionEnd

セッション終了時 (Claude Code プロセスが閉じるとき) に実行される。

---

#### `session-end-marker.js` — セッションリースクリーンアップ

**Hook ID:** `vcw:session:end-marker` | **プロファイル:** minimal, standard, strict

**目的:** セッション開始時に作成されたリースファイル `~/.claude/vivastack-cc-workflows/tmp/lease-<sessionId>.json` を削除する。

**返り値:** `undefined`

---

### PermissionRequest / TaskCreated / TaskCompleted / Notification / StopFailure / WorktreeCreate / WorktreeRemove / ConfigChange / CwdChanged / FileChanged / PermissionDenied

いずれも `play-audio.js` のみが登録されている。→ [共有スクリプト](#play-audiojs--音声通知) を参照。

---

## 共有スクリプト

複数のイベントから呼ばれるスクリプト。

---

### `governance-capture.js` — ガバナンスイベント記録

**Hook ID:** `vcw:pre:bash:governance` / `vcw:pre:edit:governance` / `vcw:post:bash:governance` / `vcw:post:edit:governance`
**プロファイル:** standard, strict | **有効条件:** `VCW_GOVERNANCE_CAPTURE=1`

**全体の流れ**

```text
PreToolUse / PostToolUse
  └─► run(input)
        ├─► VCW_GOVERNANCE_CAPTURE=1 でなければ → 即リターン
        ├─► シークレットパターンを検出
        │     (AWS キー / GitHub トークン / JWT)
        ├─► 危険コマンドを検出
        │     (rm -rf / git push --force / DROP TABLE)
        ├─► 機密ファイルパスを検出
        │     (.env / .pem / .key 等)
        └─► 一致したイベントを JSONL で
              ~/.claude/vivastack-cc-workflows/governance.jsonl に追記
```

**返り値:** `undefined` (非ブロック、副作用のみ)

**ポイント**

- デフォルト無効 (`VCW_GOVERNANCE_CAPTURE=1` を明示的に設定した場合のみ動作)
- 監査証跡目的のスクリプト

---

### `play-audio.js` — 音声通知

**Hook ID:** `vcw:session:start-audio` / `vcw:session:end-audio` / `vcw:permission:audio` / `vcw:task:created-audio` / `vcw:task:completed-audio` / `vcw:compact:pre-audio` / `vcw:compact:post-audio` / `vcw:stop:audio` / `vcw:stop:failure-audio` / `vcw:notification:audio` / `vcw:worktree:create-audio` / `vcw:worktree:remove-audio` / `vcw:config:change-audio` / `vcw:cwd:changed-audio` / `vcw:file:changed-audio` / `vcw:permission:denied-audio`
**プロファイル:** minimal, standard, strict

**全体の流れ**

```text
各イベント発火
  └─► run(input)
        ├─► VCW_PLUGIN_ROOT が未設定 → null
        ├─► event → 音声ファイルパスをマッピング (EVENT_AUDIO_MAP, 16 エントリ)
        │     SessionStart      → audios/sessionstart/sessionstart.wav
        │     SessionEnd        → audios/sessionend/sessionend.wav
        │     PermissionRequest → audios/agent_permissionrequest/...wav
        │     TaskCreated       → audios/taskcreated/taskcreated.wav
        │     TaskCompleted     → audios/taskcompleted/taskcompleted.wav
        │     PreCompact        → audios/precompact/precompact.wav
        │     PostCompact       → audios/postcompact/postcompact.wav
        │     Stop              → audios/stop/stop.wav
        │     StopFailure       → audios/stopfailure/stopfailure.wav
        │     Notification      → audios/notification/notification.wav
        │     WorktreeCreate    → audios/worktreecreate/worktreecreate.wav
        │     WorktreeRemove    → audios/worktreeremove/worktreeremove.wav
        │     ConfigChange      → audios/configchange/configchange.wav
        │     CwdChanged        → audios/cwdchanged/cwdchanged.wav
        │     FileChanged       → audios/filechanged/filechanged.wav
        │     PermissionDenied  → audios/permissiondenied/permissiondenied.wav
        ├─► プラットフォームに応じたコマンドで再生
        │     WSL/Windows → PowerShell
        │     macOS       → afplay
        │     Linux       → aplay or paplay
        └─► 不明イベント / 再生エラー → サイレントに no-op
```

**返り値:** 常に `null` (ブロックなし)

**ポイント**

- `VCW_PLUGIN_ROOT` が未設定なら一切動作しない
- 音声ファイルは `.wav` 形式 (`audios/<folder>/<folder>.wav`)

---

## テストインフラ

```bash
cd .claude/hooks

npm test           # 全テスト実行
npm run coverage   # カバレッジ付き実行 (80% 行/関数, 65% ブランチ)
node tests/<name>.test.js  # 単一テスト実行
```

### `tests/run-all.js` — テストランナー

- `tests/` 配下の `*.test.js` を再帰的に収集 (`helpers/` は除外)
- 各ファイルを `node` でサブプロセス実行
- exit code 0 = pass / 非 0 = fail として集計
- 失敗があれば詳細を表示し、exit 1 で終了

### `tests/helpers/test-utils.js` — 共有テストユーティリティ

| 関数 | 用途 |
|------|------|
| `runHook(scriptRelPath, inputObj, flags?, envOverrides?)` | `run-with-flags.js` 経由でフックをサブプロセス実行。`{ status, stdout, stderr, parsed }` を返す |
| `runScript(scriptRelPath, inputObj)` | `require()` でスクリプトをインプロセス実行。高速だがサブプロセスの副作用なし |
| `createTempDir()` | `os.tmpdir()` 下に一時ディレクトリを作成。`{ tmpDir, cleanup }` を返す |
| `withEnv(vars, fn)` | 環境変数を一時的に上書きして `fn()` を実行後に元に戻す |

### テストファイル一覧 (21 ファイル)

| ファイル | 対象スクリプト |
|---------|--------------|
| `block-no-verify.test.js` | `block-no-verify.js` |
| `auto-tmux-dev.test.js` | `auto-tmux-dev.js` |
| `claude-md-suggest.test.js` | `claude-md-suggest.js` |
| `config-protection.test.js` | `config-protection.js` |
| `format-markdown.test.js` | `format-markdown.js` |
| `format-typecheck.test.js` | `format-typecheck.js` |
| `format-yaml.test.js` | `format-yaml.js` |
| `gateguard-fact-force.test.js` | `gateguard-fact-force.js` |
| `gitleaks.test.js` | `gitleaks.js` |
| `hook-flags.test.js` | `lib/hook-flags.js` |
| `mcp-health-check.test.js` | `mcp-health-check.js` |
| `module-context.test.js` | `module-context.js` |
| `play-audio.test.js` | `play-audio.js` |
| `quality-gate.test.js` | `quality-gate.js` |
| `run-with-flags.test.js` | `run-with-flags.js` |
| `sanitize.test.js` | `lib/sanitize.js` |
| `security-trigger.test.js` | `security-trigger.js` |
| `session-start.test.js` | `session-start.js` |
| `shellcheck.test.js` | `shellcheck.js` |
| `state.test.js` | `lib/state.js` |
| `viva-plan-gate.test.js` | `viva-plan-gate.js` |
| `integration/hooks-pipeline.test.js` | `run-with-flags.js` 経由の結合テスト |

---

## ログとデバッグ

### フックログ

`logs/hooks-log-YYYY-MM-DD.jsonl` に各フック呼び出しが記録される (7 日保持)。
有効化条件: `vcw:hooks-log` フックが `standard` または `strict` で有効。

```bash
# 今日のログを確認
cat .claude/hooks/logs/hooks-log-$(date +%Y-%m-%d).jsonl | jq .
```

### 環境変数によるデバッグ

| 変数 | 説明 |
|------|------|
| `VCW_HOOK_PROFILE=minimal` | 安全必須フックのみ実行 |
| `VCW_HOOK_PROFILE=strict` | 追加強制フックを含めて実行 |
| `VCW_DISABLED_HOOKS=hookId1,hookId2` | 特定フックを一時的に無効化 |
| `SECURITY_REVIEWED=1` | `security-trigger.js` をバイパス |
| `VCW_GOVERNANCE_CAPTURE=1` | `governance-capture.js` を有効化 |

### よく使うデバッグコマンド

```bash
# 特定フックを直接テスト
echo '{"tool_input":{"command":"git commit -m test"}}' \
  | node .claude/hooks/run-with-flags.js vcw:pre:bash:block-no-verify \
      .claude/hooks/scripts/block-no-verify.js minimal,standard,strict

# hook-flags の状態確認
VCW_HOOK_PROFILE=strict VCW_DISABLED_HOOKS=vcw:pre:bash:gateguard \
  node -e "const f=require('./.claude/hooks/lib/hook-flags'); console.log(f.isHookEnabled('vcw:pre:bash:gateguard', ['standard','strict']))"

# メトリクス確認
cat ~/.claude/vivastack-cc-workflows/metrics/tool-usage.jsonl | jq -s 'group_by(.tool) | map({tool:.[0].tool, count:length}) | sort_by(-.count)'

# コストサマリー
cat ~/.claude/vivastack-cc-workflows/metrics/costs.jsonl | jq -s 'map(.cost) | add'
```
