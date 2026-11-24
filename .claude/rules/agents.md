# Agent Orchestration

エージェントの定義は `.claude/agents/` にある（一覧は Agent ツールに出る）。

- コードを書いた・変えたら、**code-reviewer** でレビューする。
- コミットの前に security-trigger に止められたら、**security-reviewer** でステージした変更をレビューする（`CLAUDE.md`）。
