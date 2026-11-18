# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Branches

- `main`：本番（merge すると `deploy.yml` が本番に出す）。ルールセット（CI 必須・承認 1 件）で保護されている。`main` 向けの PR だけ、`ci.yml`（検査・ビルド・プレビュー）が動く。
- `develop`：データ整備の間（T5-05）の統合ブランチ。保護はなく、CI・プレビュー・レビューの必須もない。
- feature ブランチは `develop` から切り、PR は `develop` 向けに出す（`gh pr create --base develop`）。1 機能＝1 ブランチ＝1 PR。
- データ整備が終わったら、`develop` → `main` の PR をまとめて出す。CI・E2E・レビューはそこで行う。
- `main` と `develop` に直接 push しない。`main` に出した修正（障害の切り戻しなど）は、`develop` に取り込む。

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
