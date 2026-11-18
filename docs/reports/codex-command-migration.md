# Claude Commands から Codex Skills への移行

## 対象と作業場所

2026-11-18、`chore/codex-hook-parity` の `65ca336` を起点に、
`chore/codex-command-skills` ブランチを別worktreeへ作成した。
元の作業ツリーと `.claude/` は変更しない。対象は `.claude/commands/*.md` の全12件。
既存の `next-task`、`gotouchi-content`、`playwright` は変更しない。

各スキルは `.agents/skills/<名前>/SKILL.md`。
依頼は `$<名前> <入力>` または対応する自然言語で行う。
元コマンドの意図と成果物を残し、プロジェクトの共通規約を優先して書き直した。

## 対応表

| 元Command | Codexスキル | 維持した機能・主な変更 |
| --- | --- | --- |
| aside.md | aside | 読み取りだけの横からの質問、元作業への復帰。進行中はcommentaryで回答 |
| save-session.md | save-session | 目的・根拠・失敗・判断・次の操作の保存。保存先をworktree内へ分離 |
| resume-session.md | resume-session | 最新・日付・ID・別名・明示パスから読み込み、現状と照合して引き継ぐ |
| sessions.md | sessions | 一覧・日付/IDフィルタ・ページ送り・load・info・別名作成削除・ヘルプ |
| prp-prd.md | prp-prd | 対話、市場・技術調査、仮説、指標、実装フェーズ付きPRD |
| prp-plan.md | prp-plan | PRDの依存判定、実コードのパターン調査、設計・検証・完了条件 |
| prp-implement.md | prp-implement | 計画実行、TDD、段階検証、報告、Codex成果物の完了整理 |
| prp-commit.md | prp-commit | staged・パターン・除外・自然言語の対象選択、検証後のコミット |
| prp-pr.md | prp-pr | base・draft・テンプレート、全差分分析、push・PR作成・CI状況確認 |
| update-docs.md | update-docs | 実コードからコマンド・環境・開発文書を同期、手書き部分を保持 |
| update-codemaps.md | update-codemaps | 構造・データ・依存の簡潔な地図、30%超変更の事前確認、鮮度情報 |
| viva-orchestrator.md | viva-orchestrator | 実装→レビュー→テスト→コミット、最大3回の修正、retry・複数計画・結果集約 |

## 非互換・意図的な調整

- Claudeのスラッシュコマンド登録、`argument-hint`、`origin`、引数展開は移植しない。
  `name`・`description` のfrontmatterと、ユーザーの依頼文を解釈する手順へ変換した。
- Claude専用のAgent・SendMessage構文、orch-*役、sonnet/haiku指定は使わない。
  Codexで利用可能な委譲・追加指示を使い、実装はtask-implementer、レビューはcode-reviewer、
  テストはgeneral-purpose、後処理はメインへ割り当てる。モデルと権限は親から継承する。
  委譲できない環境では独立レビュー済みとせず、orchestratorは後処理前に停止する。
- `.claude/PRPs/` の新規保存・更新・移動は行わない。
  新規成果物は `.codex/plans/`、`.codex/prds/`、`.codex/reports/`。
  Claude由来の資料は参照専用とし、変更が必要なら出典付きのCodex側文書を作る。
- セッションはClaudeのグローバル履歴・別名・プラグイン探索を再利用しない。
  `.codex/sessions/` にMarkdownと `aliases.json` を保存する。
  別worktree間で自動共有しない。共有・移行が必要なら保存先または元記録のパスを明示する。
  Codex内部の会話履歴・会話IDやhooksの活動ログを復元する機能ではない。
- セッション補助CLIはPython 3の標準ライブラリだけを使う。
  元の `.tmp` 形式は明示パスから本文を参照できるが、自動インデックスや別名には登録しない。
  空履歴・欠損・曖昧ID・壊れた別名を黙って成功扱いにしない。
- 元の自動pull/rebase、force push、失敗を握りつぶす処理は取り込まない。
  pnpm、日本語コミット・本文、英語PRタイトル、hooks、CI経由のデプロイに合わせた。
- コミットの対象なしは元の「全変更」を保ちつつ、共有作業の無関係な差分は混ぜない。
  元の英語コミット規約より、このリポジトリの日本語規約を優先する。
- orchestratorの「テスト未定義なら成功」は採らず、必要な検証を未実行なら未完了とする。
  再開は工程の完了だけでなく成否・計画ハッシュ・Git状態を照合する。
  初回失敗、後処理失敗、修正3回の上限では停止し、複数計画の後続に進まない。
- 保存後・読み込み後の一律確認待ちは、依頼内容と既存承認に合わせる。
  再開の明示依頼があれば再確認だけで作業を止めない。

## 検証

- 元12件と同名スキルの一対一対応、frontmatterのnameとディレクトリ名の一致を確認。
- skill-creatorの `quick_validate.py`：12件すべて成功。
- Markdown検査：新規12件を含むスキル15件すべて成功。
- セッションCLI：実装前に6件の失敗（補助CLI未作成）を確認し、実装後に独立検証で見つかった境界ケースも追加し、最終12件成功。
  保存→別名→読み込み→詳細→削除、ID/日付フィルタ、ページ送り、空履歴、
  不正別名・外部参照、壊れた別名、空保存を一時ディレクトリで検証した。
  空欄メタデータ、空の既存記録、一覧と詳細への別名表示、タスク統計、保存先のリンク拒否、
  別名更新ロックの競合も、再現テストの失敗を確認してから修正した。
- `git diff --check` と `.claude/` の基点からの差分なしを確認。

再実行するコマンド（worktreeルートから）：

```bash
python3 .agents/skills/sessions/scripts/test_session_store.py
python3 /home/biba/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/<名前>
pnpm exec markdownlint-cli2 '.agents/skills/*/SKILL.md' docs/reports/codex-command-migration.md
git diff --exit-code 65ca336 -- .claude
git diff --check
```

独立した担当がセッション保存→別名設定→一覧→詳細→読み込み→別名削除を実行し、
本文とメタデータの保持、空履歴、未存在ID・不正別名の拒否を確認した。
別のレビュアーが元12件と照合し、PRP5件の構想なし・依存未完了・不存在計画・
stagedのみ・既存PRの各ケースを机上で確認した。
レビューで見つかった保存先リンク、別名の並行更新、コミット後に残る完了成果物は修正した。
オーケストレーターの異常終了後のロック確認・回復手順も追記した。
独立再検証でテスト12件すべて成功。保存先・親のリンクとClaude側保存先の拒否、
別名の同時更新の拒否と再試行、ロック解放を実行確認した。
成果物整理をコミット前に行う順序も再確認し、最終レビューは指摘なし
（CRITICAL・HIGH・MEDIUM・LOWすべて0件）。

実際のpush・PR作成・デプロイ、全計画パイプラインの実行、新規セッションでの
自動スキル選択はこの移行検証では実行しない。外部サービスの成功や
Codex内部のUI上の登録まで確認できたとは扱わない。
