# Codex 用ルール

`.claude/rules/` の判断基準を、このリポジトリの Codex 用に整理したもの。
共通の要件・コマンド・言語・禁止事項はルートの `AGENTS.md` を正とする。
作業前に次の表から該当するファイルを読む。Claude 側のファイルは変更しない。

| 作業 | 読むルール | 参照した Claude 側の資源 |
| --- | --- | --- |
| 計画・実装 | [development-workflow.md](development-workflow.md) | `.claude/rules/development-workflow.md` |
| コードを書く・直す | [coding-style.md](coding-style.md)、[testing.md](testing.md) | `.claude/rules/coding-style.md`、`testing.md` |
| 役割分担・サブエージェント | [agents.md](agents.md) | `.claude/rules/agents.md` |
| レビュー・作業完了 | [code-review.md](code-review.md)、[security.md](security.md) | `.claude/rules/code-review.md`、`security.md` |
| ブランチ・コミット・PR | [git-workflow.md](git-workflow.md) | `.claude/rules/git-workflow.md` |
| hooks・実行権限 | [hooks.md](hooks.md) | `.claude/rules/hooks.md` |

Claude の Agent / SendMessage / AskUserQuestion は、Codex で利用可能な委譲・追加指示・質問の
機能に読み替える。ツールがなければ、その役割の定義を読んでメインで実施し、独立レビューを
行ったかどうかを報告する。モデル名は指定せず、親セッションのモデルと推論設定を継承する。

`general-purpose` は Claude Code 組み込みの役割を参考にした Codex の汎用役であり、
このリポジトリに同名の Claude 定義ファイルはない。

コンテンツ制作①〜④は `.agents/skills/gotouchi-content/SKILL.md` を使う（D22）。
検証の2役は、このスキルからの依頼または個別の検証依頼に使い、報告だけを返す。
メインが②④の通過と機械検査を確認した項目だけ `verified` にする。
`reviewed` への変更はレビュアーの承認後のオーナーの判断とする。

Codex 固有の変換方針はここで管理する。Claude 側を参照して更新するときは差分を読み、
実際に使えるツール・権限・本プロジェクトの仕様に合わせて反映する。
定義の配置形式は [Codex の公式仕様](https://learn.chatgpt.com/docs/agent-configuration/subagents) に従う。
