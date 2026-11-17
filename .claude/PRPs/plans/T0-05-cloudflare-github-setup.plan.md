# T0-05 Cloudflare・GitHubの事前設定：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-05
- ブランチ：`chore/T0-05-cloudflare-github-setup`
- 参照仕様：開発概要書 第11章（11.1〜11.5）、13（API Token の更新）、14（R4・R5）、16（U5・U7・U14）、D35

## 目的

デプロイ（T0-06）に要る外部サービスの設定を済ませ、U5（Token の最小権限）・U14（GitHub のプラン）を決定にする（U7 は T0-06 に移した）。
GitHub 側は、設定を毎回同じにできるように、冪等なスクリプトで反映する。Cloudflare 側は、手作業の手順を設計書に残す。

## 着手時に調べたこと

- リポジトリはオーナーが public に変えた（U14 は「public にする」で決定）。public なら Free プランでも、ルールセット・Environments・Environment の Secrets を使える。Actions の標準のランナーの分数の上限もなくなる。
- 着手時の GitHub の状態：ルールセット・Environments・Secrets・Team はどれもない（組織のメンバーはオーナーだけ）。Actions は `default_workflow_permissions: read`。fork からの PR の承認は `first_time_contributors`。
- `gh` の Token のスコープに `admin:org` がない（Team を作るのに要る）。
- 必須にするチェックの名前は `ci.yml` の job の `check` と `gitleaks`。`check` は文書だけの PR でも動く（T0-04）。
- Cloudflare の公式ドキュメント（2026-11-17）：
  - プレビュー URL は「Version URLs」と呼ばれるようになった（`<バージョンの先頭>-<Worker名>.<サブドメイン>.workers.dev`、別名は `<alias>-…`）。
  - Access での保護は、Worker の **Access** タブ → **Previews only**。Worker の画面からなので、Worker `maps` が先にある必要がある。その画面で作れる許可は「Cloudflare account」「Email domain」だけで、個別のメールアドレスは Access のポリシーで指定する。
  - Zero Trust の始め方：チーム名 → プラン → 支払いの情報（Free でも要るが課金されない）。One-time PIN は後から足す。
  - Token は「Edit Cloudflare Workers」テンプレートから作るよう書いているが、最小の組み合わせは書いていない。

## 方針（実際に作ったもの）

### 1. GitHub：`pnpm github:setup`（冪等なスクリプト）

- 値（秘密でないものだけ）：`scripts/github-settings.ts`。シークレット・メールアドレスは書かない（テストで確かめる）。
- ロジック：`scripts/lib/github-setup.ts`。
  - 先に今の状態を GET で読み、設定と比べて（`isSubset`：オブジェクトは設定のキーだけ、配列は長さが同じで1対1に対応）、違うものだけを「変更」の一覧にする。応答に余分な項目があっても差にしない。OrganizationAdmin のバイパスは GET が `actor_id: null` を返すので、比べるときだけ `actor_id` を外す。
  - 一覧を作る関数は `get` しか受け取らない（確認モードで書き込めない構造）。`--apply` のときだけ、一覧を順に `write` する。
  - 設定にないリポジトリのルールセットには触れず、警告を出す。
