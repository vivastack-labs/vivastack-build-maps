# AGENTS.md

Claude Code と Codex の共通の指示。エージェント向けの指示はこのファイルに書く（`CLAUDE.md` はこのファイルを読み込むだけにする）。

## プロジェクト

- 「ご当地めいぶつ日本地図」：47都道府県の名物・名所を日本地図から探せる Web アプリ（ja / en / zh、こども／おとなモード、ふりがな ON/OFF）。
- 設計・要件・決定事項は [docs/development-overview.md](docs/development-overview.md) にある。作業の前に関係する章を読み、要件ID（例：`F-MAP-01`）で対応を確認する。
- タスクの一覧・順番・進み具合は [docs/development-plan.md](docs/development-plan.md)、タスクごとの定義（目的・参照仕様・実装内容・完了条件・テスト条件・依存関係）は `docs/tasks/` にある。タスクに着手するときは、その定義を読み、タスクのID（例：`T0-01`）をPRの本文に書く。終わったら「状態」を更新する。`CHANGELOG.md` は PR ごとには書かず、マイルストーンが終わったとき（そのマイルストーンの最後のタスクの PR）と、公開のときに、`[Unreleased]` にまとめて書き足す。
- 進み具合はここには書かない（`docs/development-plan.md` だけを更新する）。`main` 向けの PR ごとに GitHub Actions の CI（`.github/workflows/ci.yml`）が動き、オーナーが Environment `preview` のデプロイを承認すると、プレビュー（`https://pr-<番号>-maps.vivastack-dev.workers.dev/`）に出て、PR に URL がコメントされる。`main` に merge すると `.github/workflows/deploy.yml` が本番に出す（T0-06）。デプロイは CI だけで行い、手元から `wrangler deploy`・`wrangler versions upload` はしない（障害時の切り戻し〔開発概要書 第13章〕を除く。Token は GitHub の Environment の Secret だけにある）。E2E は開発中は PR ごとに動かさず、`.github/workflows/e2e.yml` を手動で実行する（D30）。

## 技術スタック

- Next.js（App Router、`output: 'export'`。`basePath` は付けない）＋ TypeScript（strict）
- 地図：SVG ＋ d3-geo ＋ topojson-client（国土数値情報 N03 2026年版から作る TopoJSON）
- テスト：Vitest、Testing Library、Playwright、axe-core、Lighthouse CI
- 配信：Cloudflare Workers（Static Assets）。本番は workers.dev の専用のドメイン `https://maps.vivastack-dev.workers.dev/`（Worker名 `maps`。D35）。CI/CD は GitHub Actions ＋ wrangler-action
- パッケージ管理：**pnpm**（npm / yarn は使わない）
- Next.js は 16 系で、学習データより新しい変更がある。Next.js のコードを書く前に、インストールされた版に同梱のドキュメント（`node_modules/next/dist/docs/`）の該当する章を読み、非推奨の警告に従う。

## コマンド

[README.md](README.md) は人が最初に読む入口で、よく使うコマンドだけを載せている。コマンドの全部と細かい注意は、このファイルを正とする（`package.json` のスクリプトを足したら、ここに足す。README には、入口として要るものだけを足す）。

Node.js は `.nvmrc` の版（26）を使う。Node.js 25 以降は corepack が同梱されないので、先に `npm install -g corepack` で入れる。

