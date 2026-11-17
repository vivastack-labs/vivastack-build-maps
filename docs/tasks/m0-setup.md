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

- **種別**：手作業（オーナー）＋ chore（GitHub の設定を反映するスクリプト `pnpm github:setup`）
- **依存関係**：なし（ブランチ保護の設定だけは T0-04 の後。必須にするチェックの名前が決まるため）
- **目的**：デプロイに必要な外部サービスの設定を済ませ、要確認の事項（U5・U7・U14）を確定する（U7 は T0-06 に移した）。
- **参照仕様**：第11章、U5、U7、U14

### 実装内容

- Cloudflare：
  - workers.dev のサブドメイン `vivastack-dev` は登録済み（11.4 (1)。D35。DNS のレコードと Route は作らない）。
  - API Token：11.3 の権限から始め、T0-06 のデプロイが通る最小の組み合わせに絞る（開発計画 5章 U5 の推奨案）。有効期限は1年。
  - Zero Trust を有効にし、Access でプレビューURLを保護する（本番の workers.dev URL は一般公開なので保護しない。D35）。許可するのはオーナーとレビュアーのメールアドレスだけ（11.4 (5)）。→ **T0-06 に移した**（オーナーの判断）。その後 T0-06 で、Access を使わないことに決めた（D46）。
- GitHub：
  - Environments（`preview` / `production`）と Secrets（11.2）。
  - ブランチ保護（11.5）。
  - Team `maps-reviewers` と、リポジトリへの Write 権限。
- 結果を開発概要書（11.3、11.4 (5)、第16章の U5・U7・U14）に書く docs のPRを出す。
- ブランチ保護で必須にするチェックの名前は `check` と `gitleaks`（T0-04 の `ci.yml`）。
- ブランチ保護で「Dismiss stale pull request approvals when new commits are pushed」と「Require approval of the most recent reviewable push」は有効にしない。コンテンツの PR は、レビュアーの承認の後に、オーナーが `status` を `reviewed` にするコミットを足してから merge する（9.2 ⑧）ので、有効にすると承認が外れる。有効にするなら、`status` のコミットの後に、レビュアーに承認し直してもらう（`content/guidelines/review-checklist.md`）。
- **プランの制約**（T0-04 で確認）：リポジトリは private、組織は Free プランで、ブランチ保護と Environments・Environment の Secrets を使えない（開発概要書 11.5、U14）。→ **T0-05 でオーナーが public にした**（D44）。GitHub の設定は `pnpm github:setup` で反映する（11.5）。
- 文書だけの PR で、`check` が lint だけを実行して typecheck・test・build・e2e を飛ばすこと（T0-04 で merge 後に確かめることにした点）は、この PR がスクリプトを含むので確かめられない。次の文書だけの PR（T0-07 など）で確かめる。→ T0-07 の PR（#71、run 44032283855）で確かめた：`check` は Lint だけを実行し、Typecheck・Unit test・Validate content・Size budget・Lighthouse CI・Build・Build preview は skipped、`preview`・`preview-comment` も skipped、`check`・`gitleaks` は成功（必須のチェックが通り、merge できる）。

### 完了条件

- 11.2 の Secrets が、決めた Environment に登録されている。
- 開発概要書の U5・U14 が決定になり、11.3・11.4 (5) の「要検証」「要確認」が消えている（U7 は T0-06 に移し、11.4 (5) には公式ドキュメントの手順を書く）。
- `pnpm github:setup --apply` の後、もう一度 `pnpm github:setup` を実行すると、書き込みの予定がない。

### テスト条件

- Cloudflare の設定には自動テストはない（外部サービスの設定のため）。
- 単体：`pnpm github:setup` のロジック（`scripts/lib/github-setup.ts`。`gh api` を置き換える）と、必須のチェックの名前が `ci.yml` の job にあること。
- 確認の方法：権限を絞ったTokenで、捨てる Worker 名（`maps-token-check`）に `wrangler deploy`・`wrangler versions upload`・`wrangler delete` が通ること（T0-05 でオーナーが確かめた。開発概要書 11.3）。本番のデプロイは T0-06 で確かめる。

---

## T0-06 プレビュー・本番へのデプロイ

- **種別**：ci
- **依存関係**：T0-04、T0-05
- **目的**：PRごとにプレビューURLで確認でき、`main` に merge したら本番に自動で出るようにする。
- **参照仕様**：6.1、12.1〜12.3、11.2、11.4 (2)・(5)、11.5、D35、D44〜D46、R4・R5

### 実装内容

