# T0-06 プレビュー・本番へのデプロイ：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-06
- ブランチ：`ci/T0-06-deploy`
- 参照仕様：開発概要書 6.1、11.2、11.4 (2)・(5)、11.5、12.1〜12.3、D30・D35・D44〜D46、R4・R5

この計画は、PR #70 で実際に作った内容に合わせて直してある。承認したときから変えた点は、末尾の「承認後に変えたこと」にある。

## 目的

PR ごとにプレビュー URL で確認でき、`main` に merge したら本番（`https://maps.vivastack-dev.workers.dev/`）に自動で出るようにする。

## 着手時に分かっていること

- Secrets：`CLOUDFLARE_API_TOKEN` は Environment `preview`・`production`、`CLOUDFLARE_ACCOUNT_ID` はリポジトリ（T0-05）。Token の権限は `Workers Scripts: Edit` だけ（D45）。
- `preview` はデプロイの前にオーナーの承認が要る。`production` は `main` だけ。
- Access は使わない（D46。この PR の最初のコミットで文書を直した）。
- wrangler 4.160.0（lockfile）。`wrangler versions upload` は、`WRANGLER_OUTPUT_FILE_PATH` を付けると、ND-JSON の行 `{"type":"version-upload", "preview_url", "preview_alias_url", "version_id", …}` を書く（`node_modules/wrangler/wrangler-dist/cli.js` の `versionsUpload` で確かめた）。
- 着手のときは「Worker `maps` はまだない」と考えていた（判断6）。実際には、この PR のプレビューを出した時点で、本番の URL はすでに本番用のビルド（`noindex` なし）を返していた。いつ作られたかは確かめていない。merge の後の `deploy.yml` が上書きする。
- `ci.yml` の `check` は最後に `pnpm build`（本番用）を行う。文書だけの PR は `steps.changes.outputs.docs_only` で重い手順を飛ばす。

## 方針（実際の内容）

### 1. `ci.yml`

- `check`：
  - `docs_only` を job の出力（`outputs.docs_only`）にする。
  - Actions のキャッシュを使わない（`package-manager-cache: false`）。この job は PR のコードを動かし、その結果（`dist-preview`）を Token を持つ `preview` が使うので、PR がキャッシュを汚して `dist-preview` を細工する経路を断つ。
  - 最後の `pnpm build`（本番用。壊れていないかを確かめる）の後に `pnpm build:preview` を足し、`dist/` を Artifact `dist-preview`（7日。`if-no-files-found: error`）に上げる（文書だけの PR では飛ばす）。承認に7日以上かかったら、Actions の画面で Re-run all jobs を実行する（11.2）。
- `preview`：
  - `needs: check`、`environment: preview`、`permissions: contents: read`（書き込みの権限なし）。
  - 動かす条件：文書だけでない、かつ同じリポジトリのブランチ（fork の PR は Secrets が渡らない）、かつ `github.actor` が `dependabot[bot]` でない。
  - **PR のコードは一切動かさない**：checkout は main の側の `pull_request.base.sha`（スクリプト・`package.json`・lockfile・`wrangler.jsonc`・wrangler の版は main のもの）。`pnpm install --frozen-lockfile --ignore-scripts`、キャッシュなし。PR から受け取るのは、`check` が作った静的ファイル（`dist-preview` を `dist/` に）だけ。
  - `pnpm exec wrangler versions upload --preview-alias "pr-${PR_NUMBER}" --message "PR #${PR_NUMBER} ${HEAD_SHA}"`。Token・Account ID は**このステップの `env` だけ**。`WRANGLER_OUTPUT_FILE_PATH` の出力を Artifact `wrangler-output`（2日）に上げる。
- `preview-comment`：
  - `needs: preview`、`permissions: contents: read`・`pull-requests: write`、Secrets なし。Token を持つ job に書き込みの権限を持たせないために分ける。
  - PR を checkout し、`wrangler-output` をダウンロードして、`node scripts/preview-url.ts`（URL を `$GITHUB_OUTPUT` に）→ `node scripts/preview-comment.ts`（`GITHUB_TOKEN`）。どちらも外の依存を使わないので、`pnpm install` はしない。
  - コメントには、別名の URL（PR の最新）・バージョンの URL（そのコミットに固定）を言語ごとに、PR の head のコミット・実際にビルドした main との merge のコミット（`MERGE_SHA`＝`github.sha`）・バージョン ID を書く。印（`<!-- preview-url -->`）のある `github-actions[bot]` のコメントがあれば書き換える。