```bash
nvm use
corepack enable
pnpm install
git config --add remote.origin.fetch '^refs/heads/screenshots'   # 初回だけ。PRの画像のブランチを、ふだんの fetch・pull で取らない
pnpm dev          # http://localhost:3000/ja/（3000番が使用中なら別の番号で起動する）。BUILD_TARGET が未設定なので本番と同じ絞り込み（本物のコンテンツは名物・名所が未作成で、47県とも「準備中」）。下書きを見るときは BUILD_TARGET=preview pnpm dev
pnpm lint         # ESLint・Prettier・markdownlint・yamllint（中身は lint:eslint・lint:prettier・lint:md・lint:yaml。1つずつ動かすときはこちら）
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest（カバレッジの基準を下回ると失敗する）
pnpm test:e2e     # Playwright（PC・スマホ・タブレットの9プロジェクト。本番用のビルド）
pnpm test:e2e:preview   # プレビュー用のビルドの E2E（chromium だけ。8789番。tests/e2e-preview/。playwright.preview.config.ts）
pnpm test:e2e:production   # 本番の公開 URL を Chromium で読み取り検査する（T6-02）。ローカル配信を検査するときは PRODUCTION_CHECK_BASE_URL を指定する
pnpm build        # BUILD_TARGET=production の next build で out/ を作り、scripts/postbuild.ts で dist/ にコピーする
pnpm build:preview   # BUILD_TARGET=preview（すべての項目を `draft` の値を付けて出す。カードの項目に「下書き」の印。noindex つき）。レビュー用のプレビューに使う（T3-02）
pnpm exec wrangler dev   # dist/ を本番の Workers と同じ形で配信する（http://localhost:8787/ja/。先に pnpm build）
pnpm content:validate   # コンテンツの YAML を検証する（誤りで終了コード1。CONTENT_DIR で読むディレクトリを変える）
pnpm content:furigana   # 日本語の文にふりがなを付けて標準出力に出す（標準入力の各行、または引数。読みが怪しい語は標準エラーに出す。YAML は書き換えない。T5-02）
pnpm content:furigana --check <YAML>...   # YAML の {漢字|よみ} の読みを辞書の読みと比べて、違うものを出す（YAML は読むだけ。辞書が誤ることもあるので、違いは公式の表記で確かめる。終了コードは 0。T5-02）
pnpm content:links   # 出典（sources[].url）のリンク切れを確かめて、Markdown のレポートを標準出力に出す（`--pref 26,kyoto` で県を絞る、`--out <ファイル>` でファイルにも書く。同時4件・同じホストへは同時に1件で、前の応答から2秒以上あける。リンク切れ〔404・410〕があれば終了コード 1、引数・コンテンツの誤りは 2。コンテンツは CONTENT_DIR。ふつうは手動の workflow `link-check.yml` で動かす。外のサイトにリクエストを送るので、手元で試すときは件数に気をつける。T5-03）
pnpm github:setup   # GitHub の設定を gh api で反映する（T0-05）。反映する項目：main のルールセット（CI 必須・承認1件・merge はバイパスできる admin・オーナーだけ）、Environment（production は main だけ、preview はオーナーの承認）、Team maps-reviewers（Write。実行者はメンバーから外す）、Actions の権限（SHA 固定の必須・fork の PR の承認）、Secret scanning・push protection、脆弱性の非公開の報告・Dependabot alerts。既定は確かめるだけ（GET と、今の値と違うものの「送る予定の書き込み」の表示だけ。同じなら「変更なし」）。`--apply` で反映する。何度実行しても同じ結果。Team の操作に `gh auth refresh -h github.com -s admin:org` が要る。Secrets は扱わない
pnpm content:types      # スキーマから型（src/lib/content-schema.generated.ts）を作り直す（スキーマを変えたら実行してコミット）
pnpm size         # dist/ の言語ごとの最初の読み込み（HTML＋JS＋CSS）の圧縮後のサイズを表にする（gzip が 300KB を超えると終了コード 1。先に pnpm build）
node scripts/make-max-content.ts --out <ディレクトリ>   # 47県を 7.3 の上限の文字数で埋めたダミーのコンテンツを作る（コミットしない。CONTENT_DIR=<ディレクトリ> pnpm build の後に pnpm size で測る）
pnpm lhci         # dist/ を Lighthouse CI で測る（T4-04。スマホの設定で /ja/・/en/・/zh/、幅 800px の /ja/#pref-01 を3回ずつ。基準値〔5.1〕を下回ると終了コード 1。結果は .lighthouseci/。上限のダミーのコンテンツの dist/ を測る。下の「Lighthouse CI」）
node scripts/make-icons.ts   # ホーム画面のアイコン（仮）を public/icons/ に作り直す（手で実行して出力をコミット。先に pnpm exec playwright install chromium。T4-02）
pnpm geo:build    # 地図データを作り直す（年1回、手で実行。原データの取得は geo/README.md。毎回のビルドでは動かさない）

pnpm vitest run tests/unit/i18n/lang.test.ts   # 1ファイルだけ動かす（カバレッジなし）
pnpm vitest run -t "F-I18N-01"                 # テスト名で絞る（テスト名に要件IDが入っている）
pnpm vitest run --project data                 # データの検査（tests/data/）だけを動かす
node --test .codex/hooks/run.test.js            # Codex hooks の結合テスト（外部 API・音声再生なし）
pnpm test:e2e --project=chromium               # E2E を1プロジェクトだけ動かす
pnpm test:e2e --grep @touch                      # タッチのテスト（@touch）だけ動かす（PC のテストは --grep @pc）。タグを付けたテストは、反対の種類のプロジェクトでは動かない
gh workflow run e2e.yml --ref <ブランチ> -f project=all   # CI で E2E を手動で動かす（UI・ルーティングを変えたPRは merge の前に）
pnpm screenshots > <ファイル>   # PRに載せる after（今の作業ツリー）のスクリーンショットを撮り、screenshots ブランチに push して、PR本文の表を出す
```

