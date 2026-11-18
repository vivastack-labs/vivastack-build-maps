# T5-05 徳島県のコンテンツ制作計画

## 対象と参照仕様

- オーナー承認日 2026-11-18。
- 対象は徳島県（`36-tokushima`）。中国地方5県の制作が `develop` に入ったため、次は四国で県コードが最も若い徳島県から進める。
- 作業場所は `worktrees/T5-05-content-tokushima/`、ブランチは `feat/T5-05-content-tokushima`。基点は `origin/develop` の `8625c00`。
- [T5-05 の定義](../../docs/tasks/m5-content.md#t5-05-残りの46県県ごとに繰り返す)に従う。依存する T5-04 と T3-09 は完了している。
- [開発概要書](../../docs/development-overview.md)の 7.1〜7.3・9.2〜9.4、D22・R8 と [カードの設計](../../docs/architecture/card.md)を参照する。
- [執筆ルール](../../content/guidelines/writing.md)と[レビュー基準](../../content/guidelines/review-checklist.md)に沿って、`gotouchi-content` の①〜④を進める。

## 作業順

1. 承認後にこの計画をコミットする。Node.js 26 を使い、`pnpm install --frozen-lockfile` で検証環境を用意する。
2. 自治体・観光協会・公的機関・交通機関の公式ページを開いて、名物3件・名所3件と東京からの行き方1件を選ぶ。`content/prefectures/36-tokushima.yaml` におとな向け日本語と出典を下書きし、`pnpm content:furigana` で読みを確認する。県の基本情報と県庁の位置のコメントは保持する。
3. `gotouchi-source-checker` が、日本語本文・出典・交通経路・所要時間を照合する。指摘を修正し、対象本文と照合結果を項目ごとに記録する。
4. 照合したおとな向け日本語を基準に、こども向け日本語と、英語・簡体字中国語の両モードを作る。
5. `gotouchi-derivative-checker` が、原文との意味の一致、対象年齢に合った表現、文字数、ふりがなを確認する。両方の独立検証と機械検査を通った項目を `verified` にする。未解消の項目は `draft` にする。
6. 検証とビルドを実行し、`code-reviewer` で差分を確認する。計画に出典照合・派生版検証・機械検査の結果を記録する。コミットと push の後、`feat: add content for Tokushima (T5-05)` のタイトルで `develop` 向けに PR を作る。

## テストと完了条件

県データと計画だけを追加するため、既存のテストで確認する。

| 条件 | 確認方法 |
| --- | --- |
| T5-05・7.1〜7.3 のスキーマ、件数、文字数、ふりがな | `pnpm content:validate`、`pnpm content:furigana --check content/prefectures/36-tokushima.yaml`、`pnpm lint:yaml`。辞書との差は公式表記で確かめ、残った警告の理由を PR に書く |
| T1-08・F-MAP-01・D32・D33 の基本情報 | `pnpm vitest run tests/data/content.test.ts` とベースとの差分で確認する |
| 9.2・9.3 の出典と派生版 | 2つの独立検証で、公式本文との一致と全言語・モードの意味の一致を確認する |
| 開発の共通検査 | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` を実行する |
| T3-02・T3-09 の出し分け | 本番では徳島県の詳細が空であることを確認する。`pnpm build:preview` では `dist/cards/{ja,en,zh}/36.json` に対象項目が出ることを確認する |
| T5-05・9.4 のレビュー | 今回は独立検証済みの制作物を PR に出す。チームの承認とオーナーによる `reviewed` への更新は人のレビュー工程で行う |

データ整備期間の運用に従い、E2E は `develop` から `main` への統合時に実施する。今回のカード内容は実データのプレビュービルドで確認する。画面の構成に変更がないため、フィクスチャのスクリーンショットは省略する。

## 判断事項と推奨案

| 項目 | 推奨案と理由 |
| --- | --- |
| 対象県 | 徳島県。制作済みの中国地方に続けて四国をまとめて進められ、既存の作業と重複しない |
| 題材と交通手段 | 公式の本文で裏付けられるものを選び、同じ題材の重複を避ける。経路と所要時間は交通機関の公式情報から決める |
| 検証モデル | 現在のセッションのモデルと推論設定を検証役も継承する。リポジトリのモデル運用に従う |
| 到達状態と PR の宛先 | 通過した項目を `verified` として `develop` に提出する。T5-05 全体の状態は各県の制作が続くため `作業中` とする |
| 既存の worktree とブランチ | 鳥取県・島根県の作業履歴を参照できるよう保持する |