### 2. `deploy.yml`

- `on: push`（`main`）。`concurrency: deploy-production`（`cancel-in-progress: false`）。`permissions: contents: read`。
- `build` job（Environment なし・Token なし）：checkout → pnpm・Node（キャッシュなし）→ `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm content:validate` → `pnpm build`（`reviewed` だけ）→ Artifact `dist-production`（1日）。
- `deploy` job（`environment: production`）：checkout（main のコミット）→ pnpm・Node（キャッシュなし）→ `pnpm install --frozen-lockfile --ignore-scripts` → `dist-production` を `dist/` に → `pnpm exec wrangler deploy`（Token はこのステップの `env` だけ）。依存のコードが動く手順（test など）と Token を、別の VM にする。
- E2E・Lighthouse は入れない（判断4・5）。

### 3. スクリプト

- `scripts/gh-runner.ts`：`gh` を `execFile` で呼ぶ `runGh`（`scripts/setup-github.ts` から取り出した。`preview-comment.ts` と共有）。
- `scripts/lib/preview-url.ts`：
  - `parsePreviewUrls(ndjson)`：`version-upload` の行を探し、`{ previewUrl, aliasUrl, versionId }` を返す。ほかの種類の行・壊れた行は飛ばす。行がない・URL がないときはエラー。
  - `normalizePreviewUrl`：`https` だけ、ホストは `^[a-z0-9][a-z0-9-]*-maps\.vivastack-dev\.workers\.dev$`、ポート・認証情報・パス・クエリ・ハッシュがあればエラー。Worker 名（`maps`）とサブドメインは定数で、`wrangler.jsonc` の `name` と一致することをテストで確かめる。
  - `normalizeVersionId`：UUID の形だけを通す。
  - `previewPageUrls(baseUrl)`：`/ja/`・`/en/`・`/zh/`。`previewAliasUrl(prNumber)`：`https://pr-<番号>-maps.vivastack-dev.workers.dev`。
  - `runPreviewUrl`：CLI の本体（ファイルを読み、`alias_url=`・`preview_url=`・`version_id=` を出す）。
- `scripts/preview-url.ts`（CLI）。
- `scripts/lib/preview-comment.ts`：
  - `COMMENT_MARKER`、`buildPreviewComment({ aliasUrl, previewUrl, versionId, sha, mergeSha })`。
  - `runPreviewComment`：環境変数を確かめる（`PR_NUMBER` は正の整数、`HEAD_SHA`・`MERGE_SHA` は40桁の16進数、`ALIAS_URL` は `previewAliasUrl(PR_NUMBER)` と一致、`PREVIEW_URL`・`VERSION_ID` は上の形）。`GET issues/{n}/comments`（100件ずつ、最大50ページ）で印のある `github-actions[bot]` のコメントを探し、あれば `PATCH`、なければ `POST`。
- `scripts/preview-comment.ts`（CLI。環境変数：`GH_TOKEN`・`PR_NUMBER`・`ALIAS_URL`・`PREVIEW_URL`・`VERSION_ID`・`HEAD_SHA`・`MERGE_SHA`・`GITHUB_REPOSITORY`）。

### 4. ドキュメント

- 開発概要書：11.2（Secrets、`preview` の承認の前に確かめること〔`.github/` の変更がないこと・公開してよい内容か〕、7日を超えたら Re-run、`wrangler.jsonc` は main のもの、残るリスク）、11.5（merge はオーナーだけ、GitHub のアプリにバイパスの merge のボタンがない）、12.1〜12.3（デプロイの構成、URL の形式と取り出し方）、13（Token の更新）、R4・R5、D46、変更履歴 0.18。
- `content/guidelines/review-checklist.md`：プレビューはログインなしで開ける・オーナーの承認が要る・URL の形式（`https://pr-<PR番号>-maps.vivastack-dev.workers.dev/ja/` と、コミットに固定した URL）。
- `AGENTS.md`：プレビューと本番のデプロイ、承認。
- `docs/tasks/m0-setup.md`・`docs/development-plan.md`：Access を外す、`preview` の承認の実装、fork・Dependabot を飛ばす。

## 先に書いたテスト

`tests/unit/scripts/preview-url.test.ts`（テスト名に「12.3」）：