- `wrangler.jsonc`（11.4 (2) のとおり）と、`pnpm build` で `dist/` を作る仕組みは T0-03 で用意した。`compatibility_date` は、入れた wrangler（workerd）が対応する日付までしか使えない（T0-03 では 2026-11-10）。
- `deploy.yml` で E2E を実行するかを決める（開発中は PR ごとに実行しない。D30）。推奨は実行しない（merge の前に `e2e.yml` を手動で実行して確かめるため。分数を抑える）。
- `ci.yml` に `preview` job を加える（`needs: check`。文書だけのPRでは `check` が build を飛ばすので、`check` の `docs_only` を job の出力にして、プレビューも飛ばす）：`wrangler versions upload --preview-alias pr-N`、PRにプレビューURLをコメントする（同じPRでは1つのコメントを更新する）。
- `.github/workflows/deploy.yml`：`main` への push で `wrangler deploy`（`environment: production`）。
- `deploy.yml` の本番のビルド（`reviewed` のみ）の後に、`pnpm lhci`（T4-04）を加えるか決める。`ci.yml` では、上限のコンテンツの `dist/` を測っている（開発概要書 5.1、12.2）。本物のコンテンツのビルドを測る場合、`dist/` の作り方と、基準値が同じでよいかを決める。
- `pnpm build:preview`：`BUILD_TARGET=preview` でビルドする（`next build` と `scripts/postbuild.ts`）。`noindex`（`<meta name="robots" content="noindex">`）と、コンテンツの絞り込み（すべての項目を出し、`reviewed` でない項目に `draft` の値を付ける。画面の「下書き」の印は T3-03）を加えたもの。T3-02 で作った（`package.json` の `build`・`build:preview`、`src/lib/publish.ts`、`app/[lang]/layout.tsx` の `generateMetadata`）。ここ（T0-06）では、`ci.yml` の `preview` job が使う `pnpm build:preview` の出力に `noindex` が付くことを確かめる。
- プレビューURLの形式と、wrangler の出力から取り出す方法を開発概要書 12.3 に書く。
- **Access は使わない**（D46。オーナーが決定）：プレビューURLは認証なしで開ける。リポジトリが public で、レビュー前のコンテンツはすでに GitHub で読めるため。`noindex` と「下書き」の印は残す。
- **`preview` の承認**：Environment `preview` は、デプロイの前にオーナーの承認が要る（D45。11.2）。`preview` job は、オーナーが Actions の画面（または PR の「Review deployments」）で承認するまで待つ。→ 実装（T0-06）：Token を使う `preview` job は、道具を `main`（PR の base）から取り（`pnpm install --frozen-lockfile --ignore-scripts`）、PR からは `check` が作った `dist/` の Artifact だけを受け取る。Token は wrangler のステップの `env` だけ。`check`・`preview`・`deploy.yml` は Actions のキャッシュを使わない（`package-manager-cache: false`）。URL の取り出しと PR へのコメントは、Secrets のない `preview-comment` job が PR のコードで行う。承認の前に確かめるのは、PR の変更に `.github/` がないことと、公開してよい内容か（開発概要書 11.2）。
- **fork からの PR**：リポジトリは public（D44）。fork からの PR の workflow には Secrets が渡らないので、`preview` job は fork の PR では飛ばす（`github.event.pull_request.head.repo.full_name == github.repository` のときだけ動かす）。fork からの PR の workflow は、外部の人すべてで承認が要る設定にしてある（11.5）。
- `preview` job は `environment: preview`、`deploy.yml` は `environment: production`（Token は Environment の Secret。Account ID はリポジトリの Secret。11.2・D45）。
- 決まったプレビューURLの形式を、`content/guidelines/review-checklist.md` の「プレビューの開き方」に反映する（T5-01 で、決まっていない点に「T0-06 で確定」と印を付けてある。Access のログインの記述は D46 で外した）。

### 完了条件

- このタスクのPRのプレビューURLで、3言語の空のページが表示される（オーナーが `preview` のデプロイを承認した後。認証なし。D46）。
- merge 後、`https://maps.vivastack-dev.workers.dev/ja/` に空のページが表示され、`/` が `/ja/` にリダイレクトされる（M0 の完了条件）。

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

### 分かったこと

- T0-06 を後回しにしたので、T0-07 の時点で M1〜M4 と T5-01〜T5-03 はすでに merge 済みだった。CHANGELOG の `[Unreleased]` には、M0 だけでなく、これまで merge したすべてを機能のまとまりで書いた（版の番号は公開〔T6-02〕のときに付ける）。今後は PR ごとには書かず、マイルストーンが終わったとき（最後のタスクの PR）と公開のときに書き足す（開発概要書 10.1）。
- `README.md` は入口だけ（概要・必要な環境・セットアップ・よく使うコマンド・開発の流れ・リンク）にして、コマンドの全部と細かい注意は `AGENTS.md` を正にした（同じ説明を2か所に書かない）。README は日本語。ライセンスは書いていない（`LICENSE` はまだない。コードとコンテンツで分けるかなども含めて、オーナーが別に決める）。
- `pnpm lint` には yamllint 1.33.0（Python 製）が要る。pnpm では入らないので、README の「必要な環境」に書いた。
- コマンドの一致は、自動テストにせず、PR の中で1回だけスクリプトで確かめた（`README.md`・`AGENTS.md` の `pnpm <名前>` が `package.json` のスクリプトか pnpm のコマンドであること。`lint:*` を除くスクリプトがすべて `AGENTS.md` に出ること）。`package.json` にスクリプトを足したら `AGENTS.md` に足す（コマンドの節の冒頭に書いた）。
- リポジトリの直下の `cc-v4-pro.sh` は、アプリとは関係がない個人用のスクリプトなので、触らず README にも載せていない。
