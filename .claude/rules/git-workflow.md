# Git Workflow

コミットメッセージと PR のタイトルの形式は `AGENTS.md`（開発ルール）。

## Branches

- `main`：ルールセット（CI 必須・承認 1 件）で保護されている。PR ごとに `ci.yml`（検査・ビルド・プレビュー）が動く。本番へは、`main` のコミットを指す GitHub Release の公開で出す（`deploy.yml`、D50）。
- feature ブランチは `main` から切り、PR は `main` 向けに出す（`gh pr create --base main`）。1 機能＝1 ブランチ＝1 PR。
- `main` に直接 push しない。