- CLI：`scripts/setup-github.ts`（`execFile('gh', …)`、本文は標準入力、60 秒のタイムアウト、stdin のエラーを拾う）。既定は確かめるだけで、`--apply` で反映する。終了コード：成功 0、API・引数の誤り 1。
- 反映する設定（順番も実際のとおり。途中で止まっても「Team は Write、preview は承認なし」を残さないように、Environment を先にする）：

  | 順 | 項目 | 内容 |
  |---|---|---|
  | 1 | Environment `production` | `main` だけ（`custom_branch_policies` ＋ `main` の branch policy。`main` 以外の policy は消す）。承認者なし（`reviewers: []` を明示） |
  | 1 | Environment `preview` | ブランチの制限なし。オーナーの承認が必須（`inspireme`。id は `GET users/{login}`。`prevent_self_review: false`） |
  | 2 | ルールセット `main-ci` | PR 必須（承認 0）、`check`・`gitleaks` を必須（`integration_id: 15368`）、force push・削除を禁止。バイパスなし |
  | 2 | ルールセット `main-review` | CODEOWNERS の承認1件、`update`（merge はバイパスできる人だけ）。リポジトリの admin（5）と OrganizationAdmin が PR でバイパスできる |
  | 3 | Team `maps-reviewers` | なければ作る（closed。privacy が違えば直す）。実行者がメンバーなら外す。リポジトリに Write |
  | 4 | Actions | 有効・SHA 固定を必須・`allowed_actions: all`、既定の権限 read・PR を承認させない、fork からの PR は外部の人すべてで承認が必須 |
  | 5 | セキュリティ | Secret scanning・push protection・脆弱性の非公開の報告・Dependabot alerts |

- Secrets はスクリプトで扱わない。オーナーが `gh secret set`（値は画面で入力）で登録した。Environment は Secrets より先に、オーナーが `gh api -X PUT …/environments/<名前>` で作った（その後スクリプトが設定を足した）。

### 2. Cloudflare（オーナーの手作業）

1. **Token（U5 → D45）**：`Account / Workers Scripts: Edit` だけ・このアカウントだけ・期限 2027-11-17 で作った。オーナーの端末で、捨てる Worker 名（`maps-token-check`）に `wrangler deploy` → `wrangler versions upload` → `wrangler delete` が通った（Token は `read -s` で入力するスクリプトをスクラッチパッドに用意した）。
2. **Secrets の登録**：`CLOUDFLARE_API_TOKEN` を `preview`・`production` に（同じ Token）、`CLOUDFLARE_ACCOUNT_ID` をリポジトリに。
3. **Zero Trust・Access（U7）**：オーナーの判断で T0-06 に移した。11.4 (5) に公式ドキュメントの手順を書いた。

### 3. ドキュメント

- 開発概要書：11.1・11.2（Secrets の置き場所・登録の方法・preview の承認と承認前に確かめる範囲）・11.3（U5）・11.4 (5)（Access の手順。U7 は T0-06）・11.5（ルールセット・スクリプト・merge はオーナーだけ・反映の順番）・12.1（D30 の理由）・13（Token の更新・GitHub の設定）・14 R5・16（U5・U14 を決定、U7 は T0-06、U15）・D30・D44・D45・変更履歴 0.17。
- 開発計画：U5・U14 を決定、U7 を T0-06 に、U15・プライバシーポリシーの問い合わせ先の行。
- タスクの定義：T0-05（種別・参照仕様・完了条件・テスト条件・文書だけの PR の確かめ）、T0-06（Access の作業、preview の承認、Token は wrangler のステップの `env` だけ、preview job はキャッシュを復元しない、fork からの PR では preview を飛ばす）。
- `.github/CODEOWNERS`（`/content/prefectures/` に狭めた）・`.github/workflows/e2e.yml` のコメント。`AGENTS.md` のコマンドと `scripts/` の説明。

## テスト（実際のテスト名）

`tests/unit/scripts/github-settings.test.ts`：

- 11.5 必須のチェックの名前が .github/workflows/ci.yml の job にある
- 11.5 必須のチェックの job に name: がない（チェックの名前が job の id のまま）
- 11.5 .github/CODEOWNERS の Team が、設定の Team と同じ
- 11.5 秘密の値（Token・メールアドレス）を含まない

`tests/unit/scripts/github-setup.test.ts`（主なもの。ほかに `isSubset` の単体と、保護が弱くなった10通り〔バイパスの追加・`always`・`integration_id`・チェックの追加・`deletion`／`non_fast_forward`／`update` の欠け・承認 0・`evaluate`〕で PUT になること）：

