# GitHub Release の公開を本番デプロイの起点にする

## 目的と範囲

オーナーとして、レビューを終えた変更を `main` に取り込み、公開すると決めた版だけを本番に出したい。`main` に取り込んだコミットに `v1.0.1` のようなタグを付け、GitHub Release を正式公開すると、そのコミットのビルド・デプロイ・本番の読み取り検査が順に動くようにする。

元 PRD と対象フェーズはなし。公開済みの T0-05・T0-06・T6-02 に関わる運用変更。複雑さは Medium。実装の見込みは 10 ファイル、作業は 5 件。参照仕様は開発概要書 11.2・11.5・12.1〜12.3・13、D35・D44・D45・D49。仕様の更新履歴と付録 A に今回の決定を追加する。

## 実装時の判断と進捗

- 既存タグの Release は Write 権限の利用者も公開できる。独立レビューを受け、リリースタグの保護に加え、`production` でオーナー承認を必須にした。承認とタグ保護を先に反映し、タグの許可はその後に行う。
- `pnpm github:setup` に設定されていた `inspireme` のユーザー名は、GitHub API が 404 を返した。実際の `preview` 承認者のログイン名と ID を確認し、設定を `vivastack` に揃えた。
- 実装とローカル検証の結果は [実装報告](../reports/production-release-trigger-report.md) に記録する。GitHub の設定反映、本番への切り替えと読み取り検査は次回の正式公開時に確認する。

| 操作 | 現在 | 変更後 |
|---|---|---|
| `main` 向け PR の作成・更新 | CI と所定のプレビュー | 同じ |
| PR のマージ・`main` への push | 本番デプロイ | 次回公開の候補を更新 |
| タグだけを作成・push、または Release を下書き保存 | 本番デプロイなし | 同じ |
| 正式 Release を公開 | 本番デプロイなし | 対象タグのコミットをビルドし、オーナー承認後に本番へ出して検査 |
| プレリリースの公開、Release の編集 | 本番デプロイなし | 同じ |

アプリ画面・ルーティング・データは対象外。画面の変更前後の図と PR 用の画像は該当なし。Cloudflare の設定、Token の値、既存の本番検査、全構成 E2E の手動運用は現在の構成を使う。

## 実装前に読む箇所

