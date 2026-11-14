# M0 準備：タスクの定義

項目の意味と進め方は [development-plan.md](../development-plan.md) の第1章、進み具合は第3章にある。参照仕様の章番号は [開発概要書](../development-overview.md) のもの。

マイルストーンの完了条件：空のページ（3言語）がプレビューと本番にデプロイできる。

---

## T0-01 Next.jsの雛形と、単体テスト・検査の実行環境

- **種別**：chore
- **依存関係**：なし
- **目的**：以降のすべてのタスクの土台として、設計どおりの設定（静的出力、`basePath`、3言語のルート）のアプリを用意する。単体テストと検査（lint・整形・型・カバレッジ）もここで動くようにして、最初のコードからTDDで書き、品質ガードを通るようにする。
- **参照仕様**：6.2、6.5、5.3、10.2、11.6、F-I18N-01、D26、D28

### 実装内容

- `.nvmrc`（その時点の Node.js Active LTS）。`package.json` の `packageManager` で pnpm の版を固定する。`browserslist` を 5.3 のとおりに書く。
- Next.js（App Router）。`next.config.ts` に `output: 'export'`、`basePath: '/maps'`、`trailingSlash: true`。
- TypeScript（strict）。
- `app/[lang]/layout.tsx`：ルートレイアウト。`<html lang>` に `ja` / `en` / `zh-Hans` を出す。`generateStaticParams` で ja・en・zh を生成し、`dynamicParams = false` にする。`generateStaticParams` の中身は `src/i18n/lang.ts` の関数を呼ぶだけにする（単体テストとカバレッジの対象にするため）。
- `app/[lang]/page.tsx`：仮のページ（サイト名の見出しだけ）。
- `src/i18n/lang.ts`：`Lang` 型、`LANGS`、`isLang()`（型ガード）、`htmlLang()`（`zh` → `zh-Hans`）、`langStaticParams()`（`generateStaticParams` の戻り値）。
- Tailwind CSS v4（`@tailwindcss/postcss`）。`app/globals.css` に `@import "tailwindcss";` と空の `@theme`。`tailwind.config.*` は作らない。
- ESLint（Next.js と TypeScript の推奨設定）、Prettier（既存の `.prettierrc` を使い、変えない）、`eslint-config-prettier`。
- ESLint に、`.claude/rules/coding-style.md` のうち機械的に確かめられる規約を入れる：`max-lines`（800）、`max-lines-per-function`（50。テストのファイルは対象外）、`max-depth`（4）、`no-console`、`no-param-reassign`、`prefer-const`。
- `package.json` のスクリプト：
  - `lint`：ESLint、Prettier のチェック、markdownlint、yamllint（ルートの `.yamllint` と `content/.yamllint` の2つ）
  - `typecheck`：`tsc --noEmit`
  - `test`：Vitest。カバレッジ（v8）の対象は `src/**`。基準は全体80%、`src/lib/**`・`src/features/**` は90%。下回ったら失敗する。`app/` はE2E（T0-02）で確かめるので対象外
- テストの置き場所：`tests/unit/`（6.5）。

### 完了条件

- `pnpm build` が成功し、3言語の `index.html` が出力される。
- `pnpm dev` で `http://localhost:3000/maps/ja/` が表示される。
- `pnpm lint`・`pnpm typecheck`・`pnpm test` が通る。
- カバレッジが基準を下回ると `pnpm test` が失敗することを確かめた。

### テスト条件

- 単体（`src/i18n/lang.ts`）：
  - `isLang()` は `ja`・`en`・`zh` で `true`、`fr`・空文字・`JA`・`zh-Hans` で `false` を返す（F-I18N-01）。
  - `htmlLang()` は `ja` → `ja`、`en` → `en`、`zh` → `zh-Hans` を返す（6.2 D27）。
  - `langStaticParams()` は `[{ lang: 'ja' }, { lang: 'en' }, { lang: 'zh' }]` を返す（F-I18N-01）。

---

## T0-02 コンポーネント・E2Eテストの道具

- **種別**：chore
- **依存関係**：T0-01
- **目的**：コンポーネントテストとE2Eテストを、それぞれ1つのコマンドで実行できるようにする。以降のタスクの完了条件を機械的に確かめられるようにする。
- **参照仕様**：10.2、5.3、AGENTS.md の「コマンド」

