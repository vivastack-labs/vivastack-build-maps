# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Branches

- `main`：ルールセット（CI 必須・承認 1 件）で保護されている。PR ごとに `ci.yml`（検査・ビルド・プレビュー）が動く。本番へは、`main` のコミットを指す GitHub Release の公開で出す（`deploy.yml`、D50）。
- feature ブランチは `main` から切り、PR は `main` 向けに出す（`gh pr create --base main`）。1 機能＝1 ブランチ＝1 PR。
- `main` に直接 push しない。

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
