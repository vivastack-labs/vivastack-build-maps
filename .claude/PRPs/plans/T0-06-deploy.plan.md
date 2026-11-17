# T0-06 プレビュー・本番へのデプロイ：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-06
- ブランチ：`ci/T0-06-deploy`
- 参照仕様：開発概要書 6.1、11.2、11.4 (2)・(5)、11.5、12.1〜12.3、D30・D35・D44〜D46、R4・R5

## 目的

PR ごとにプレビュー URL で確認でき、`main` に merge したら本番（`https://maps.vivastack-dev.workers.dev/`）に自動で出るようにする。

## 着手時に分かっていること

- Secrets：`CLOUDFLARE_API_TOKEN` は Environment `preview`・`production`、`CLOUDFLARE_ACCOUNT_ID` はリポジトリ（T0-05）。Token の権限は `Workers Scripts: Edit` だけ（D45）。
- `preview` はデプロイの前にオーナーの承認が要る。承認の前に、run のコミットと `main` の差が `/content/prefectures/` だけかを確かめる。Token を使う job では Actions のキャッシュを復元しない（11.2。T0-05 のレビュー）。`production` は `main` だけ。
- Access は使わない（D46。この PR の最初のコミットで文書を直した）。
- wrangler 4.160.0（lockfile）。`wrangler versions upload` は、`WRANGLER_OUTPUT_FILE_PATH` を付けると、ND-JSON の1行 `{"type":"version-upload", "preview_url", "preview_alias_url", "version_id", …}` を書く（`node_modules/wrangler/wrangler-dist/cli.js` の `versionsUpload` で確かめた）。標準出力にも `Version Preview URL:`・`Version Preview Alias URL:` が出る。プレビュー URL は `https://<バージョンIDの先頭8文字><preview_url_suffix>`、別名は `https://pr-N<preview_url_suffix>`（`-maps.vivastack-dev.workers.dev` になる見込み）。
- Worker `maps` はまだない。`versions upload` が、まだない Worker で通るか（プレビューが有効になるか）は分からない（判断6）。
- `ci.yml` の `check` は最後に `pnpm build`（本番用）を行う。`setup-node` は `cache: pnpm`。文書だけの PR は `steps.changes.outputs.docs_only` で重い手順を飛ばす。

## 方針

### 1. `ci.yml`

- `check`：
  - `docs_only` を job の出力（`outputs.docs_only`）にする。
  - 最後の `pnpm build`（本番用。壊れていないかを確かめる）の後に `pnpm build:preview` を足し、`dist/` を Artifact `dist-preview`（1日）に上げる（文書だけの PR では飛ばす）。
- `preview`（新しい job）：
  - `needs: check`、`environment: preview`、`permissions: contents: read`（書き込みの権限なし）。
  - 動かす条件：文書だけでない、かつ同じリポジトリのブランチ（fork の PR は Secrets が渡らない）、かつ Dependabot でない（Dependabot の PR には Environment の Secrets が渡らない）。
  - 手順：checkout（`persist-credentials: false`）→ pnpm・Node（**キャッシュなし**）→ `pnpm install --frozen-lockfile` → `dist-preview` を `dist/` にダウンロード → `pnpm exec wrangler versions upload --preview-alias pr-<番号>`（Token・Account ID は**このステップの `env` だけ**、`WRANGLER_OUTPUT_FILE_PATH` を付ける）→ 出力ファイルから URL を取り出して job の出力にする（`node scripts/preview-url.ts`）。
- `preview-comment`（新しい job）：
  - `needs: preview`、`permissions: pull-requests: write`、Secrets なし。Token を持つ job に書き込みの権限を持たせないために分ける。
  - PR に、プレビュー URL（ja・en・zh）・バージョン ID・コミットを書いたコメントを付ける。印（`<!-- preview-url -->`）のあるコメントがあれば、それを書き換える（`node scripts/preview-comment.ts`、`gh api`、`GITHUB_TOKEN`）。

### 2. `deploy.yml`（新しい workflow）

- `on: push`（`main`）。`concurrency: deploy-production`（`cancel-in-progress: false`）。`environment: production`。`permissions: contents: read`。
- 手順：checkout → pnpm・Node（キャッシュなし）→ `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm content:validate` → `pnpm build`（`reviewed` だけ）→ `pnpm exec wrangler deploy`（Token はこのステップの `env` だけ）。
- E2E・Lighthouse は入れない（判断4・5）。