### 実装内容

- Testing Library（React）と jsdom を Vitest に設定する。
- `package.json` のスクリプト `test:e2e`：Playwright。
- Playwright：プロジェクトは Chromium・Firefox・WebKit（PC）、スマホ（iPhone・Pixel の端末設定）、タブレット（iPad の縦・横）。この時点のサーバーは `next dev`（T0-03 で `wrangler dev` に切り替える）。
- テストの置き場所：`tests/e2e/`（6.5）。

### 完了条件

- `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm test:e2e` がすべて通る。

### テスト条件

- E2E（全プロジェクト）：`/maps/ja/`・`/maps/en/`・`/maps/zh/` が表示され、`<html lang>` がそれぞれ `ja`・`en`・`zh-Hans` である（F-I18N-01、6.2 D27）。

---

## T0-03 `dist/` の組み立てとローカルの Workers 確認

- **種別**：chore
- **依存関係**：T0-02
- **目的**：本番の Cloudflare Workers と同じ動き（パス、リダイレクト、ヘッダー）を手元で確かめられるようにする。`basePath` を付けたときの出力の構成（U8）の不確かさをなくす。
- **参照仕様**：6.4、11.4 (2)〜(4)、F-I18N-02、U8、R7

### 実装内容

- `basePath` を付けたときの `out/` の構成を確かめ、結果を開発概要書 6.4 に書く（U8 を決定にする）。
- `scripts/postbuild.ts`：`out/` の構成にかかわらず、`dist/maps/` に組み立てる（開発計画 5章 U8 の推奨案）。`_redirects`・`_headers` を `dist/` の直下に置く。
- `_redirects`（11.4 (3)）と `_headers`（11.4 (4)。CSPは T4-01 で加える）。
- `pnpm build` を「`next build` → `postbuild`」にする。
- `wrangler.jsonc`（11.4 (2)）。wrangler v4 を devDependency に入れる。
- 404 のページにも `<html lang>` を付ける。ルートレイアウトが `app/[lang]/layout.tsx` なので、存在しないパスの404は `<html lang>` のないページになる（T0-01 で確認）。`app/global-not-found.tsx`（`experimental.globalNotFound`）を使い、言語が分からないので、`/maps` のリダイレクト先（F-I18N-02）と同じ `ja` にする。
- Playwright のサーバーを、`dist/` を配信する `wrangler dev` に切り替える。
  - T0-02 では、Next.js 16 が同じディレクトリで `next dev` を2つ起動できないため、E2E のサーバーを `pnpm dev` と同じ 3000 番にし、`reuseExistingServer` で手元の dev サーバーを使っている。`wrangler dev` にしたら、`pnpm dev` とぶつからない別の番号にし、手元の dev サーバーを使わないようにする（E2E は `dist/` を確かめるため）。

### 完了条件

- `pnpm build` で、`dist/` が 6.4 の構成になる。
- `pnpm exec wrangler dev` で `/maps/ja/` が表示される。
- 開発概要書の U8 を決定にし、6.4 の「要検証」を消した。

### テスト条件

- 単体（`scripts/postbuild.ts`）：`out/` のファイルの一覧から、`dist/` での置き場所を正しく計算する（`_redirects`・`_headers` は直下、ほかは `maps/` の下）。
- E2E（`wrangler dev`）：
  - `/maps` と `/maps/` が 301 で `/maps/ja/` にリダイレクトされる（F-I18N-02）。
  - `/maps/ja/` のレスポンスに `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy` が付く（5.5）。
  - 存在しないパスで 404 を返し、そのページの `<html lang>` が `ja` である（5.2。axe の `html-has-lang`）。

---

## T0-04 PR用のCI（チェックだけ）

- **種別**：ci
- **依存関係**：T0-03
- **目的**：PRごとに検査を自動で実行し、壊れた変更が `main` に入らないようにする。
- **参照仕様**：12.1〜12.3、11.5、5.5

### 実装内容

