# M0 準備：タスクの定義

項目の意味と進め方は [development-plan.md](../development-plan.md) の第1章、進み具合は第3章にある。参照仕様の章番号は [開発概要書](../development-overview.md) のもの。

マイルストーンの完了条件：空のページ（3言語）がプレビューと本番にデプロイできる。

---

## T0-01 Next.jsの雛形と単体テストの実行環境

- **種別**：chore
- **依存関係**：なし
- **目的**：以降のすべてのタスクの土台として、設計どおりの設定（静的出力、`basePath`、3言語のルート）のアプリを用意する。単体テストもここで動くようにして、最初のコードからTDDで書けるようにする。
- **参照仕様**：6.2、6.5、5.3、F-I18N-01、D26、D28

### 実装内容

- `.nvmrc`（その時点の Node.js Active LTS）。`package.json` の `packageManager` で pnpm の版を固定する。`browserslist` を 5.3 のとおりに書く。
- Next.js（App Router）。`next.config.ts` に `output: 'export'`、`basePath: '/maps'`、`trailingSlash: true`。
- TypeScript（strict）。
- `app/[lang]/layout.tsx`：ルートレイアウト。`<html lang>` に `ja` / `en` / `zh-Hans` を出す。`generateStaticParams` で ja・en・zh を生成し、`dynamicParams = false` にする。
- `app/[lang]/page.tsx`：仮のページ（サイト名の見出しだけ）。
- `src/i18n/lang.ts`：`Lang` 型、`LANGS`、`isLang()`（型ガード）、`htmlLang()`（`zh` → `zh-Hans`）。
- Tailwind CSS v4（`@tailwindcss/postcss`）。`app/globals.css` に `@import "tailwindcss";` と空の `@theme`。`tailwind.config.*` は作らない。
- Vitest（単体テストの実行だけ。カバレッジの基準は T0-02）。`pnpm test` で実行する。

### 完了条件

- `pnpm build` が成功し、3言語の `index.html` が出力される。
- `pnpm dev` で `http://localhost:3000/maps/ja/` が表示される。
- `pnpm test` が通る。

### テスト条件

- 単体（`src/i18n/lang.ts`）：
  - `isLang()` は `ja`・`en`・`zh` で `true`、`fr`・空文字・`JA`・`zh-Hans` で `false` を返す（F-I18N-01）。
  - `htmlLang()` は `ja` → `ja`、`en` → `en`、`zh` → `zh-Hans` を返す（6.2 D27）。

---

## T0-02 検査・E2Eテストの道具

- **種別**：chore
- **依存関係**：T0-01
- **目的**：lint・型検査・単体テスト・E2Eテストを、それぞれ1つのコマンドで実行できるようにする。以降のタスクの完了条件を機械的に確かめられるようにする。
- **参照仕様**：10.2、5.3、AGENTS.md の「コマンド」

### 実装内容

- ESLint（Next.js と TypeScript の推奨設定）、Prettier（既存の `.prettierrc` を使い、変えない）、`eslint-config-prettier`。
- `package.json` のスクリプト：
  - `lint`：ESLint、Prettier のチェック、markdownlint、yamllint（ルートの `.yamllint` と `content/.yamllint` の2つ）
  - `typecheck`：`tsc --noEmit`
  - `test`：Vitest。カバレッジ（v8）の基準は全体80%、`src/lib/**`・`src/features/**` は90%。下回ったら失敗する
  - `test:e2e`：Playwright
- Testing Library（React）と jsdom を Vitest に設定する。
- Playwright：プロジェクトは Chromium・Firefox・WebKit（PC）、スマホ（iPhone・Pixel の端末設定）、タブレット（iPad の縦・横）。この時点のサーバーは `next dev`（T0-03 で `wrangler dev` に切り替える）。
- テストの置き場所：`tests/unit/`、`tests/e2e/`（6.5）。

### 完了条件

