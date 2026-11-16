# T0-05 Cloudflare・GitHubの事前設定：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-05
- ブランチ：`chore/T0-05-cloudflare-github-setup`
- 参照仕様：開発概要書 第11章（11.1〜11.5）、13（API Token の更新）、16（U5・U7・U14）、D35、R4・R5

## 目的

デプロイ（T0-06）に要る外部サービスの設定を済ませ、U5（Token の最小権限）・U7（Access の手順）・U14（GitHub のプラン）を決定にする。
GitHub 側は、設定を毎回同じにできるように、冪等なスクリプトで反映する。Cloudflare 側は、手作業の手順を設計書に残す。

## 着手時に調べたこと

- リポジトリはオーナーが public に変えた（U14 は「public にする」で決定）。public なら Free プランでも、ルールセット・ブランチ保護・Environments・Environment の Secrets を使える。Actions の標準のランナーの分数の上限もなくなる。
- 今の GitHub の状態：ルールセット・ブランチ保護・Environments・Secrets はどれもない。Team もない（組織のメンバーはオーナーだけ）。Actions は `default_workflow_permissions: read`・`can_approve_pull_request_reviews: false`。fork からの PR の workflow の承認は `first_time_contributors`。Secret scanning・push protection は無効。
- `gh` の Token のスコープは `gist, read:org, repo, workflow`。Team を作るには `admin:org` が要る（オーナーが `gh auth refresh -h github.com -s admin:org` を実行する）。
- 必須にするチェックの名前は `ci.yml` の job の `check` と `gitleaks`。`check` は文書だけの PR でも動く（`paths-ignore` で workflow ごと飛ばすと、必須のチェックが Pending のままになるため、T0-04）。
- Cloudflare の公式ドキュメント（2026-11-17 に確かめた）：
  - プレビュー URL は「Version URLs」と呼ばれるようになった。形は `<バージョンの先頭>-<Worker名>.<サブドメイン>.workers.dev`、別名は `<alias>-<Worker名>.<サブドメイン>.workers.dev`。
  - Access での保護：Workers & Pages → Worker → **Access** タブ → Protect this Worker behind Access → **Previews only** → 認証のポリシー → Apply Access（`workers/configuration/cloudflare-access/`）。Worker の画面からなので、Worker `maps` が先にある必要がある。全部の Worker をまとめて守る「Protect all Workers」もある。
  - その画面で選べる許可は「Cloudflare account」か「Email domain」だけ。個別のメールアドレスにするには、Zero Trust で Access のポリシー（Include → Emails）を作って選ぶか、後から編集する。
  - Zero Trust の始め方：ダッシュボードの Zero Trust → チーム名を決める → プランを選ぶ → 支払いの情報を入れる（Free プランでも必要だが、課金はされない）。ログインの方法は、最初は Cloudflare のアカウントだけ。One-time PIN は後から足す。
  - Token：GitHub Actions の手順は、テンプレート「Edit Cloudflare Workers」から作るよう書いている。最小の組み合わせは書いていない（U5 は試して決める）。

## 方針

### 1. GitHub：`pnpm github:setup`（冪等なスクリプト）

- 値（秘密でないものだけ）：`scripts/github-settings.ts`。組織・リポジトリ・Team・Environment・必須のチェック・ルールセットの中身を、コメントつきの定数で書く。シークレット・メールアドレスは書かない。
- ロジック：`scripts/lib/github-setup.ts`。`gh api` を呼ぶ関数を引数で受け取り（テストで置き換える）、今の状態を GET して、足りないものだけを作る・直す。
- CLI：`scripts/setup-github.ts`。既定は**確かめるだけ**（これから送るリクエストを表示し、何も変えない）。`--apply` で反映する。終了コード：成功 0、API・引数の誤り 1。
- 反映する設定（判断1〜6）：

  | 項目 | 内容 | API |
  |---|---|---|
  | ルールセット `main-ci` | `main` への直接の push を禁止（PR を必須。承認の数は 0）、`check`・`gitleaks` の成功を必須（`integration_id` は GitHub Actions）、force push・削除を禁止。**バイパスなし** | `rulesets`（名前で探して、なければ POST、あれば PUT） |
  | ルールセット `main-review` | CODEOWNERS の承認を1件必須。「Dismiss stale…」「most recent push」は無効（タスクの定義）。**リポジトリの admin は PR でバイパスできる** | 同上 |
  | Environment `production` | `main` からだけデプロイできる | `environments/production`（PUT）＋ `deployment-branch-policies` |
  | Environment `preview` | 制限なし | `environments/preview`（PUT） |
  | Team `maps-reviewers` | なければ作る（closed）。作った人が自動でメンバーになるので、作ったときだけ外す。リポジトリに Write（`push`） | `orgs/.../teams`、`teams/.../repos/...` |
  | Actions | `default_workflow_permissions: read`、PR の承認をさせない、fork からの PR は外部の人すべてで承認を必須に | `actions/permissions/workflow`、`fork-pr-contributor-approval` |
  | セキュリティ | Secret scanning と push protection を有効に（public なので無料） | `PATCH repos/...`（`security_and_analysis`） |