- version-upload の行から、プレビュー URL・別名の URL・バージョン ID を取り出す（ほかの種類の行・壊れた行は飛ばす）
- version-upload の行がない・URL がないときはエラー
- https でない・別のホスト・ポート・認証情報・パス・クエリ・ハッシュつきの URL はエラー。バージョン ID が UUID でなければエラー
- 言語ごとのページの URL、PR 番号から別名の URL
- Worker 名が `wrangler.jsonc` の `name` と一致する
- CLI は `$GITHUB_OUTPUT` の形で出し、引数がない・ファイルが読めないときは終了コード 1

`tests/unit/scripts/preview-comment.test.ts`：

- コメントは印・言語ごとのリンク・コミット・merge のコミット・バージョン ID を含む
- 印のある `github-actions[bot]` のコメントがあれば PATCH、なければ POST（ほかの人の印つきコメントは触らない。2ページ目も探す）。一覧が配列でない・`gh api` が失敗したときは終了コード 1
- 環境変数が足りない・PR 番号が正の整数でない・SHA が40桁の16進数でない・別名の URL が PR 番号と合わないときは終了コード 1

フィクスチャ：`tests/fixtures/wrangler/version-upload.ndjson`。最初は wrangler の `versionsUpload` の形で作り、この PR の CI（run 44008941432）の Artifact `wrangler-output` の実物に差し替えた。実物は `wrangler-session` の行と `version-upload` の行の2行で、作ったものと同じ形だった。

`deploy.yml`・`ci.yml` の手順そのものは単体テストがない。この PR の実行（プレビュー）と merge 後の実行（本番）で確かめる。E2E（`noindex` の有無）は T3-02 の `tests/e2e-preview/preview.spec.ts`・`tests/e2e/pending.spec.ts` がある。

## 作った・変えたファイル（順番）

1. テスト2つとフィクスチャ（Red）→ `scripts/gh-runner.ts`・`scripts/lib/preview-url.ts`・`scripts/preview-url.ts`・`scripts/lib/preview-comment.ts`・`scripts/preview-comment.ts`（Green）
2. `.github/workflows/ci.yml`（`check` の出力・キャッシュなし・`build:preview`・Artifact、`preview`・`preview-comment`）
3. `.github/workflows/deploy.yml`（`build`・`deploy` の2つの job）
4. ドキュメント
5. レビュー → push → オーナーが `preview` を承認 → プレビュー URL を確かめる → フィクスチャを実物に差し替える
6. merge → `deploy.yml` の実行 → 本番を確かめる

## 完了条件の確かめ方

| 完了条件 | 確かめ方 | 結果 |
|---|---|---|
| この PR のプレビュー URL で3言語の空のページが出る（承認の後。認証なし） | PR のコメントの URL を `curl` で開く | 承認の後、`preview`・`preview-comment` が成功。`https://pr-70-maps.vivastack-dev.workers.dev/ja/`・`/en/`・`/zh/` とコミットに固定した URL が 200、`/` は 301 → `/ja/`。`<meta name="robots" content="noindex"/>` と `x-robots-tag: noindex` がある |
| merge 後、本番の `/ja/` に空のページ、`/` が `/ja/` にリダイレクト | `curl -sI https://maps.vivastack-dev.workers.dev/`（301 → `/ja/`）・`/ja/`（200、`noindex` がない） | merge の後に確かめる |
| プレビューURLの取り出しの単体テスト | `pnpm vitest run tests/unit/scripts/preview-url.test.ts` | 実物のフィクスチャで通る |
| `build:preview` に `noindex`、`build` にない（E2E） | `pnpm test:e2e:preview` と `pnpm test:e2e`（手元。T3-02 のテスト） | 通る |
| 共通 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、レビューで CRITICAL・HIGH なし | 通る。レビューの指摘は直した |

## 判断が必要な点（採用した内容）