`screenshots` ブランチ（PRに載せる画像。main と履歴を共有しない）は、ふつうの `git clone`・`git fetch` ではほかのブランチと一緒にダウンロードされ、PRごとに増えていく。clone の直後に上の `git config` を実行し、すでに取ってしまった追跡ブランチは `git update-ref -d refs/remotes/origin/screenshots` で消す。clone の時点から取らないなら、`git clone --single-branch` で main だけを取り、`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` でほかのブランチを取れるように戻してから、上の `git config` を実行する。

`pnpm test` はカバレッジの基準も確かめるので、一部のテストだけを動かすときは `pnpm vitest run` を使う。`pnpm lint` は `yamllint`（Python 製。pnpm では入らない）を使うので、別に入れておく。

E2E の準備：はじめに `pnpm exec playwright install chromium firefox webkit` でブラウザを入れる。Linux（WSL を含む）では、WebKit・Firefox が使うシステムのライブラリも要る。`sudo env "PATH=$(dirname "$(which node)"):$PATH" pnpm exec playwright install-deps` で入れる（sudo の下でも nvm の Node.js を見つけるため）。

E2E のサーバーは、毎回 `CONTENT_DIR=tests/fixtures/content pnpm build`（本物の制作の進み具合で結果が変わらないように、コンテンツはフィクスチャ。開発計画 1.1）をしてから `wrangler dev` を 8788 番で起動する（`dist/` を確かめるため）。`pnpm dev`（3000番）や手で起動した `wrangler dev`（8787番）とはぶつからない。8788 番が使用中だと起動に失敗するので、止めてから実行する。

Lighthouse CI（`pnpm lhci`。T4-04）：CI の「Size budget」と同じく、上限のコンテンツで `dist/` を作ってから動かす（本物のコンテンツは47県とも「準備中」で、カードの JSON を読まないため、最悪の場合を測れない）。`node scripts/make-max-content.ts --out <ディレクトリ>` → `CONTENT_DIR=<ディレクトリ> pnpm build` → `pnpm lhci`。設定は `lighthouserc.yml`（基準値・3言語）と `lighthouserc.tablet.yml`（幅 800px・ハッシュつき。画面の設定は `package.json` の引数）。Chrome は、ふつうの Linux・macOS ではそのまま見つかる。WSL では、chrome-launcher が Chrome に繋がらない。Playwright の Chromium を `--remote-debugging-port` で先に起動し、`LHCI_COLLECT__SETTINGS__PORT` で繋ぐ：`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --headless=new --no-sandbox --remote-debugging-port=9333 --user-data-dir=<一時のディレクトリ> about:blank &` のあとに `LHCI_COLLECT__SETTINGS__PORT=9333 pnpm lhci`。設定ファイルの `collect.settings` は、コマンドラインや環境変数で `settings.*` を足すとオブジェクトごと置き換わって消える（lhci の仕様）ので、画面の設定をファイルに書かない。基準値を一時的に厳しくして CI が失敗することを確かめるときは、`lighthouserc.yml` の `assert` の値を変える。