- Secrets はスクリプトで扱わない（判断7）。値を画面で入力する `gh secret set` を手順に書く。

### 2. Cloudflare（オーナーの手作業。結果を設計書に書く）

1. **Token（U5）**：ダッシュボードの Account API tokens で、権限を `Account / Workers Scripts: Edit` だけ・対象をこのアカウントだけ・期限を1年で作る。オーナーの端末で、捨てる Worker 名（`maps-token-check`）に `wrangler deploy` → `wrangler versions upload` → `wrangler delete` を試す。失敗したら、エラーに合わせて 11.3 の表の権限（`Account Settings: Read` → `Memberships: Read`・`User Details: Read`）を1つずつ足して試し直す（判断8）。
2. **Zero Trust（U7）**：チーム名を決めて、Free プランで始める（支払いの情報の入力が要る）。ログインの方法に One-time PIN を足す。Access のポリシー `maps-reviewers`（Allow、Include → Emails：オーナーとレビュアー）を作る。
3. **プレビュー URL の保護**：Worker `maps` ができてから（T0-06 の最初のデプロイの後）、Worker の Access タブで **Previews only** にし、2 のポリシーを選ぶ。本番の URL が認証なしで開けることを確かめる（判断9）。
4. **Secrets の登録**：`gh secret set CLOUDFLARE_API_TOKEN --env preview` と `--env production`（同じ Token）、`gh secret set CLOUDFLARE_ACCOUNT_ID`（リポジトリの Secret）。

### 3. ドキュメント

- 開発概要書：
  - 11.1・11.5：public にしたこと、プランの制約がなくなったこと、`pnpm github:setup`、ルールセットの分け方。
  - 11.2：Secrets の置き場所（確定）と登録のコマンド。
  - 11.3（U5）・11.4 (5)（U7）：オーナーが試した結果と、手順。
  - 13：API Token の更新の手順（Token の作成 → `gh secret set` を3回 → 古い Token を削除）。
  - 16：U5・U7・U14 を決定にする。決定事項 D44（U14：public・ルールセット）、D45（U5）、D46（U7）。変更履歴 0.17。
  - 12.x の D30 の理由（Actions の月2,000分）：public で上限がなくなったことを書き足す。D30（E2E は手動）は変えない（判断10）。
- 開発計画：U5・U7・U14 の行を決定に、T0-06 の定義に「Worker ができたら Access を Previews only にする」「fork からの PR では Secrets が渡らないので、プレビューを飛ばす」を足す。プライバシーポリシーの問い合わせ先の行の「private なので Issue は使えない」を直す。
- `.github/CODEOWNERS`・`.github/workflows/e2e.yml` のコメント（private・Free の記述）。
- `AGENTS.md` のコマンドに `pnpm github:setup`、`scripts/` の説明に `setup-github.ts`。

## 先に書くテスト

`tests/unit/scripts/github-setup.test.ts`（テスト名に「11.5」を入れる。`gh api` は置き換える）：

- 11.5 確かめるだけのとき（`--apply` なし）は、GET だけを送り、変える予定のリクエストを表示する
- 11.5 ルールセットがなければ POST、同じ名前があれば その id に PUT する
- 11.5 `main-ci` はバイパスなしで、`check`・`gitleaks` を GitHub Actions のチェックとして必須にする
- 11.5 `main-review` は CODEOWNERS の承認を必須にし、dismiss stale・last push approval を無効にし、admin だけが PR でバイパスできる
- 11.5 `production` は `main` だけを許可し、すでに `main` のポリシーがあれば足さない
- 11.5 Team がなければ作り、作った人をメンバーから外す。すでにあれば作らず、メンバーも変えない
- 11.5 Team にリポジトリの Write を付ける
- 11.5 Actions の権限と fork の PR の承認・Secret scanning を設定する
- 11.5 API の誤り（403 など）はメッセージを出して終了コード 1。`admin:org` が足りないときは `gh auth refresh` の案内を出す
- 11.5 知らない引数は終了コード 1

`tests/unit/scripts/github-settings.test.ts`：

- 11.5 必須のチェックの名前が `.github/workflows/ci.yml` の job にある（job の名前を変えたら気づけるように）
- 11.5 `.github/CODEOWNERS` の Team が、設定の Team と同じ