### 3. スクリプト

- `scripts/lib/preview-url.ts`：
  - `parsePreviewUrls(ndjson)`：wrangler の出力ファイル（ND-JSON）から `version-upload` の行を探し、`{ previewUrl, aliasUrl, versionId }` を返す。行がない・URL がない・`https://` でない・`.workers.dev` でないときはエラー。
  - `previewPageUrls(baseUrl)`：`/ja/`・`/en/`・`/zh/` の URL（`src/i18n/lang.ts` の言語の一覧から作る）。
- `scripts/preview-url.ts`（CLI）：出力ファイルを読み、`alias_url=…`・`preview_url=…`・`version_id=…` を `$GITHUB_OUTPUT` の形で標準出力に出す。
- `scripts/lib/preview-comment.ts`：
  - `buildPreviewComment({ aliasUrl, previewUrl, versionId, sha })`：印つきの Markdown（言語ごとのリンク、「下書き」の印・`noindex` の説明、別名の URL は最新のコミット、バージョンの URL はそのコミットに固定）。
  - `runPreviewComment(args, deps)`：`GET issues/{n}/comments`（ページ送り）で印のあるコメントを探し、あれば `PATCH issues/comments/{id}`、なければ `POST issues/{n}/comments`。`gh api` の呼び出しは T0-05 の `createGhApi` を使う。
- `scripts/preview-comment.ts`（CLI）：環境変数（`PR_NUMBER`・`ALIAS_URL`・`PREVIEW_URL`・`VERSION_ID`・`HEAD_SHA`・`GITHUB_REPOSITORY`）を確かめてから、`runPreviewComment` を呼ぶ。

### 4. ドキュメント

- 開発概要書 12.1（`deploy.yml`）・12.2（図。E2E・lhci を `deploy.yml` に入れない）・12.3（`preview`・`preview-comment` job、URL の形式と取り出し方、キャッシュなし、Dependabot・fork を飛ばす、承認）・13（切り戻し）、M0 の行の「Access」、変更履歴。
- `content/guidelines/review-checklist.md`：プレビュー URL の形式を確定（「見込み」「T0-06 で確定」を消す）。
- `AGENTS.md`：「デプロイはまだない」を直す（プレビューと本番のデプロイ、承認）。コマンドの説明は T0-07 でまとめる。
- `docs/tasks/m0-setup.md`：T0-06 に分かったこと（Worker の初回など）を書き足す。

## 先に書くテスト

`tests/unit/scripts/preview-url.test.ts`（テスト名に「12.3」）：

- 12.3 wrangler の出力ファイルの version-upload の行から、プレビュー URL・別名の URL・バージョン ID を取り出す（ほかの種類の行は飛ばす）
- 12.3 version-upload の行がない・URL がないときはエラーにする（プレビューが無効のときなど）
- 12.3 https でない・workers.dev でない URL はエラーにする
- 12.3 言語ごとのページの URL（/ja/・/en/・/zh/）を作る
- 12.3 CLI は $GITHUB_OUTPUT の形で出し、ファイルがない・読めないときは終了コード 1

`tests/unit/scripts/preview-comment.test.ts`：

- 12.3 コメントは印・言語ごとのリンク・コミット・バージョン ID を含む
- 12.3 印のあるコメントがあれば PATCH、なければ POST（ほかのコメントは触らない。2ページ目も探す）
- 12.3 環境変数が足りない・PR 番号が数でない・URL が https でないときは終了コード 1

フィクスチャ：`tests/fixtures/wrangler/version-upload.ndjson`。最初は wrangler の `versionsUpload` の形で作り、この PR の CI で実際に出た出力ファイル（Artifact かログ）に差し替える。

`deploy.yml`・`ci.yml` の手順そのものは単体テストがない。この PR の実行（プレビュー）と merge 後の実行（本番）で確かめる。E2E（`noindex` の有無）は T3-02 の `tests/e2e-preview/preview.spec.ts`・`tests/e2e/pending.spec.ts` がある。

## 作る・変えるファイル（順番）