| 優先度 | ファイル | 確認内容 |
|---|---|---|
| 必須 | [deploy.yml](../../.github/workflows/deploy.yml#L11) | `push.branches: [main]`、3 job の順序、checkout、Artifact、権限と Secrets |
| 必須 | [github-settings.ts](../../scripts/github-settings.ts#L21) | admin・組織オーナーの識別、`production` の許可 ref |
| 必須 | [github-setup.ts](../../scripts/lib/github-setup.ts#L187) | 名前による Ruleset の差分、Environment の ref の型、書き込み順と失敗時の停止 |
| 必須 | [github-setup.test.ts](../../tests/unit/scripts/github-setup.test.ts#L68) | モック API、冪等性と書き込み順の検証 |
| 必須 | [github-settings.test.ts](../../tests/unit/scripts/github-settings.test.ts#L1) | `yaml` の `parse(readFileSync(..., 'utf8'))` による設定と workflow の照合 |
| 必須 | [開発概要書](../../docs/development-overview.md#L1014)・[開発計画](../../docs/development-plan.md#L43) | 11〜13章、D44・D45・D49、決定と仕様更新の手順 |
| 必須 | [M0](../../docs/tasks/m0-setup.md#t0-05-cloudflaregithubの事前設定)・[M6](../../docs/tasks/m6-release.md#t6-02-公開)・[配信アーキテクチャ](../../docs/architecture/platform.md) | 事前設定・公開・本番検査の契約と履歴 |

2026-11-20 の GitHub API の読み取りでは、既定ブランチは `main`、`production` は `type: branch` の `main` だけを許可し、有効なリポジトリルールセットは `main-ci`・`main-review`。タグと GitHub Releases は一覧で見つからなかった。変更適用の前に再取得する。

## 採用する設計

- `release: { types: [published] }` を使い、`github.event.release.prerelease == false` で正式版に限定する。ビルド前に `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` でタグ名を検査し、イベント SHA が `origin/main` の履歴にあることを `git merge-base --is-ancestor` で確かめる。Release のターゲット欄は既存タグの参照先を保証しないので、コミット自体を検査する。各 job は `${{ github.sha }}` を checkout する。[GitHub Actions の release イベント](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)・[GitHub Release の作成](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release)
- Environment `production` の許可 ref を `type: tag` の `v*` に変更する。同じ範囲 `refs/tags/v*` を対象にした有効なタグルールセット `production-release-tags` を作り、リポジトリ admin・組織オーナーだけに作成・更新・削除のバイパスを認める。タグ側から任意の workflow を実行できるため、workflow 内でのタグ検査だけでは Secrets を保護できない。ルールセットを先に反映してからタグを許可する。[Environment の ref 制限](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)・[Ruleset の制限](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#restrict-creations)・[Environment のタグポリシー API](https://docs.github.com/en/rest/deployments/branch-policies)
- タグの push を直接トリガーにすると、公開前に作ったタグでも workflow が起動する。正式公開を起点とし、利用できるタグをルールセットで絞る。オーナーが対象 SHA を確認してから本番デプロイを承認する。
- 正式公開の同時実行は既存の `deploy-production` グループを使う。プレリリースには run ごとに別のグループを割り当てる。実行中のデプロイは継続し、複数の待機 run の全部が処理される保証はない。オーナーは本番の検査が終わってから次を公開する。過去の run の再実行は当時の版を対象にするので、通常のリリース手順に含めない。[GitHub Actions の同時実行制御](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

## 既存の実装を使う箇所

| 項目 | 実コードと使い方 |
|---|---|
| 権限・段階 | `permissions: contents: read`、`needs: build`、`environment: production`、`needs: deploy` を [deploy.yml](../../.github/workflows/deploy.yml#L15) から継承。Token は `Deploy to Workers` の step にだけ渡す |
| GitHub 状態の差分 | `policy.name === wanted.name && policy.type === wanted.type` による比較と、Ruleset を名前で照合して `POST`・`PUT` する処理を [github-setup.ts](../../scripts/lib/github-setup.ts#L187) から使う |
| 異常時の停止 | `if (apply) await write(method, path, body)` を順に実行し、API 失敗で終了コード 1 を返す [runGithubSetup](../../scripts/lib/github-setup.ts#L343) を使う |
| テスト | `configured()` を起点にルールセットや ref の状態を変え、`writes` の内容と順序を比較する [github-setup.test.ts](../../tests/unit/scripts/github-setup.test.ts#L68) を使う |

## 作業手順

### 1. Red の検証を追加する

- **ACTION** `tests/unit/scripts/github-settings.test.ts` と `tests/unit/scripts/github-setup.test.ts` を変更する。
- **IMPLEMENT** D49・12.1 の workflow に `release.published` だけがあること、D45・11.5 の移行でタグ保護の `POST`・`PUT` がタグ許可の `POST` より先になること、許可に不要なブランチを削除することを検証する。適用済み、API の権限不足・書き込み失敗も対象。
- **MIRROR** `yaml` で読み込んだ設定を照合するテストと、`configured()`・`run()` による API モックのテスト。
- **IMPORTS** 既存の `node:fs`、`yaml`、`vitest`、`GITHUB_SETTINGS` を使用。
- **GOTCHA** 設定から期待値を丸写しせず、`published`・`type: tag`・保護対象と順序は要件の具体値で検査する。
- **VALIDATE** `pnpm vitest run tests/unit/scripts/github-settings.test.ts tests/unit/scripts/github-setup.test.ts` で、旧トリガー・旧 ref のために新規ケースが失敗することを確認する。

### 2. GitHub の設定差分を実装する

- **ACTION** `scripts/github-settings.ts` と `scripts/lib/github-setup.ts` を変更する。
- **IMPLEMENT** `v*` を設定内で共有し、タグ専用 Ruleset に `creation`・`update`・`deletion` を追加する。バイパスは既存の admin・組織オーナーのロールで `always` とする。`production` の許可を同じタグ範囲へ差し替える。適用順を Ruleset → Environment → Team → Actions → セキュリティにする。
- **MIRROR** `MAIN_REVIEW_RULESET` のロール定義、`planRulesets` と `planEnvironment` の差分出力。
- **IMPORTS** 追加なし。
- **GOTCHA** 既存の `main` 向けルールセットはそのまま使う。preview の承認設定は引き続き Team の Write 付与より先。タグを許可する前に既存の `v*` タグと参照先を点検する。差分のメッセージに `main だけ` や `merge` の固定表現がある箇所は実際の操作に合わせる。
- **VALIDATE** モックで保護の適用が失敗した場合に許可変更へ進まないことを確認。適用後の状態を与えて差分なしになることを確認する。

### 3. workflow のトリガーと参照先を変更する

- **ACTION** `.github/workflows/deploy.yml` を変更する。
- **IMPLEMENT** `published` を購読し、プレリリースを `build` の job 条件で除外する。最初の checkout で `ref: ${{ github.sha }}` と `fetch-depth: 0` を指定し、依存のインストール前に `GITHUB_REF_NAME` の書式と `HEAD` が `refs/remotes/origin/main` の履歴内にあることを確認する。`deploy` と `smoke` の checkout もイベントの SHA を使う。異常時は理由をログに出して終了し、後続 job に進まない。
- **MIRROR** GitHub 標準の `GITHUB_REF_NAME`、`persist-credentials: false`、`build → deploy → smoke` と現在の Artifact。
- **IMPORTS** 追加なし。Git と Bash を使用。
- **GOTCHA** GitHub のイベント文字列を `${{ ... }}` でシェルスクリプトへ直接埋め込まない。`main` の取得に失敗した場合は停止する。タグ移動やマージが起きても、各 job の参照はイベント SHA に固定する。
- **VALIDATE** 部分テストを Green にする。`actionlint .github/workflows/deploy.yml` を実行する。一時 Git リポジトリで `main` の先端・祖先の承認、`main` 外・参照欠落の拒否とタグ書式を確認する。その後、差分を見直して Refactor を行う。

### 4. 仕様と公開手順を同期する

- **ACTION** `AGENTS.md`、`docs/development-overview.md`、`docs/architecture/platform.md`、`docs/tasks/m0-setup.md`、`docs/tasks/m6-release.md` を更新する。
- **IMPLEMENT** 事前設定・反映順・正式公開の手順を記録する。`main` に入った対象 SHA を確認してタグを付け、GitHub Releases の画面で正式公開し、Actions の `smoke` まで確認する。Git で切り戻す場合は、revert をマージしたコミットから新しい版を公開する。既存の v1.0.0 の公開記録は履歴として扱う。
- **MIRROR** 開発概要書の 11.5 の設定表、12.1 のトリガー表、12.2 の図、13章の切り戻し手順。
- **IMPORTS** 追加なし。
- **GOTCHA** CHANGELOG への追記は次回公開時に行う。過去の公開確認を今回のトリガーで実行したように書かない。
- **VALIDATE** `rg` で現在形の旧運用記述を探す。`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` を実行し、検査成功・カバレッジ基準（全体 80%、ドメイン 90%）・`dist/` 生成を確かめる。

### 5. レビューと切り替えを検証する

- **ACTION** コードと CI 権限の独立レビューを行い、オーナーのマージ・設定反映・公開の順を確認する。
- **IMPLEMENT** 変更を `main` に取り込んだ後に `pnpm github:setup` の差分を確認する。オーナーが `--apply` を実行し、再度読み取りで差分なし、Ruleset が有効、`production` が `v*` タグだけを許可することを確認する。次回の正式公開で Actions の結果とデプロイ対象 SHA を確認する。
- **MIRROR** `pnpm github:setup` の読み取り専用の既定値と `pnpm test:e2e:production` を実行する `smoke` job。
- **IMPORTS** 追加なし。
- **GOTCHA** 移行前に別の `deploy` が実行中・待機中なら状態を確認する。設定が揃う前に公開するとデプロイが失敗するので、設定確認の後に最初の Release を公開する。検証だけを目的に本番タグや Release を発行しない。
- **VALIDATE** マージで `deploy` が起動しないこと、次回の正式 Release で `build → deploy → smoke` が成功することを Actions で確認する。画面変更がないため、全構成 E2E の追加実行と画面キャプチャは不要。

## 完了条件とリスク

| 入力・状態 | 期待結果 |
|---|---|
| `main` のマージ、タグだけの push、下書き保存、既存 Release の編集 | `deploy` が起動しない |
| `main` に含まれる SHA の正式な `v1.0.1` Release | タグの SHA からビルドし、オーナー承認後にデプロイと読み取り検査が成功 |
| プレリリースの公開 | `build`、`deploy`、`smoke` がスキップされる |
| `v1.0`、`v01.0.0`、正式公開された `v1.0.1-rc.1`、空のタグ名、`main` 外の SHA | ビルド前検査で停止し、`production` の Secrets の取得を防ぐ |
| 対象タグの作成・更新・削除を試みる Write 権限のレビュアー | GitHub の Ruleset が拒否 |
| タグ保護の書き込みが 403・500 | スクリプトは 1 を返し、Environment のタグ許可は適用されない |
| GitHub・Cloudflare の一時障害 | 対象 SHA と失敗した段階を確認。Artifact の期限を過ぎた場合はビルドから再実行 |

最も影響が大きいのは、タグを先に許可して任意の workflow に本番 Secrets が渡ること。モックの実行順テストと本番設定の読み取りで順序と制限を確認する。次に起きやすいのは切り替え中の公開による失敗で、設定の照合後に最初の正式 Release を公開する。次回の公開までは契約テスト・静的検査と GitHub 設定の確認を結果として残し、実際の本番デプロイと `smoke` の結果は公開時に記録する。

実装の見通しは **8/10**。workflow と設定差分の既存パターンを再利用できる。GitHub 側の保護の有効化と、次回公開時の実行確認が残る。