- 11.5 確かめるだけのとき（--apply なし）は write を呼ばず、変える予定を表示して件数を出す
- 11.5 設定のとおりに済んでいるときは、書き込みの予定がなく「変更なし」と出る（応答に余分な項目があっても）
- 11.5 今のルールセットが実物の形（OrganizationAdmin の actor_id が null など）で、並び順だけが違うときは書き込まない
- 11.5 main-ci はバイパスなしで、check・gitleaks を GitHub Actions のチェックとして必須にする
- 11.5 main-review は CODEOWNERS の承認を必須にし、dismiss stale・last push approval を無効にし、admin・組織のオーナーだけが PR でバイパスできる
- 11.5 設定にないルールセットは触らず、名前と enforcement を警告として出す
- 11.5 production は main だけを許可し、すでに main のポリシーがあれば足さない／main 以外の許可があれば消す
- 11.5 preview は承認制：承認者がいなければ PUT の予定。users/{login} の id を使う
- 11.5 Team がなければ作り、実行者をメンバーから外し、Write を付ける／すでにあって実行者がメンバーなら外す
- 11.5 Actions の有効・SHA 固定・権限・fork の PR の承認を設定する
- 11.5 vulnerability-alerts は、204（本文なし）なら有効として書き込まず、404 なら有効にする
- 11.5 Environment（preview の承認）→ ルールセット → Team → Actions → セキュリティの順に書き込む
- 11.5 API の誤り（403 など）はメッセージを出して終了コード 1。admin:org が足りないときは gh auth refresh の案内を出す
- 11.5 本文は標準入力で渡し、シェルを通さない引数で gh api を呼ぶ

## 完了条件の確かめ方（結果）

| 完了条件 | 確かめ方 | 結果 |
|---|---|---|
| 11.2 の Secrets が、決めた Environment に登録されている | `gh secret list --env preview`・`--env production`・`gh secret list` | 3つとも登録済み |
| U5・U14 が決定、11.3・11.4 (5) の「要検証」「要確認」が消えている | `grep -n "要検証\|要確認" docs/development-overview.md` | 11.3・11.4 (5) にない（11.1 の Web Analytics は対象外） |
| `--apply` の後の `pnpm github:setup` で書き込みの予定がない | 実行 | 「変更なし」 |
| オーナーがバイパスで merge できる | `gh api …/rulesets/<main-review> --jq .current_user_can_bypass` | `pull_requests_only`。この PR の merge で実際に確かめる |
| 文書だけの PR で `check` が lint だけ | — | この PR はスクリプトを含むので、次の文書だけの PR で確かめる |

## 判断したこと