## 作る・変えるファイル（順番）

1. `tests/unit/scripts/github-settings.test.ts`・`github-setup.test.ts`（Red）
2. `scripts/github-settings.ts`・`scripts/lib/github-setup.ts`・`scripts/setup-github.ts`（Green）、`package.json` の `github:setup`
3. レビュー → オーナーが `admin:org` を足す → `pnpm github:setup`（確かめるだけ）→ `pnpm github:setup --apply` → もう一度確かめるだけで「変更なし」
4. オーナーの Cloudflare の作業と Secrets の登録 → 結果を受けて、ドキュメントを書く
5. 計画ファイルを実際に合わせる → PR

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 11.2 の Secrets が、決めた Environment に登録されている | `gh secret list --env preview`・`--env production`・`gh secret list`（名前だけを見る） |
| U5・U7 が決定になり、11.3・11.4 (5) の「要検証」「要確認」が消えている | `grep -n "要検証\|要確認" docs/development-overview.md` で 11.3・11.4 (5) にないこと（11.1 の Web Analytics の「要確認」は T0-05 の対象外で残る） |
| ブランチ保護 | この PR で、`check`・`gitleaks` が必須として表示され、オーナーがバイパスで merge できる |
| 文書だけの PR で `check` が lint だけを実行する | この PR の `check` のログで、typecheck・test・build を飛ばしたこと（ただしスクリプトを含むので、この PR は文書だけにならない。→ 判断11） |

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | スクリプトの形 | TypeScript（`scripts/lib/` にロジック、テストつき）。既定は確かめるだけ、`--apply` で反映 | ほかのスクリプト（`check-links.ts`）と同じ形で、カバレッジの基準（90%）で確かめられる。確かめるだけを既定にすると、間違えて変えない |
| 2 | ブランチ保護の作り方 | ルールセットを2つに分ける（CI はバイパスなし、承認は admin が PR でバイパスできる） | オーナーは1人で、自分の PR を自分で承認できない。クラシックのブランチ保護で admin を外すと、CI の失敗も無視して merge できてしまう。分ければ CI は必ず通る |
| 3 | 「merge の前に main に追いつく」（strict） | 無効 | T5-05 で県ごとの PR が並ぶので、1つ merge するたびにほかの PR を更新して CI をやり直すことになる。県ごとに別の YAML を変えるので、ぶつかることは少ない |
| 4 | Team のメンバー | スクリプトは Team を作るだけ。作った人（オーナー）は外す。レビュアーは GitHub の画面で招待する | オーナーが Team にいると、`/content/` のレビューの依頼がオーナーにも行く。メンバーの管理を入れると、スクリプトが人を外す危険がある |
| 5 | fork からの PR の workflow | 外部の人はすべて承認が要る（`all_external_contributors`） | public にしたので、知らない人の PR で workflow が自動で動かないようにする（今は初めての人だけ） |
| 6 | Secret scanning・push protection | 有効にする | public では無料。Token を誤ってコミットしたときに GitHub が止める（gitleaks の CI と二重になる） |
| 7 | Secrets の登録 | スクリプトに入れず、`gh secret set`（値を画面で入力）を手順に書く。Token は `preview`・`production` の両方に同じものを置く。Account ID はリポジトリの Secret | 値がファイル・コマンドの履歴・この会話に残らない。Token を2つに分けても権限は同じなので、得るものがない |
| 8 | Token の権限の試し方 | 捨てる Worker 名（`maps-token-check`）で、オーナーの端末で試してから消す | 本番の `maps` にデプロイすると、T0-06 の前に本番の URL が公開される。T0-06 まで待つと、この PR で U5 を決められない |
| 9 | プレビュー URL の Access | Worker ごと（`maps` の Access タブで Previews only）。T0-06 の最初のデプロイの直後に設定する | Worker の画面からしか選べない。「Protect all Workers」は同じアカウントのほかの Worker のプレビューにもかかる。今のコンテンツは47県とも「準備中」なので、設定までの短い間にプレビューが見えても、出ていくものはない |
| 10 | D30（E2E は手動）の理由 | D30 は変えず、「public で分数の上限はなくなった。扱いは U15 で決める」と書き足す | 実行の時間（7プロジェクトを順に回す）の問題は残る。決め直しは U15 でまとめて行う |
| 11 | この PR の分け方 | 1つの PR（スクリプト＋文書） | スクリプトと、それで反映した設定の説明は一緒に読むほうが分かりやすい。そのため「文書だけの PR で `check` が lint だけ」の確かめは、この PR ではできない。T0-07 などの次の文書だけの PR で確かめる |
