# 本番デプロイの起点を GitHub Release に変更した実装報告

- 作業ブランチは `ci/production-release-trigger`。起点は `origin/main` の `347ee04`。
- 元の [実装計画](../plans/production-release-trigger.plan.md) は PRD なし。複雑さは Medium、着手時の見通しは 8/10。見込み10ファイルに対し、実装は11ファイル、185行追加・72行削除。計画と報告は別に扱う。開発者が最初に読む `README.md` にも公開手順を反映した。

## 実装と判断

| 作業 | 結果 |
|---|---|
| トリガー | `release.published` を購読する。プレリリースは全 job がスキップされ、正式公開の実行待ちを取り消さない。 |
| ビルド対象 | 依存のインストール前に正式版タグの形式と `main` の履歴を検査する。ビルド・本番・読み取り検査はイベントの SHA を checkout する。 |
| デプロイ保護 | `v*` タグのルールセットとオーナー承認を先に反映してから、`production` にタグを許可する。その後に既存の `main` の許可を削除する。 |
| 公開手順 | 開発概要書に D50 を追加し、公開・変更適用・切り戻し手順を README、AGENTS、配信アーキテクチャ、関連タスク定義と揃えた。 |

レビューで、Write 権限の利用者が既存タグから Release を公開できることが判明したため、計画に本番 Environment のオーナー承認を追加した。設定の読み取り確認では旧ログイン名の `inspireme` が GitHub API で 404 になった。実際の `preview` 承認者が `vivastack` であることを確認し、設定ファイルとテストを揃えた。

変更対象は `deploy.yml`、`scripts/github-settings.ts`、`scripts/lib/github-setup.ts`、`tests/unit/scripts/github-settings.test.ts`、`tests/unit/scripts/github-setup.test.ts`、`README.md`、`AGENTS.md`、`docs/development-overview.md`、`docs/architecture/platform.md`、`docs/tasks/m0-setup.md`、`docs/tasks/m6-release.md`。

## 検証

| 検証 | 結果 |
|---|---|
| `pnpm vitest run tests/unit/scripts/github-settings.test.ts tests/unit/scripts/github-setup.test.ts` | 89件成功。変更前のトリガー、許可 ref、書き込み順に対して追加テストが失敗することを確認してから実装した。タグ保護または本番承認設定が失敗すると、タグを許可しない。 |
| `pnpm test` | 99ファイル、2,058テスト成功。行カバレッジ96.95%・分岐93.92%。設定済みのドメイン別基準も通過。 |
| `pnpm typecheck`、`pnpm lint`、`actionlint .github/workflows/deploy.yml`、`git diff --check` | 成功。YAML lint は変更対象外の設定ファイル2件に既存の文書開始マーカーの警告を出した。 |
| `pnpm content:validate`、`pnpm build` | 47件のコンテンツ検証と本番向け `dist/` の生成に成功。 |
| workflow の Bash 検査 | 一時 Git リポジトリで11ケース成功。`main` の先端・祖先、先頭ゼロ、空、プレリリース形式、タグ以外、`main` 外・参照欠落を含む。 |
| `pnpm github:setup` | 読み取りで、タグ保護 → 本番承認 → タグ許可 → 旧ブランチ許可削除の順を確認。今回とは別に、実行者をレビュアー Team から外す予定が表示された。公開手順に、本番の設定のみを変更する方法も記載した。 |

独立コードレビューと独立セキュリティレビューを実施し、オーナー承認を追加した後の再レビューで CRITICAL・HIGH は0件。アプリ画面・ルーティングの変更がないため、全構成 E2E と画面キャプチャは対象外。

## 切り替え時に確認すること

GitHub 側の設定、本番のデプロイと読み取り検査は未実施。この変更を `main` へ取り込んだ後、[本番の公開手順](../../docs/development-overview.md#本番の公開手順) に沿ってルールセットと Environment を反映する。次回の正式公開でイベントの SHA、オーナーの承認待ち、デプロイ結果、`smoke` の成功を確認する。