| # | 項目 | 判断 | 理由 |
|---|---|---|---|
| 1 | スクリプトの形 | TypeScript とテスト。既定は確かめるだけ、`--apply` で反映 | `check-links.ts` と同じ形で、カバレッジの基準で確かめられる。間違えて変えない |
| 2 | ブランチ保護 | ルールセット2つ（CI はバイパスなし、承認と merge は admin が PR でバイパス） | オーナーは自分の PR を承認できない。クラシックで admin を外すと CI の失敗も無視できてしまう |
| 3 | strict（main に追いつく） | 無効 | T5-05 で県ごとの PR が並び、merge のたびに CI をやり直すことになる |
| 4 | Team のメンバー | 作るだけ。実行者（オーナー）がメンバーなら外す。レビュアーは画面で招待 | `/content/prefectures/` の依頼をオーナーに出さない。スクリプトが人を外す範囲を実行者だけにする |
| 5 | fork からの PR の workflow | 外部の人すべてで承認 | public にしたため |
| 6 | Secret scanning ほか | Secret scanning・push protection・脆弱性の非公開の報告・Dependabot alerts を有効、SHA 固定を必須 | public では無料。レビューの指摘（公開したばかり） |
| 7 | Secrets | 1つの Token を preview・production に。Account ID はリポジトリ。`gh secret set` で値を画面で入力 | Token は Worker ごとに絞れないので分けても得るものがない。値がファイル・履歴・会話に残らない |
| 8 | Token の試し方 | 捨てる Worker 名で、オーナーの端末で試す | 本番の `maps` を T0-06 の前に公開しない |
| 9 | Access | U7 ごと T0-06 に移す（オーナー） | Worker `maps` ができるのが T0-06 で、確かめるのも T0-06 |
| 10 | D30 | 変えず、分数の上限がなくなったことだけ書く | 実行時間の問題は残る。U15 でまとめて決める |
| 11 | PR の分け方 | 1つの PR | スクリプトと設定の説明を一緒に読める |
| 12 | preview の承認（セキュリティレビュー H-1） | オーナーの承認を必須（オーナー） | Write の Team が workflow・スクリプト・依存を変えたブランチで Token を取り出せるため。承認前に、run のコミットと main の差が `/content/prefectures/` だけかを確かめ、preview job はキャッシュを復元しない（T0-06） |
| 13 | merge の権限（コードレビュー） | オーナーだけ（`update` ルール。オーナー） | 9.2 ⑧ を設定で守る。レビュアーどうしの承認で本番に出ない |
| 14 | CODEOWNERS の範囲 | `/content/prefectures/` に狭める | スキーマ・lint の設定・執筆ルールは検査とルールを変えるので、オーナーの承認にする |
| 15 | 手で作られた無効のルールセット `default` | 削除（オーナー） | 効果がなく、`main-ci`・`main-review` との関係が分かりにくい |
| 16 | `dismiss_stale_reviews_on_push` を true に（セキュリティレビュー M-3） | 採用しない | タスクの定義で無効と決めてある（9.2 ⑧ の `status` のコミットで承認が外れる） |
| 17 | `allowed_actions` | `all` のまま（コメントで理由） | Secrets は Environment の job だけに渡り、preview は承認制、production は main だけ。SHA 固定は必須 |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| U7（Zero Trust・Access） | T0-05 でオーナーが設定する | T0-06 に移した。公式ドキュメントの手順だけを 11.4 (5) に書いた | オーナーが後回しにした |
| D46 | U7 の決定 | 作らない | U7 が T0-06 に移ったため |
| Environment の作成 | スクリプトが作る | オーナーが Secrets の登録の前に `gh api -X PUT` で作り、スクリプトが設定を足した | Environment がないと Secret を登録できず、Token の検証の直後に登録したかったため |
| 再実行の「変更なし」 | （計画の手順3） | 今の状態を GET して比べる実装を足した | 最初の実装は毎回 PUT の予定を出し、ルールセットの履歴も埋まる（コードレビュー HIGH） |
| preview | 承認者なし | オーナーの承認が必須 | セキュリティレビュー H-1（判断12） |
| main-review | 承認だけ | `update` ルールを足し、OrganizationAdmin のバイパスも足した | merge をオーナーだけにする（判断13）。オーナーは組織のオーナーなので、RepositoryRole だけで足りるか言い切れなかった |
| 追加の設定 | Secret scanning・push protection | ＋SHA 固定の必須、脆弱性の非公開の報告、Dependabot alerts | セキュリティレビュー L-3・L-4 |
| Team の作った人 | 作ったときだけ外す | 実行者がメンバーなら毎回外す | 途中で失敗しても残らないように（コードレビュー） |
| 反映の順番 | ルールセット → Environment → Team… | Environment → ルールセット → Team → Actions → セキュリティ | 途中で止まっても「Team は Write、preview は承認なし」を残さない |
| CODEOWNERS | `/content/` | `/content/prefectures/` | 判断14 |
| `update` ルールの parameters | `update_allows_fetch_and_merge: false` | 付けない | GitHub は既定値を応答で省くので、付けると再実行のたびに差が出た（`--apply` の後に実物で確かめた） |