| # | 項目 | 採用 | 理由 |
|---|---|---|---|
| 1 | wrangler の呼び方 | `wrangler-action` を使わず、`pnpm install`（キャッシュなし・`--ignore-scripts`）＋ `pnpm exec wrangler` | lockfile の版（4.160.0）を手元と同じにできる。Token を渡す外部の Action が1つ減る |
| 2 | URL の取り出し方 | `WRANGLER_OUTPUT_FILE_PATH` の ND-JSON（機械向けの出力） | 標準出力の文言は表示用で変わりやすい。出力ファイルは版つきの形（`version: 1`） |
| 3 | コメントの job を分ける | `preview`（Token・読み取りだけ）と `preview-comment`（書き込み・Secrets なし） | Token を持つ job に PR への書き込みの権限を持たせない |
| 4 | `deploy.yml` の E2E | 入れない | D30（開発中は手動）。merge の前に `e2e.yml` で確かめる |
| 5 | `deploy.yml` の Lighthouse | 入れない | `ci.yml` が上限のコンテンツで最悪の場合を測っている。公開（T6）の前に決め直す |
| 6 | Worker `maps` がまだないこと | まずこの PR のプレビューで試し、だめなら merge して本番を作ってから再実行する | 実際には不要だった。プレビューはそのまま成功した（「着手時に分かっていること」） |
| 7 | PR の `check` のビルド | `pnpm build`（本番用）のあとに `pnpm build:preview` も行う | 本番用のビルドが壊れていないことを、merge の前に確かめ続ける |
| 8 | キャッシュ | どの job でも使わない（`check`・`preview`・`preview-comment`・`deploy.yml`） | 11.2。`check` の結果を Token の job が使うので、`check` も含める |
| 9 | Dependabot・fork の PR | `preview` を飛ばす | Environment の Secrets が渡らず、必ず失敗する |
| 10 | `deploy.yml` の前の検査 | `typecheck`・`test`・`content:validate`・`build` を行い、`lint` は入れない | `strict` を無効にした（D44）ので、別々に通った PR の組み合わせで壊れることがある |
| 11 | `preview` の承認のしかた | ブラウザ版の「Review deployments」。外にいるときは、頼まれれば `gh api …/pending_deployments` で承認する | この PR では、オーナーの依頼で `gh api` で承認した |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| `preview` の checkout | PR のコミット | main の側の `pull_request.base.sha` | レビューの指摘：Token を持つ job で PR のスクリプト・`package.json`・`wrangler.jsonc` を使わない。main にまだ `scripts/preview-url.ts` がなくても動く（URL の取り出しを `preview-comment` に移した） |
| URL の取り出し | `preview` job の中で `node scripts/preview-url.ts` | `preview` は出力ファイルを Artifact `wrangler-output` に上げ、`preview-comment` が取り出す | 上と同じ（`preview` で PR のコードを動かさない） |
| `check` のキャッシュ | `cache: pnpm` のまま | 使わない（`package-manager-cache: false`） | レビューの指摘：`check` の結果（`dist-preview`）を Token の job が使うので、キャッシュの汚染がそこに届く |
| `dist-preview` の保存期間 | 1日 | 7日（7日を超えたら Re-run all jobs） | 承認を待つ間に Artifact が消えないように |
| `pnpm install` | `--frozen-lockfile` | Token の job は `--ignore-scripts` も付ける | Token を持つ job で、依存のインストールスクリプトを動かさない |
| `deploy.yml` の構成 | 1つの job（`environment: production`） | `build`（Token なし）と `deploy`（Token あり）の2つ | レビューの指摘：test など依存のコードが動く手順と Token を、別の VM にする |
| URL の検査 | `https://` で `.workers.dev` | ホストを `-maps.vivastack-dev.workers.dev` の形に限り、ポート・パスなども拒む。`ALIAS_URL` は PR 番号から作った URL と一致すること | レビューの指摘：別の Worker・別のサイトの URL をコメントに書かせない |
| コメントの内容 | コミット | PR の head のコミットと、実際にビルドした merge のコミット（`MERGE_SHA`） | `pull_request` の run は main と merge した結果をビルドするので、両方を書く |
| コメントの探し方 | 印のあるコメント | 印のある `github-actions[bot]` のコメントだけ（100件ずつ、最大50ページ） | ほかの人が印を書いたコメントを書き換えない。ページ送りに上限を付ける |
| `gh` の呼び出し | T0-05 の `createGhApi` | `runGh` を `scripts/gh-runner.ts` に取り出して共有 | `preview-comment.ts` と `setup-github.ts` で同じ呼び方を使うため |
| 承認の前に確かめること | run のコミットと main の差が `/content/prefectures/` だけか | `.github/` の変更がないこと・公開してよい内容か（11.2） | Token の job は PR のコードを動かさなくなったので、危ないのは workflow の変更だけになった。コンテンツ以外の PR も承認できるようにする |
| Worker `maps` | まだない（判断6） | 本番の URL はすでに本番用のビルドを返していた。プレビューはそのまま成功した | 判断6の代わりの手順は要らなかった |