- `.github/workflows/ci.yml` の `check` job：install → lint・typecheck → test → build。（実装の途中で変えた：E2E は開発中は PR ごとに実行せず、`.github/workflows/e2e.yml` を手動で実行する。D30。下の2項目は `e2e.yml` に当てはまる）Action はコミットSHAで固定する。権限は `contents: read`。`concurrency` で古い実行を止める。
- e2e の手順の前に `pnpm exec playwright install --with-deps chromium firefox webkit` でブラウザとシステムのライブラリを入れる（T0-02。WebKit・Firefox はライブラリがないと起動しない）。`playwright.config.ts` は、`CI` 環境変数があると `retries: 2`・`workers: 1`・`forbidOnly` になり、レポートは `github` と `html`（`playwright-report/`）を出す。失敗したときに `playwright-report/` を artifact に上げる。
- E2E のサーバー（`playwright.config.ts` の `webServer`）は、`pnpm build` をしてから `wrangler dev`（8788番）を起動する（T0-03）。そのため、`build` の手順と合わせると CI では2回ビルドする。時間が気になれば、`build` の手順を省いて e2e にまとめる。
- gitleaks（既存の `.gitleaks.toml`）をCIで実行する（5.5）。
- `.github/dependabot.yml`（npm と GitHub Actions、週1回）。
- `.github/CODEOWNERS`（`*` はオーナー、`/content/` は `@vivastack-labs/maps-reviewers`）。
- 文書だけのPRの扱いを確かめる。workflow の `paths-ignore` で実行されなかったPRは、必須のチェックが「待機中」のままになり merge できない可能性がある。そうなる場合は、`paths-ignore` を使わず、job の中で変更されたファイルを見て重い手順を飛ばす方式にする。結果を開発概要書 12.1 に書く。

### 完了条件

- このタスクのPRで `ci` が実行され、成功する。
- 文書だけを変えたPRでも merge できる設定になっている（12.1 を更新した）。

### テスト条件

- 自動テストはない（CIの設定そのもののため）。
- 確認の方法：作業用のブランチで、lint の違反を入れたコミットと、テストが失敗するコミットを push し、`ci` がそれぞれ失敗することを確かめる。確かめたら、そのブランチは消す。結果をPRに書く。

---

## T0-05 Cloudflare・GitHubの事前設定

- **種別**：手作業（オーナー）
- **依存関係**：なし（ブランチ保護の設定だけは T0-04 の後。必須にするチェックの名前が決まるため）
- **目的**：デプロイに必要な外部サービスの設定を済ませ、要確認の事項（U5・U7）を確定する。
- **参照仕様**：第11章、U5、U7

### 実装内容

- Cloudflare：
  - workers.dev のサブドメイン `vivastack-dev` は登録済み（11.4 (1)。D35。DNS のレコードと Route は作らない）。
  - API Token：11.3 の権限から始め、T0-06 のデプロイが通る最小の組み合わせに絞る（開発計画 5章 U5 の推奨案）。有効期限は1年。
  - Zero Trust を有効にし、Access でプレビューURLを保護する（本番の workers.dev URL は一般公開なので保護しない。D35）。許可するのはオーナーとレビュアーのメールアドレスだけ（11.4 (5)）。
- GitHub：
  - Environments（`preview` / `production`）と Secrets（11.2）。
  - ブランチ保護（11.5）。
  - Team `maps-reviewers` と、リポジトリへの Write 権限。
- 結果を開発概要書（11.3、11.4 (5)、第16章の U5・U7）に書く docs のPRを出す。
- ブランチ保護で必須にするチェックの名前は `check` と `gitleaks`（T0-04 の `ci.yml`）。
- **プランの制約**（T0-04 で確認）：リポジトリは private、組織は Free プランで、ブランチ保護と Environments・Environment の Secrets を使えない（開発概要書 11.5、U14）。先に U14（GitHub Team に変える / public にする / ブランチ保護なしで運用する）を決める。Environments を使えないままなら、Secrets はリポジトリの Secrets に置くことになり、11.2 を直す。
- この docs のPRは文書だけなので、`check` は lint だけを実行して、typecheck・test・build・e2e を飛ばすはず（T0-04 で merge 後に確かめることにした点）。PRで確かめる。

### 完了条件

- 11.2 の Secrets が、決めた Environment に登録されている。
- 開発概要書の U5・U7 が決定になり、11.3・11.4 (5) の「要検証」「要確認」が消えている。