- `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm test:e2e` がすべて通る。
- カバレッジが基準を下回ると `pnpm test` が失敗することを確かめた。

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
- Playwright のサーバーを、`dist/` を配信する `wrangler dev` に切り替える。

### 完了条件

- `pnpm build` で、`dist/` が 6.4 の構成になる。
- `pnpm exec wrangler dev` で `/maps/ja/` が表示される。
- 開発概要書の U8 を決定にし、6.4 の「要検証」を消した。

### テスト条件

- 単体（`scripts/postbuild.ts`）：`out/` のファイルの一覧から、`dist/` での置き場所を正しく計算する（`_redirects`・`_headers` は直下、ほかは `maps/` の下）。
- E2E（`wrangler dev`）：
  - `/maps` と `/maps/` が 301 で `/maps/ja/` にリダイレクトされる（F-I18N-02）。
  - `/maps/ja/` のレスポンスに `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy` が付く（5.5）。
  - 存在しないパスで 404 を返す。

---

## T0-04 PR用のCI（チェックだけ）

- **種別**：ci
- **依存関係**：T0-03
- **目的**：PRごとに検査を自動で実行し、壊れた変更が `main` に入らないようにする。
- **参照仕様**：12.1〜12.3、11.5、5.5

### 実装内容

- `.github/workflows/ci.yml` の `check` job：install → lint・typecheck → test → build → e2e。Action はコミットSHAで固定する。権限は `contents: read`。`concurrency` で古い実行を止める。
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
  - DNS：`build.vivagain.jp` のレコードをプロキシ有効で作る（11.4 (1)）。
  - workers.dev のサブドメインを登録する。
  - API Token：11.3 の権限から始め、T0-06 のデプロイが通る最小の組み合わせに絞る（開発計画 5章 U5 の推奨案）。有効期限は1年。
  - Zero Trust を有効にし、Access でプレビューURLを保護する。許可するのはオーナーとレビュアーのメールアドレスだけ（11.4 (5)）。
- GitHub：
  - Environments（`preview` / `production`）と Secrets（11.2）。
  - ブランチ保護（11.5）。
  - Team `maps-reviewers` と、リポジトリへの Write 権限。
- 結果を開発概要書（11.3、11.4 (5)、第16章の U5・U7）に書く docs のPRを出す。

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
- **参照仕様**：6.1、12.1〜12.3、11.4 (2)・(5)、U6、R4

### 実装内容

- `ci.yml` に `preview` job を加える：`wrangler versions upload --preview-alias pr-N`、PRにプレビューURLをコメントする（同じPRでは1つのコメントを更新する）。
- `.github/workflows/deploy.yml`：`main` への push で `wrangler deploy`（`environment: production`）。
- `pnpm build:preview`：この時点では `pnpm build` と同じ内容に、`noindex`（`<meta name="robots" content="noindex">`）を加えたもの。コンテンツの絞り込みは T3-02 で加える。
- `workers_dev: false` と `preview_urls: true` を同時に設定できるか確かめる（開発計画 5章 U6 の推奨案）。結果を開発概要書（11.4 (2)、第16章の U6）に書く。
- プレビューURLの形式と、wrangler の出力から取り出す方法を開発概要書 12.3 に書く。

### 完了条件

- このタスクのPRのプレビューURLで、Access の認証の後に3言語の空のページが表示される。
- merge 後、`https://build.vivagain.jp/maps/ja/` に空のページが表示され、`/maps` が `/maps/ja/` にリダイレクトされる（M0 の完了条件）。
- 開発概要書の U6 が決定になっている。

### テスト条件

- 単体：wrangler の出力からプレビューURLを取り出す関数（実際の出力を元にしたフィクスチャで確かめる。URLがないときはエラーにする）。
- E2E：`pnpm build:preview` の出力には `noindex` が付き、`pnpm build` の出力には付かない（R4）。

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
