# 専用404画面の実装計画

## 概要

存在しないURLを開いた利用者が、このサイトの画面だと分かり、日本地図から探し直せる404画面にする。現在は左上に見出しとリンクが並ぶ。変更後はトップと同じ書体・サイト名を使い、地図の海の色を背景にした案内と、県を選択したときの色を使ったリンクを中央に配置する。

- ユーザーストーリーは「リンク切れに当たったとき、何が起きたかを理解して、日本地図へ移動したい」。
- 複雑さは Small。既存のグローバル404を更新する。元PRD・対象フェーズ・新規タスクIDはなし。関連する既存タスクは T0-03（静的配信）・T4-03（アクセシビリティ）。
- 見込みは既存7ファイル（計画時の見込み）、作業4件。配信は T0-03 と開発概要書 6.4 の仕様に従う。

## 画面と利用フロー

| 箇所・操作 | 変更前 | 変更後 |
| --- | --- | --- |
| 存在しないURLを開く | 左上に見出しとリンクが並ぶ | トップに合わせたサイト名のヘッダーと、角を丸めた中央の案内パネルが見える |
| ページの状況を読む | 「ページが見つかりません」の見出し | 大きな「404」の下に同じ見出しを置き、「URLが正しいか確かめてください。」と案内する。漢字にはふりがなを付ける |
| 日本地図へ移動する | 「トップページへ」のテキストリンク | 「日本地図へ戻る」のリンクを、選択中の県と同系色で目立たせる。クリック・タップ・Tab → Enter で `/ja/` に移動する |
| スマホ・ダークで開く | 左上の簡素な表示 | スマホでは左右余白を残して1列に並べる。ダークでは地図と同じ配色変数で背景・文字・リンクが切り替わる |

構成は「サイト名 → 404 → ページが見つかりません → URLを確認する案内 → 日本地図へ戻る」。ヘッダーのサイト名は現在のサイトを示すテキストとし、パネル内のリンクを移動先の入口にする。PC では最大幅を設けて余白を広げ、狭い幅や拡大時は文の折り返しと縦スクロールを許容する。

## 実装前に読む資料

