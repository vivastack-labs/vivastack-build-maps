# T5-05 佐賀県のコンテンツ制作計画

## 対象と参照仕様

- 対象は佐賀県（`41-saga`）。九州では福岡県の PR #91 が進行中のため、県コード順で次の佐賀県に着手する。
- ブランチは `feat/T5-05-content-saga`。`origin/develop` の `784fc3d` を基点に専用 worktree で作業する。
- [T5-05 の定義](../../docs/tasks/m5-content.md)に従う。依存する T5-04 と T3-09 は完了済み。
- [開発概要書](../../docs/development-overview.md)の 7.1〜7.3、9.2〜9.4、D22、R8 と [カードの設計](../../docs/architecture/card.md)を参照する。
- [執筆ルール](../../content/guidelines/writing.md)と[レビュー基準](../../content/guidelines/review-checklist.md)を適用する。

## 作業順

1. 承認後にこの計画をコミットし、Node.js 26 と `pnpm install --frozen-lockfile` で検証環境を用意する。
2. `gotouchi-content` を使う。自治体・観光協会・公的機関・交通機関の公式ページの本文を開き、名物3件・名所3件・東京からの行き方1件を選ぶ。`content/prefectures/41-saga.yaml` におとな向け日本語、ふりがな、出典を下書きする。県の基本情報は保持する。
3. `gotouchi-source-checker` に本文・出典・経路・所要時間の照合を依頼する。指摘を修正し、項目ごとに独立照合の結果を記録する。
4. 照合したおとな向け日本語を基準に、こども向け日本語と、英語・簡体字中国語の両モードを作る。`gotouchi-derivative-checker` に事実、文体、文字数、ふりがなの検証を依頼する。
5. 修正箇所は変更後の本文で再検証する。出典照合・派生版検証・機械検査を通過した項目を `verified` にする。未解消または再検証待ちの項目は `draft` にする。
6. テストとビルドを確認し、`code-reviewer` に最終差分の確認を依頼する。検証記録を計画に追記し、`develop` 向けに PR を作る。

## テストと完了条件

既存テストで佐賀県の追加データを検証する。コンテンツによる挙動の差は本番用とプレビュー用の生成物で確認する。

| 条件 | 確認方法 |
| --- | --- |
| T5-05・7.1〜7.3 のスキーマ、件数、ふりがな、文字数 | `pnpm content:validate`、`pnpm content:furigana --check content/prefectures/41-saga.yaml`、`pnpm lint:yaml`。辞書との差は公式表記で確かめ、残った警告の理由を PR に書く |
| T1-08・F-MAP-01 の県の基本情報 | `pnpm vitest run tests/data/content.test.ts` とベースとの差分で確認する |
| 9.2・9.3・D22 の出典と派生版 | 2つの独立検証で出典本文との一致と全言語・モードの意味の一致を確認する |
| 共通検査 | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` を実行する |
| T3-02・T3-09 の出し分け | 本番では佐賀県の詳細が空であることを確認する。`pnpm build:preview` では `dist/cards/{ja,en,zh}/41.json` の項目数と下書きの印を確認する |
| T5-05・9.4 の人によるレビュー | 独立検証済みの制作物を PR に出す。人の承認後にオーナーが `reviewed` にする |

データ整備期間の運用に従い、E2E は `develop` から `main` への統合時に実施する。

## 判断事項と推奨案

| 項目 | 推奨案と理由 |
| --- | --- |
| 対象県 | 福岡県に続く佐賀県。九州の制作を進めながら、福岡県の作業との重複を防げる |
| 題材と交通手段 | 公式本文で裏付けられる題材を選ぶ。東京からの行き方は交通機関の公式時刻表で確かめられる経路を採用する |
| 提出時の状態 | 最終稿の両検証を通過した項目を `verified` として `develop` に提出する。項目ごとの通過と修正後の再検証を計画に記録する |
