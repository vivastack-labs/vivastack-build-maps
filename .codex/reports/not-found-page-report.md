# 専用404画面の実装報告

## 概要

`main`（`2f085d9`）から `feat/styled-not-found` を作成し、既存の静的404を更新した。トップと同じ書体・サイト名、地図の海と選択中の県の配色を使う。日本語の案内と「日本地図へ戻る」リンクを表示し、通常のリンクで `/ja/` を開く。

[元の計画](../plans/completed/not-found-page.plan.md)の規模は Small、見通しは9/10、7ファイル・4工程の見込み。実績はアプリ・テスト・アーキテクチャ文書の既存8ファイル（90行追加・20行削除）。開発計画のタスクや元PRDに対応する変更はない。

## 実装状況

| 工程 | 状況 |
| --- | --- |
| Red | 旧画面で新しい案内と復帰を確認するテストが失敗し、既存の axe 2件は通過した |
| Green | 静的404・3言語の辞書を更新。ルビの前後にテストランナーが挿入する空白を、既存の名前検索と同じ方法で吸収した |
| Refactor・検証 | アーキテクチャメモを更新し、全体テスト、本番ビルド、Workers 上の対象 E2E、目視を実施 |
| PR時の作業 | PR作成時に `pnpm screenshots` の after 表を掲載する。マージ前の手動 E2E は D30 に従う |

`docs/architecture/platform.md` に404の axe と Workers E2E の分担を追記したため、計画より1ファイル増えた。アプリ側の変更範囲は計画どおり。

## 検証

| 検証 | 結果 |
| --- | --- |
| `pnpm typecheck`・`pnpm lint` | 通過。YAML lint に既存の文書開始記号の警告2件 |
| `pnpm vitest run tests/unit/i18n/messages.test.ts tests/unit/styles/theme-contrast.test.ts` | 2ファイル・105テスト通過 |
| `pnpm test` | 98ファイル・2,048テスト通過。全体のステートメント96.72%、分岐93.97%、関数96.70%、行96.94%。ドメインの設定しきい値を満たした |
| `pnpm build` | 通過。CSP 付きの `dist/404.html` を生成 |
| `pnpm test:e2e tests/e2e/workers.spec.ts tests/e2e/a11y.spec.ts tests/e2e/layout.spec.ts tests/e2e/csp.spec.ts --grep 404 --workers=3` | 9設定で55件通過。axe は代表の Chromium で実行し、他の設定で16件を予定どおりスキップ |
| ローカル Workers の画像とフォーカス | PCと360pxのスマホ、ライト・ダーク、PCの200%拡大相当（1280pxを640 CSS pxとして確認）で表示を目視。横スクロールや文字切れがなく、ダーク時に2pxのキーボードフォーカス枠を確認 |

E2Eで、ルート直下および言語配下の未定義URLに HTTP 404・`noindex`・日本語文書が返ること、PCの Tab → Enter と JavaScript 無効時のリンク操作で日本語トップに移動すること、CSP 違反と axe の A・AA 違反が0件であることを確認した。Wrangler のローカル設定書き込み先には一時ディレクトリを使った。

独立コードレビューでは指摘0件。PR向け画像の公開と GitHub Actions の全体 E2E は、PRを出す時点の作業として残している。
