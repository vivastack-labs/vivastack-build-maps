# Development Workflow

タスクの進め方の詳細は `next-task` スキル（`.claude/skills/next-task/SKILL.md`）にある。流れは次のとおり。

1. **計画**：実装計画（`.claude/PRPs/plans/<タスクID>-<slug>.plan.md`）を書き、オーナーの承認を取る。
2. **TDD**：[testing.md](./testing.md) の手順で、テストを先に書く。
3. **レビュー**：code-reviewer で行い、CRITICAL・HIGH を直す。MEDIUM もできるだけ直す（[code-review.md](./code-review.md)）。
4. **コミット・PR**：[git-workflow.md](./git-workflow.md) と `AGENTS.md` の形式で。
5. **レビューを頼む前**：CI が通り、`main` と衝突がないことを確かめる。