1. テスト2つとフィクスチャ（Red）→ `scripts/lib/preview-url.ts`・`scripts/preview-url.ts`・`scripts/lib/preview-comment.ts`・`scripts/preview-comment.ts`（Green）
2. `.github/workflows/ci.yml`（`check` の出力と `build:preview`・Artifact、`preview`・`preview-comment`）
3. `.github/workflows/deploy.yml`
4. ドキュメント
5. レビュー → push → オーナーが `preview` を承認 → プレビュー URL を確かめる → フィクスチャを実物に差し替える
6. merge → `deploy.yml` の実行 → 本番を確かめる

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| この PR のプレビュー URL で3言語の空のページが出る（承認の後。認証なし） | PR のコメントの URL を開く（`curl -sI` で 200、`<meta name="robots" content="noindex">` がある） |
| merge 後、本番の `/ja/` に空のページ、`/` が `/ja/` にリダイレクト | `curl -sI https://maps.vivastack-dev.workers.dev/`（301 → `/ja/`）・`/ja/`（200、`noindex` がない） |
| プレビューURLの取り出しの単体テスト | `pnpm vitest run tests/unit/scripts/preview-url.test.ts` |
| `build:preview` に `noindex`、`build` にない（E2E） | `pnpm test:e2e:preview` と `pnpm test:e2e`（手元。T3-02 のテスト） |
| 共通 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、レビューで CRITICAL・HIGH なし |

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | wrangler の呼び方 | `wrangler-action` を使わず、`pnpm install`（キャッシュなし）＋ `pnpm exec wrangler` | lockfile の版（4.160.0）を手元と同じにできる。Token を渡す外部の Action が1つ減る。`wrangler-action` は wrangler がないと自分で入れようとして、動きが読みにくい |
| 2 | URL の取り出し方 | `WRANGLER_OUTPUT_FILE_PATH` の ND-JSON（機械向けの出力） | 標準出力の文言（`Version Preview URL:`）は表示用で変わりやすい。出力ファイルは版つきの形（`version: 1`） |
| 3 | コメントの job を分ける | `preview`（Token・読み取りだけ）と `preview-comment`（書き込み・Secrets なし）に分ける | Token を持つ job に PR への書き込みの権限を持たせない（最小の権限） |
| 4 | `deploy.yml` の E2E | 入れない | D30（開発中は手動）。merge の前に `e2e.yml` で確かめる。本番は `main` からだけ |
| 5 | `deploy.yml` の Lighthouse | 入れない | `ci.yml` が上限のコンテンツで最悪の場合を測っている。本物のコンテンツは今「準備中」で、測っても意味が小さい。公開（T6）の前に決め直す |
| 6 | Worker `maps` がまだないこと | まずこの PR のプレビューで試す。まだない Worker で失敗するか URL が出なければ、merge して `deploy.yml` で本番を作り、この PR の `preview` job を Actions の画面で再実行して確かめる | オーナーは外から操作しているので、手元の `wrangler login`・`wrangler deploy` を使わずに済む。本番に出るのは今の main と同じ「準備中」のページで、T0-06 の完了条件どおり |
| 7 | PR の `check` のビルド | `pnpm build`（本番用）のあとに `pnpm build:preview` も行う（約1〜2分増える） | 本番用のビルドが壊れていないことを、merge の前に確かめ続ける。プレビューだけにすると、本番のビルドの失敗に merge の後で気づく |
| 8 | Token を使う job のキャッシュ | 使わない（`preview`・`deploy.yml` とも） | 11.2（承認の要らない `ci.yml` の run が保存したキャッシュを、Token が使える job で動かさない）。`main` の run は PR のキャッシュを読めないが、決まりを1つにして分かりやすくする |
| 9 | Dependabot の PR | `preview` を飛ばす | Dependabot の PR の workflow には Environment の Secrets が渡らず、必ず失敗する |
| 10 | `deploy.yml` の前の検査 | `typecheck`・`test`・`content:validate`・`build` を行い、`lint` は入れない | `strict` を無効にした（D44）ので、別々に通った PR の組み合わせで壊れることがある。本番に出す前に動きを確かめる。整形は本番の動きに関係しない |
| 11 | `preview` の承認のしかた | ブラウザ版の「Review deployments」。外にいるときは、頼まれれば私が `gh api …/pending_deployments` で承認する | GitHub のアプリで承認できるかは確かめていない。承認者はオーナーなので、オーナーの `gh` の Token で承認できる |