pnpm は、`pnpm-workspace.yaml` の `allowBuilds` で、esbuild・workerd のインストールスクリプトを実行しない設定にしている（本体はプラットフォーム別のパッケージから入るので、なくても動く）。新しい依存にインストールスクリプトがあると `pnpm install` が失敗するので、許すか止めるかを決めて `allowBuilds` に書く。

## ディレクトリ

| パス | 内容 |
|---|---|
| `docs/` | 設計書 |
| `app/` | ルーティングとページ（Next.js App Router） |
| `src/` | アプリのロジック。`src/lib/` は `.gitignore` の例外で管理している |
| `tests/unit/` | 単体テスト（`.test.ts`、node）とコンポーネントテスト（`.test.tsx`、jsdom）。`src/` と同じ構成で置く |
| `tests/fixtures/content/` | E2E・単体テスト用のコンテンツ（北海道：全部 `reviewed`、東京都：混在、沖縄県：未作成。残りの44県は `content/prefectures/` の基本情報の写しで、名物・名所は空。写したあとは本物に追従しない）。`CONTENT_DIR=tests/fixtures/content` で読む。E2E・スクリーンショットのビルドはこれを使う（`playwright.config.ts`・`playwright.screenshots.config.ts` の `webServer`） |
| `tests/data/` | データの検査（`.test.ts`、node）。コミットされた地図データ（T1-05）と47県の基本情報（T1-08）の全体を確かめる |
| `tests/e2e/` | E2E（Playwright。`*.spec.ts`。本番用のビルド） |
| `tests/e2e-preview/` | プレビュー用のビルド（`pnpm build:preview`）の E2E（`playwright.preview.config.ts`。chromium だけ。T3-02） |
| `tests/screenshots/` | PRに載せるスクリーンショットの画面（`playwright.screenshots.config.ts`。`pnpm screenshots` から使う） |
| `tests/setup/` | テストの共通の準備（jest-dom のマッチャーなど） |
| `scripts/` | ビルドのスクリプト（`postbuild.ts`：`out/` → `dist/`、各 HTML への CSP の `<meta>` の書き込み、`sw.js` の生成〔`service-worker.ts`〕）と、アイコンの生成（`make-icons.ts`）、サイズの計測（`measure-size.ts`・`make-max-content.ts`。T3-08）、ふりがなの自動付与と読みの比べ方（`furigana.ts`。T5-02。ロジックは `lib/`）、出典のリンク切れチェック（`check-links.ts`。T5-03。ロジックは `lib/link-check.ts`）、GitHub の設定の反映（`setup-github.ts`・`github-settings.ts`。T0-05。ロジックは `lib/github-setup.ts`）。Node.js で直接実行するので、`enum` など型の除去で消せない書き方は使わない（`geo/scripts/` も同じ。相対の import には `.ts` を付ける） |
| `public/` | そのまま配信するファイル。`_redirects`・`_headers` は `dist/` の直下に置かれる。`public/geo/muni/` は `pnpm geo:build` の出力（手で直さない） |
| `content/` | `prefectures/`：都道府県ごとの YAML（T1-08。先頭のコメントに県庁の位置の調べ方がある）。`schema/`：JSON Schema。lint は `content/.yamllint` |
| `geo/` | 地図データの変換（`scripts/`）、読み・ローマ字の修正表（`sources/`）、都道府県の形（`data/prefs.topo.json`。生成物）。原データは `geo/downloads/` に置き、コミットしない。手順と判断は `geo/README.md` |
| `.claude/` | Claude Code の設定・ルール・エージェント・スキル・hooks |
| `.codex/`、`.agents/` | Codex の設定・hooks・スキル |

