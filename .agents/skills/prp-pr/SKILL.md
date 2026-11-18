---
name: prp-pr
description: 現在の作業ブランチの全差分・テンプレート・PRP成果物からGitHub PRを作る。PR作成を依頼されたときに使い、base指定とdraftに対応する。
---

# PRを作成する

`AGENTS.md`、`.codex/rules/index.md`、Git・レビュー・セキュリティ・hooksのルールを読む。入力のbaseは既定 `main`、draft指定があれば `--draft` として扱う。PR作成依頼に必要な作業ブランチのpushとPR作成だけを行い、merge・デプロイ・無関係なコメントや外部送信は行わない。

## 前提と調査

- GitHub接続ツールまたは `gh` の利用と認証を確認する。使えなければ理由と必要な準備を報告する。認証情報は表示しない。
- `git branch --show-current`、`git status --short`、`git log origin/<base>..HEAD --oneline` を確認する。base上、先行コミットなしなら終了。未コミット変更があれば勝手にstash・コミットせず、`prp-commit` 等での整理を案内する。
- 同一headの既存PRを検索し、あればURLを報告して新規作成しない。
- テンプレートを `.github/PULL_REQUEST_TEMPLATE/`（`default.md`優先）、`.github/PULL_REQUEST_TEMPLATE.md`、`.github/pull_request_template.md`、`docs/pull_request_template.md` の順に探す。複数候補で既定がなければ推奨と理由を付けて選択を求める。
- baseからの全コミットと `git diff origin/<base>...HEAD`、ファイル一覧・統計、作業ツリーを確認する。直近コミットだけで判断しない。実装・テスト・文書・設定等に整理する。20ファイル超なら論理的に分割すべきか検討し、必要な判断だけ戻す。
- `.codex/reports/`、`.codex/plans/`（完了分を含む）、`.codex/prds/` の関連成果物を読む。Claude側成果物は必要なら参照するだけで更新・移動しない。ただし Claude Code から引き継いだタスク（`.handoff/HANDOFF.md` の持ち主が `codex`）では、`.claude/PRPs/plans/` の計画を関連成果物として読み、PR本文の計画のリンクはその場所を指す。本文には Claude Code から引き継いだことと、台帳の「引き継いだ時点のコミット」を書く（`docs/claude-codex-collab-design.md` 6.2）。

## レビュー可能な本文の準備

タイトルは `<type>: <英語の説明>`。複数コミットなら主要な変更から組み立て、単一の日本語コミットでもタイトルは英語にする。タスクPRは末尾に `(<タスクID>)`。本文は日本語で、問題と変更後の動作を先頭に置く。

テンプレートの全項目を保ち、該当しない項目は理由付きの該当なしとする。なければ概要、領域別の変更、追加・変更・削除ファイル、検証、関連Issueを記載する。関連するタスクID・計画・報告・PRD、判断と制約を添える。根拠なくIssueをcloseする指定を付けない。

必要な検証・レビューが済んでいるか確認し、CRITICAL・HIGHは解消する。未実施・失敗・未確認は明記する。UI・ルーティング変更はmerge前に手動E2Eが必要。画面変更は `pnpm screenshots` のafter表を載せる。このコマンドが画像ブランチへpushすることを踏まえ、画面変更PR作成の依頼範囲でだけ実行する。`screenshots` ブランチは削除しない。

進捗は開発計画、CHANGELOGはマイルストーン最後と公開時の規約に従う。本文は一時ファイルへ改行を保って保存し、シェルで展開される文字列へ埋め込まない。

## 作成と確認

1. 準備した差分・本文を確認し、`git push -u origin HEAD` で対象ブランチをpushする。拒否されたら原因とローカル・リモートの差を調べて止める。自動rebase・force push・失敗の握りつぶしはしない。
2. 接続ツールの構造化引数、または `gh pr create --base <base> --title <title> --body-file <一時ファイル>` を使う。draft指定なら `--draft` を付ける。失敗・タイムアウト後は既存PRを確認して重複作成を防ぐ。
3. PR番号・URL・タイトル・状態・base/head・追加削除行数・変更ファイル数とCIチェックを確認する。チェック未開始、実行中、失敗、取得不能を区別する。プレビューデプロイの承認やmergeを代行しない。

PRのURL、ブランチ方向、差分統計、CI状態、参照成果物、残る確認を報告する。作成が失敗した場合はpush済みかも含めて正確に伝える。