### テスト条件

- 自動テストはない（外部サービスの設定のため）。
- 確認の方法：T0-06 のデプロイが成功することで確かめる。権限を絞ったTokenで `wrangler deploy` と `wrangler versions upload` が通ること、プレビューURLを開くと Access の認証画面が出ることを確かめる。

---

## T0-06 プレビュー・本番へのデプロイ

- **種別**：ci
- **依存関係**：T0-04、T0-05
- **目的**：PRごとにプレビューURLで確認でき、`main` に merge したら本番に自動で出るようにする。
- **参照仕様**：6.1、12.1〜12.3、11.4 (2)・(5)、D35、R4

### 実装内容

- `wrangler.jsonc`（11.4 (2) のとおり）と、`pnpm build` で `dist/` を作る仕組みは T0-03 で用意した。`compatibility_date` は、入れた wrangler（workerd）が対応する日付までしか使えない（T0-03 では 2026-11-10）。
- `deploy.yml` で E2E を実行するかを決める（開発中は PR ごとに実行しない。D30）。推奨は実行しない（merge の前に `e2e.yml` を手動で実行して確かめるため。分数を抑える）。
- `ci.yml` に `preview` job を加える（`needs: check`。文書だけのPRでは `check` が build を飛ばすので、`check` の `docs_only` を job の出力にして、プレビューも飛ばす）：`wrangler versions upload --preview-alias pr-N`、PRにプレビューURLをコメントする（同じPRでは1つのコメントを更新する）。
- `.github/workflows/deploy.yml`：`main` への push で `wrangler deploy`（`environment: production`）。
- `pnpm build:preview`：`BUILD_TARGET=preview` でビルドする（`next build` と `scripts/postbuild.ts`）。`noindex`（`<meta name="robots" content="noindex">`）と、コンテンツの絞り込み（すべての項目を出して「下書き」の印を付ける）を加えたもの。T3-02 で作った（`package.json` の `build`・`build:preview`、`src/lib/publish.ts`、`app/[lang]/layout.tsx` の `generateMetadata`）。ここ（T0-06）では、`ci.yml` の `preview` job が使う `pnpm build:preview` の出力に `noindex` が付くことを確かめる。
- プレビューURLの形式と、wrangler の出力から取り出す方法を開発概要書 12.3 に書く。

### 完了条件

- このタスクのPRのプレビューURLで、Access の認証の後に3言語の空のページが表示される。
- merge 後、`https://maps.vivastack-dev.workers.dev/ja/` に空のページが表示され、`/` が `/ja/` にリダイレクトされる（M0 の完了条件）。Access の認証なしで開ける。

### テスト条件

- 単体：wrangler の出力からプレビューURLを取り出す関数（実際の出力を元にしたフィクスチャで確かめる。URLがないときはエラーにする）。
- E2E：`pnpm build:preview` の出力には `noindex` が付き、`pnpm build` の出力には付かない（R4）。T3-02 で、`tests/e2e-preview/preview.spec.ts`（`pnpm test:e2e:preview`）と `tests/e2e/pending.spec.ts` に作った。

---

## T0-07 README・AGENTS.md・CHANGELOGの更新

- **種別**：docs
- **依存関係**：T0-06
- **目的**：新しく参加する人とエージェントが、`README.md` と `AGENTS.md` だけを読んで開発を始められるようにする。
- **参照仕様**：6.5、11.6、10.1

### 実装内容

- `README.md` の本文：概要、必要な環境、セットアップ、コマンド、ディレクトリ、文書（開発概要書・開発計画）へのリンク。
- `AGENTS.md`：「コマンド」を実際の `package.json` のスクリプトに合わせる。「M0 の前」などの古い記述を直す。
- `CHANGELOG.md`：Unreleased に M0 の内容を書く。

### 完了条件

- `README.md`・`AGENTS.md` に書いたコマンドが、`package.json` のスクリプトと一致している。
- markdownlint が通る。

### テスト条件

- 自動テストはない（文書のため）。
- 確認の方法：別のディレクトリにリポジトリを clone し、`README.md` の手順どおりに install → test → build が通ることを確かめる。