## アーキテクチャ

機能ごとの実装メモ（部品の分け方・属性の名前・E2E の待ち方・過去の判断）は `docs/architecture/` にある。**その範囲のコード・テストを変える前に該当するファイルを読み**、変えたらそのファイルを更新する（ここには増やさない）。

| ファイル | 範囲 |
|---|---|
| `docs/architecture/map.md` | 地図データ・県の描画・操作の結線（`MapStateProvider`・`usePrefInteraction`）・拡大縮小・市区町村の読み込みと描画・ツールチップ・さくいん・キーボード |
| `docs/architecture/card.md` | コンテンツの読み込み・本番とプレビューの絞り込み（`publish`）・東京からの距離・県のカード・カードの内容の JSON・出典・下から出るパネル |
| `docs/architecture/i18n-mode.md` | 画面の枠組み（`PageFrame`）・UI文言の辞書・ふりがなの記法・モードとふりがなの切替・言語の切替とハッシュ・説明のページ |
| `docs/architecture/platform.md` | CSP・PWA（Service Worker）・アクセシビリティの検査・対応環境（Playwright のプロジェクト） |

どの作業でも守ること：

- ルートレイアウトは `app/[lang]/layout.tsx`。`app/layout.tsx` は置かない。言語ごとに `<html lang>` を出すため（D27・D28）。
- 存在しないパスの404は `app/global-not-found.tsx`（`experimental.globalNotFound`）。ルートレイアウトを通らないので、`<html lang="ja">` とスタイルの読み込みをこのファイルに書く。
- `dynamicParams = false` と `generateStaticParams` で、ja・en・zh の3つだけを静的に生成する。言語の一覧・判定・`<html lang>` の値は `src/i18n/lang.ts` に集める。
- Next.js 16 では `params` が `Promise`。`await` してから `isLang()` で確かめ、合わなければ `notFound()` にする。
- `@/` は `src/` を指す。設定は `tsconfig.json` と `vitest.config.ts` の両方にあるので、変えるときは2か所を合わせる。
- カバレッジの対象は `src/`・`scripts/`・`geo/scripts/`。`app/` は E2E（`tests/e2e/`）で確かめる。async の Server Component（ページ・レイアウト）は Vitest で描画できないので、E2E で確かめる。ドメインロジック（`src/lib/`・`src/features/`・`geo/scripts/lib/`・`scripts/lib/`）は 90% 以上を `vitest.config.ts` で強制している。
- サーバーで出力した要素は描き直さず、クライアントは属性（`hidden`・`aria-*`・`data-*`）だけを書き換える（6.6 (2)）。カードなどの内容をクライアントコンポーネントに props で渡さない（HTML に3回目の写しができる）。
- CSP（`style-src 'self'`・`script-src` はハッシュ）：サーバーの HTML に `style` 属性・`<style>`・`onclick=` などを出さない（見た目は Tailwind のクラス。クラス名は組み立てずに全体を書く）。インラインスクリプトを足すと `scripts/postbuild.ts` がビルドを止める。**`pnpm dev` には CSP がかからない**ので、`pnpm build` ＋ `wrangler dev` か E2E で確かめる（`docs/architecture/platform.md`）。
- 文言は `src/i18n/ja.ts` に足す（`en.ts`・`zh.ts` はキーが足りなければ typecheck で落ちる）。日本語はふりがなの記法つきで、`RubyText` で描く。
- 新しい色の変数・文字と塗りの組み合わせは、`tests/unit/styles/theme-contrast.test.ts` に組み合わせを足す（axe は SVG の文字の色を判断できない）。
- `src/i18n/lang.ts` の `PAGES` に足したページは、自動でプリキャッシュ・hreflang・横スクロールの検査の対象になる。管理用・下書き用のページは入れない。
- E2E：PC だけ・タッチだけのテストは `test.skip(hasTouch…)` ではなくタグ（`@pc`・`@touch`）で書き、テストの引数で `hasTouch`・`isMobile`・`browserName` を受け取らない（`tests/unit/config/playwright-projects.test.ts` が止める）。操作の前に `data-map-ready`・`data-index-ready`・`data-card-ready` を待つ（ハイドレーション前の操作は失われる）。E2E は Service Worker を `block` している。
- `next.config.ts` の `agentRules: false` は消さない。消すと `next dev` が `AGENTS.md` に英語の指示を書き込む。