| 優先度 | ファイル・行 | 読む理由 |
| --- | --- | --- |
| 高 | [開発概要書 4.11.7](../../../docs/development-overview.md#4117-画面構成)、同 5.2（327行）・5.3（354行）・5.5（393行）・6.2（457行）・6.4（515行） | 画面構成、ライト・ダークの配色、対象端末、CSP、静的404の契約 |
| 高 | [T0-03](../../../docs/tasks/m0-setup.md) 77–104行、[T4-03](../../../docs/tasks/m4-pwa-quality.md) | Workers 配信時の404、言語とアクセシビリティの検証条件。配信パスは現行の開発概要書 6.4 を参照 |
| 高 | [画面の枠組み・多言語・モード](../../../docs/architecture/i18n-mode.md) 5–13行、[プラットフォーム](../../../docs/architecture/platform.md) 5–25行 | ページ枠と辞書の責務、CSPとE2Eの規約 |
| 高 | [global-not-found.tsx](../../../app/global-not-found.tsx) 1–36行、[トップ](../../../app/%5Blang%5D/page.tsx) 28–44行、[レイアウト](../../../app/%5Blang%5D/layout.tsx) 44–64行 | 404の入口と、トップの余白・共通配色 |
| 高 | [globals.css](../../../app/globals.css) 13–37、44–126行、[Header.tsx](../../../src/components/Header.tsx) 16–35行 | 和文フォント、見出しの太さ、地図の配色、ヘッダーの余白 |
| 高 | [Workers E2E](../../../tests/e2e/workers.spec.ts) 43–50行、[a11y E2E](../../../tests/e2e/a11y.spec.ts) 65–75、163–203行 | 404のステータスと言語、両配色の axe 検査のパターン |
| 中 | [layout E2E](../../../tests/e2e/layout.spec.ts) 120–165行、[CSP E2E](../../../tests/e2e/csp.spec.ts) 187–198行、[撮影シーン](../../../tests/screenshots/pages.spec.ts) 238–255行 | 横スクロール・CSP・既存の after 画像の検証を再利用 |

Next.js 16.4.6 同梱の `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` の「global-not-found.js (experimental)」「Metadata」と、`01-app/02-guides/static-exports.md` の静的出力例（335行付近）を確認した。グローバル404は言語別のレイアウトを通らず、スタイルを明示的に読み込み、`html` と `body` を含む文書を返す。固定の `metadata` を使え、Next.js は404に `noindex` を付ける。既存の `dist/404.html` でも `lang="ja"` と `noindex` を確認した。既存の配信とUIの機能で完結するため、版固有の判断には同梱資料を使う。

## 既存の実装と採用方針

| 分類 | 実コード抜粋 | 使い方 |
| --- | --- | --- |
| 404の入口・言語 | `const NOT_FOUND_LANG: Lang = 'ja'`（[global-not-found.tsx](../../../app/global-not-found.tsx) 12–16行） | 全未定義パスで日本語の静的文書を配信する。アクセスしたパスは表示データに使わない |
| 余白・タイポグラフィ | `px-4 py-3`、`text-xl font-bold`（[Header.tsx](../../../src/components/Header.tsx) 19–26行）、`bg-page-bg text-page-text`（[layout.tsx](../../../app/%5Blang%5D/layout.tsx) 58行） | 同じヘッダーの間隔・サイト名・ページ配色を使う |
| リンク | `<a href={langPath(lang)}`（[Header.tsx](../../../src/components/Header.tsx) 26行）、`min-h-11`（[LangSwitch.tsx](../../../src/components/LangSwitch.tsx) 7行） | 通常のリンクでトップを読み直す。高さ44px以上にして、キーボードのフォーカスを見えるようにする |
| 文言 | `title: 'ページが{見\|み}つかりません'`（[ja.ts](../../../src/i18n/ja.ts) 229–232行）、`getMessages(NOT_FOUND_LANG)` と `plainText(...)`（[global-not-found.tsx](../../../app/global-not-found.tsx) 12–16行） | `notFound` 内に案内文を追加し、リンク文言を更新する。画面は `RubyText`、タイトルは `plainText` |
| 地図の色 | `ratio('map-sea-label', 'map-sea')` と `ratio('map-selected-label', 'map-selected')`（[theme-contrast.test.ts](../../../tests/unit/styles/theme-contrast.test.ts) 46–59行） | 検証済みの文字色と背景色の組み合わせをそのまま使う |
| 検証 | `expect(response?.status()).toBe(404)`（[workers.spec.ts](../../../tests/e2e/workers.spec.ts) 48行）、`expectNoViolations(page)`（[a11y.spec.ts](../../../tests/e2e/a11y.spec.ts) 178行付近） | 配信された HTML とブラウザ操作を確認する |

専用の静的マークアップを既存の `GlobalNotFound` に置く。共通の `PageFrame` を使う案も検討したが、`SitePage` の追加や言語・モード切替の行き先の設計が必要になり、復帰リンクを中心にした画面の範囲を超える。地図本体を載せる案は、地理データと操作の読み込みが必要になるため見送る。配色と余白でトップとのつながりを出す。

範囲は404の見た目、案内文、復帰操作、その検証。言語別の404ルーティング、通常ページの変更、配信・PWA設定の変更、新規依存は対象外。これに伴うアプリ固有のログ追加は不要。

## 変更ファイル

| ファイル | 変更理由 |
| --- | --- |
| `app/global-not-found.tsx` | サイト名、案内パネル、復帰リンクを専用の静的文書として描画 |
| `src/i18n/ja.ts`、`src/i18n/en.ts`、`src/i18n/zh.ts` | `notFound.description` の追加と `backToTop` の更新。3辞書の型をそろえる |
| `tests/e2e/workers.spec.ts` | 404のレスポンス、文言、JavaScript 無効時の復帰、キーボード操作 |
| `tests/e2e/a11y.spec.ts` | 404のライト・ダークを既存の axe ヘルパーで検証 |
| `docs/architecture/i18n-mode.md` | 通常ページの枠組みに続けて、404専用の静的な枠と辞書の利用を記録 |

## 実装順序

### 1. Red — 404と復帰操作を E2E で定義

- **ACTION** の対象は `workers.spec.ts` と `a11y.spec.ts`。
- **IMPLEMENT** は既存404テストへの `main`・唯一の `h1`・案内文・`noindex`・リンク先の検査の追加。別テストで JavaScript を無効にした状態から復帰させる。PC の Tab → Enter は `@pc` を付け、リンクへのフォーカスと `/ja/` への遷移を確認する。axe は代表の `chromium` でライト・ダークの2通り。
- **MIRROR** は `workers.spec.ts` の HTTP 判定、`index.spec.ts` の `test.use({ javaScriptEnabled: false })`、`a11y.spec.ts` の `SCHEMES` と `expectNoViolations`。
- **IMPORTS** は既存の `expect`、`test`。固定の仕様値 `/ja/` と利用者向けの文言で期待値を書く。
- **GOTCHA** は色や余白のクラス名で利用者の操作を検証しないこと。見出し・リンクは role とアクセシブルな名前で特定する。`@pc` 以外のテストはタッチのプロジェクトでも実行できる形にする。
- **VALIDATE** は `pnpm test:e2e tests/e2e/workers.spec.ts tests/e2e/a11y.spec.ts --project=chromium --grep '404'`。新しい案内文や復帰リンクの期待値で失敗することを確かめる。既存のステータスや axe の検査が先に通ることは許容する。

### 2. Green — 辞書と404画面を更新

- **ACTION** の対象は3辞書と `app/global-not-found.tsx`。
- **IMPLEMENT** は `notFound.description` に「URLが正しいか確かめてください。」、`backToTop` に「日本地図へ戻る」を用意し、日本語の漢字にふりがなの記法を付ける。英語・簡体字中国語にも対応する訳を入れる。ヘッダーはトップと同じ余白とサイト名の書体。パネルは海の配色・境界線、復帰リンクは選択中の県の配色。数値の「404」は視覚的なエラーコードとして見出しの上に置き、見出しから状況が伝わるので読み上げは省く。
- **MIRROR** は `Header` のサイト名・余白、`MapArea` の丸み、`PrefIndex` のフォーカス枠、既存404の `RubyText` と `plainText`。
- **IMPORTS** は既存の `Metadata`、`RubyText`、`htmlLang`、`Lang`、`getMessages`、`plainText`、`./globals.css` に `langPath` を追加する。`next/link` は通常の `<a href={langPath(NOT_FOUND_LANG)}>` に置き換える。
- **GOTCHA** は `html lang="ja"`、単一の `main` と `h1`、既存のタイトル形式を保つこと。Tailwind クラスはリテラルで書く。本文と「404」は `text-map-sea-label`／`bg-map-sea`、リンクは `text-map-selected-label`／`bg-map-selected`、フォーカスの輪郭は間隔を空けて `map-border` を使う。パネルの幅や高さを固定しない。インラインのスタイル・スクリプトを追加しない。
- **VALIDATE** は `pnpm typecheck`、`pnpm vitest run tests/unit/i18n/messages.test.ts tests/unit/styles/theme-contrast.test.ts`、作業1の E2E の再実行。3辞書の型と記法、両配色のコントラスト、追加したE2Eが通ることを確かめる。

### 3. Refactor — 文書を合わせ、静的配信で回帰を検証

- **ACTION** はコードの整理、アーキテクチャメモの追記、ローカル検証。
- **IMPLEMENT** は404に専用の枠を使う理由、辞書の読み出し、日本語の静的ページからトップへ戻る動作をメモに記録する。
- **MIRROR** は既存の「画面の枠組み」の記載と `layout.spec.ts`・`csp.spec.ts` の404検査。
- **IMPORTS** の追加はなし。
- **GOTCHA** は開発サーバーの表示だけで CSP の成功としないこと。`pnpm build` と E2E は `dist/` を共有するため順に実行する。
- **VALIDATE** は `pnpm lint`、`pnpm typecheck`、`pnpm test`（全体80%以上・ドメイン90%以上）、`pnpm build`（`dist/404.html` と CSP の出力）、`pnpm test:e2e tests/e2e/workers.spec.ts tests/e2e/a11y.spec.ts tests/e2e/layout.spec.ts tests/e2e/csp.spec.ts --project=chromium --grep '404'`。スマホ幅は `pnpm test:e2e tests/e2e/layout.spec.ts tests/e2e/workers.spec.ts --project=pixel --grep '404'` で確かめる。ダークでのフォーカス枠と200%拡大時の折り返しを手動で見る。

### 4. PR時 — after と全端末の確認

- **ACTION** は画面変更PRの検証記録。
- **IMPLEMENT** は `pnpm screenshots` が出力する after 表を PR 本文に載せる。既存の `ja-not-found` シーンで PC・スマホの見た目を確認する。マージ前に `gh workflow run e2e.yml --ref <作業ブランチ> -f project=all` を実行し成功を確認する（D30）。
- **MIRROR** は既存の `tests/screenshots/pages.spec.ts` とリポジトリのレビュー手順。変更差分と検証結果をコードレビューに渡す。
- **IMPORTS** の追加はなし。
- **GOTCHA** はPRに使う撮影コマンドが `screenshots` ブランチへ push すること。PR作業の一部として実行する。
- **VALIDATE** は after で見出し・案内・リンクに読み順と余白があり、狭い画面で欠けないこと。全プロジェクトの E2E と、CRITICAL・HIGH の指摘が解消されたことを確認する。

## テスト条件と完了条件

| 要件 | 入力・操作 | 期待結果 |
| --- | --- | --- |
| 6.4・5.2・T0-03 | `/no-such-page/` と `/en/no-such-page/` を直接開く | HTTP 404、`html lang="ja"`、`noindex`、見出し1つ、案内と復帰リンク。URLの言語や文字列を表示に差し込まない |
| F-I18N-02・5.2 | 通常のリンク操作、JavaScript 無効のクリックまたはタップ、PC で Tab → Enter | 復帰リンクは `/ja/` を指す。JavaScript 無効でもトップの見出しが出る。PCではフォーカスが見える |
| F-I18N-04・D28 | 3辞書を全体検査 | キーが一致し、文言が空でなく、ふりがなの記法が検査を通過する |
| F-MAP-04・5.2・5.3 | ライト・ダーク、幅360px、200%拡大 | axe の A・AA 違反0件、色の基準を満たす。横スクロールがなく、リンクに文字切れがない |
| 5.5・R9 | フィクスチャの本番用ビルドを Workers で配信 | 404の CSS が適用され、CSP 違反が0件。既存の CSP 設定で検証が通る |

完了時は対応ファイルの差分、静的出力、文言、復帰操作、ライト・ダーク、文書、PR の after と検証結果を突き合わせる。空URLに相当する `/` のリダイレクトは既存 Workers テストを維持する。フォーム入力、外部通信、権限、並行更新の境界条件は発生しない。

## リスクと判断記録

| リスク | 可能性・影響 | 軽減策 |
| --- | --- | --- |
| 言語別レイアウトの外でスタイルが適用されない | 低。配信後に画面が崩れる | `globals.css` の直接 import を維持し、Workers での E2E と after で確認 |
| 狭い幅や拡大でふりがな、見出し、復帰リンクが欠ける | 中。説明や操作が読めなくなる | 高さを内容に合わせ、幅360pxの既存検査と200%拡大の目視で確認 |
| 地図配色を転用したリンクのフォーカスが暗い環境で見づらい | 低。キーボード利用者が位置を見失う | 検証済みの配色を組み合わせ、両配色で輪郭を確認 |

404の復帰先は既存の日本語トップにそろえる。サイト名は短いヘッダーに置き、主操作は日本地図へのリンクに集約する。実装の見通しは9/10。既存の404配信・スタイル・画面検査を活用できる。残る確認は静的配信時の見た目と、狭幅・拡大時の折り返し。

## 実装結果

`feat/styled-not-found` で実装・ローカル検証・独立レビューが完了した。検証とPR時の作業は[実装報告](../../reports/not-found-page-report.md)を参照。