## 開発ルール

詳細は `.claude/rules/` にある（Claude Code は自動で読み込む。Codex は必要に応じて該当ファイルを読む）。

- **確認事項**：ユーザーに確認や判断を求めるときは、必ず推奨案とその理由を付ける（例：「A と B のどちらにしますか。推奨は A（理由：〜）」）。選択肢を並べるだけにしない。
- **言語**：ユーザーへの回答、ドキュメント、PR の本文、コミットメッセージは日本語で書く。PR のタイトルだけは英語で書く（形式は「コミット」の項目）。
- **TDD**：テストを先に書く（Red → Green → Refactor）。テスト名やコメントに要件IDを入れる。カバレッジは全体80%以上、ドメインロジックは90%以上。→ `testing.md`
- **ブランチと PR**：`main`・`develop` に直接 push しない。1機能＝1ブランチ＝1PR。データ整備の間（T5-05）は、`develop` から feature ブランチを切り、PR は **`develop` 向け**に出す（`gh pr create --base develop`）。CI（`ci.yml`）・プレビュー・必須のレビューは `main` 向けの PR だけで動く（`develop` には保護がなく、`develop` 向けの PR では何も動かない）。E2E もこの間は動かさない。データ整備が終わったら、`develop` → `main` の PR をまとめて出し、CI・E2E・レビューはそこで行う。→ `git-workflow.md`
- **コミット**：`<type>: <description>`（feat / fix / refactor / docs / test / chore / perf / ci）。`<type>` は英語のまま、`<description>` と本文は日本語で書く（例：`docs: 操作仕様を追加`）。PR のタイトルも `<type>: <description>` の形式にするが、`<description>` は英語で書く（例：`docs: add interaction spec`）。
- **コーディング**：イミュータブルに書く、小さな関数・ファイル、境界での入力検証、export には JSDoc。→ `coding-style.md`
- **セキュリティ**：シークレットをリポジトリ・ログ・PR に書かない（gitleaks で検査）。→ `security.md`
- **画面の変更**：画面が変わるPRには、`pnpm screenshots` で撮った after の表を本文に載せる（before は前のPRの after で見られるので撮らない）。撮る画面は `tests/screenshots/pages.spec.ts`、画像は `screenshots` ブランチ（main と履歴を共有しない。消さない。ふだんの fetch では取らない）に置く。
- `--no-verify` や force push など、hooks・検査を回避する操作はしない。
- lint や formatter の設定（`.prettierrc`、`.markdownlint.json`、`.yamllint` など）は、指示がない限り変えない。

## コンテンツ

- 1県＝1 YAML。`status` は `draft` → `verified` → `reviewed`。本番には `reviewed` だけを出す。
- ふりがなは `{漢字|よみ}` で書く。
- 出典は、実際に開いて内容を確認できた URL だけを残す。確認できなければ `sources: []`。
- 執筆ルールと文字数は設計書の 7.2・7.3・9.3 章に従う。具体的な書き方と例は `content/guidelines/writing.md`、レビューの基準は `content/guidelines/review-checklist.md`（コンテンツを書く前に `writing.md` を読む）。
- 1県分の①〜④（下書き → 出典の照合 → 派生版 → 検証）は、`gotouchi-content` で行う。Claude Code は `.claude/skills/gotouchi-content/`、Codex は `.agents/skills/gotouchi-content/` を使う。検証は各環境の `gotouchi-source-checker`・`gotouchi-derivative-checker` エージェント（Codex の定義は `.codex/agents/`。D22）。
