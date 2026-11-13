# AGENTS.md

Claude Code と Codex の共通の指示。エージェント向けの指示はこのファイルに書く（`CLAUDE.md` はこのファイルを読み込むだけにする）。

## プロジェクト

- 「ご当地めいぶつ日本地図」：47都道府県の名物・名所を日本地図から探せる Web アプリ（ja / en / zh、こども／おとなモード、ふりがな ON/OFF）。
- 設計・要件・決定事項は [docs/development-overview.md](docs/development-overview.md) にある。作業の前に関係する章を読み、要件ID（例：`F-MAP-01`）で対応を確認する。
- タスクの一覧・順番・進み具合は [docs/development-plan.md](docs/development-plan.md)、タスクごとの定義（目的・参照仕様・実装内容・完了条件・テスト条件・依存関係）は `docs/tasks/` にある。タスクに着手するときは、その定義を読み、タスクのID（例：`T0-01`）をPRの本文に書く。終わったら「状態」を更新する。
- M1（地図データとコンテンツ基盤）まで終わり、次は M2（地図コア）。地図データ（T1-01〜T1-05：投影法、変換スクリプト、データの検査）と、ふりがなの記法のパーサー（T1-06）、コンテンツのスキーマと検証（T1-07。`pnpm content:validate`）、47県の基本情報（T1-08。`content/prefectures/`。名物・名所は未作成で、T5 で書く）ができている。M0 は手作業の T0-05 と、それに続く T0-06・T0-07（デプロイ）が残っている。アプリの雛形（Next.js・TypeScript・Tailwind CSS・ESLint・Vitest）はある（T0-01）。コンポーネントテストと E2E（Testing Library・Playwright）もある（T0-02）。`dist/` の組み立てと、`wrangler dev` での確認もできる（T0-03）。PRごとに GitHub Actions の CI（`.github/workflows/ci.yml`：lint・typecheck・test・build・gitleaks）が動く（T0-04）。E2E は開発中は PR ごとに動かさず、`.github/workflows/e2e.yml` を手動で実行する（D30）。デプロイはまだない。

## 技術スタック

導入済み：Next.js・TypeScript・Tailwind CSS・ESLint（eslint-plugin-jsdoc を含む）・Prettier・Vitest・Testing Library・Playwright・wrangler・GitHub Actions（PRのチェック）・Dependabot・d3-geo・mapshaper・topojson-client（テストだけ）・yaml・ajv・json-schema-to-typescript。それ以外はまだ入っていない（予定）。

- Next.js（App Router、`output: 'export'`。`basePath` は付けない）＋ TypeScript（strict）
- 地図：SVG ＋ d3-geo ＋ topojson-client（国土数値情報 N03 2026年版から作る TopoJSON）
- テスト：Vitest、Testing Library、Playwright、axe-core、Lighthouse CI
- 配信：Cloudflare Workers（Static Assets）。本番は workers.dev の専用のドメイン `https://maps.vivastack-dev.workers.dev/`（Worker名 `maps`。D35）。CI/CD は GitHub Actions ＋ wrangler-action
- パッケージ管理：**pnpm**（npm / yarn は使わない）
- Next.js は 16 系で、学習データより新しい変更がある。Next.js のコードを書く前に、インストールされた版に同梱のドキュメント（`node_modules/next/dist/docs/`）の該当する章を読み、非推奨の警告に従う。

## コマンド

Node.js は `.nvmrc` の版（26）を使う。Node.js 25 以降は corepack が同梱されないので、先に `npm install -g corepack` で入れる。

```bash
nvm use
corepack enable
pnpm install
git config --add remote.origin.fetch '^refs/heads/screenshots'   # 初回だけ。PRの画像のブランチを、ふだんの fetch・pull で取らない
pnpm dev          # http://localhost:3000/ja/（3000番が使用中なら別の番号で起動する）
pnpm lint         # ESLint・Prettier・markdownlint・yamllint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest（カバレッジの基準を下回ると失敗する）
pnpm test:e2e     # Playwright（PC・スマホ・タブレットの7プロジェクト）
pnpm build        # next build で out/ を作り、scripts/postbuild.ts で dist/ にコピーする
pnpm exec wrangler dev   # dist/ を本番の Workers と同じ形で配信する（http://localhost:8787/ja/。先に pnpm build）
pnpm content:validate   # コンテンツの YAML を検証する（誤りで終了コード1。CONTENT_DIR で読むディレクトリを変える）
pnpm content:types      # スキーマから型（src/lib/content-schema.generated.ts）を作り直す（スキーマを変えたら実行してコミット）
pnpm geo:build    # 地図データを作り直す（年1回、手で実行。原データの取得は geo/README.md。毎回のビルドでは動かさない）

pnpm vitest run tests/unit/i18n/lang.test.ts   # 1ファイルだけ動かす（カバレッジなし）
pnpm vitest run -t "F-I18N-01"                 # テスト名で絞る（テスト名に要件IDが入っている）
pnpm vitest run --project data                 # データの検査（tests/data/）だけを動かす
pnpm test:e2e --project=chromium               # E2E を1プロジェクトだけ動かす
gh workflow run e2e.yml --ref <ブランチ> -f project=all   # CI で E2E を手動で動かす（UI・ルーティングを変えたPRは merge の前に）
pnpm screenshots > <ファイル>   # PRに載せる before（origin/main）・after のスクリーンショットを撮り、screenshots ブランチに push して、PR本文の表を出す
```

`screenshots` ブランチ（PRに載せる画像。main と履歴を共有しない）は、ふつうの `git clone`・`git fetch` ではほかのブランチと一緒にダウンロードされ、PRごとに増えていく。clone の直後に上の `git config` を実行し、すでに取ってしまった追跡ブランチは `git update-ref -d refs/remotes/origin/screenshots` で消す。clone の時点から取らないなら、`git clone --single-branch` で main だけを取り、`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` でほかのブランチを取れるように戻してから、上の `git config` を実行する。

`pnpm test` はカバレッジの基準も確かめるので、一部のテストだけを動かすときは `pnpm vitest run` を使う。`pnpm lint` は `yamllint`（Python 製。pnpm では入らない）を使うので、別に入れておく。

E2E の準備：はじめに `pnpm exec playwright install chromium firefox webkit` でブラウザを入れる。Linux（WSL を含む）では、WebKit・Firefox が使うシステムのライブラリも要る。`sudo env "PATH=$(dirname "$(which node)"):$PATH" pnpm exec playwright install-deps` で入れる（sudo の下でも nvm の Node.js を見つけるため）。

E2E のサーバーは、毎回 `pnpm build` をしてから `wrangler dev` を 8788 番で起動する（`dist/` を確かめるため）。`pnpm dev`（3000番）や手で起動した `wrangler dev`（8787番）とはぶつからない。8788 番が使用中だと起動に失敗するので、止めてから実行する。

pnpm は、`pnpm-workspace.yaml` の `allowBuilds` で、esbuild・workerd のインストールスクリプトを実行しない設定にしている（本体はプラットフォーム別のパッケージから入るので、なくても動く）。新しい依存にインストールスクリプトがあると `pnpm install` が失敗するので、許すか止めるかを決めて `allowBuilds` に書く。

## ディレクトリ

| パス | 内容 |
|---|---|
| `docs/` | 設計書 |
| `app/` | ルーティングとページ（Next.js App Router） |
| `src/` | アプリのロジック。`src/lib/` は `.gitignore` の例外で管理している |
| `tests/unit/` | 単体テスト（`.test.ts`、node）とコンポーネントテスト（`.test.tsx`、jsdom）。`src/` と同じ構成で置く |
| `tests/fixtures/content/` | E2E・単体テスト用のコンテンツ（北海道：全部 `reviewed`、東京都：混在、沖縄県：未作成）。`CONTENT_DIR=tests/fixtures/content` で読む |
| `tests/data/` | データの検査（`.test.ts`、node）。コミットされた地図データ（T1-05）と47県の基本情報（T1-08）の全体を確かめる |
| `tests/e2e/` | E2E（Playwright。`*.spec.ts`） |
| `tests/screenshots/` | PRに載せるスクリーンショットの画面（`playwright.screenshots.config.ts`。`pnpm screenshots` から使う） |
| `tests/setup/` | テストの共通の準備（jest-dom のマッチャーなど） |
| `scripts/` | ビルドのスクリプト（`postbuild.ts`：`out/` → `dist/`）。Node.js で直接実行するので、`enum` など型の除去で消せない書き方は使わない（`geo/scripts/` も同じ。相対の import には `.ts` を付ける） |
| `public/` | そのまま配信するファイル。`_redirects`・`_headers` は `dist/` の直下に置かれる。`public/geo/muni/` は `pnpm geo:build` の出力（手で直さない） |
| `content/` | `prefectures/`：都道府県ごとの YAML（T1-08。先頭のコメントに県庁の位置の調べ方がある）。`schema/`：JSON Schema。lint は `content/.yamllint` |
| `geo/` | 地図データの変換（`scripts/`）、読み・ローマ字の修正表（`sources/`）、都道府県の形（`data/prefs.topo.json`。生成物）。原データは `geo/downloads/` に置き、コミットしない。手順と判断は `geo/README.md` |
| `.claude/` | Claude Code の設定・ルール・エージェント・スキル・hooks |
| `.codex/`、`.agents/` | Codex の設定・hooks・スキル |

## アーキテクチャ

- ルートレイアウトは `app/[lang]/layout.tsx`。`app/layout.tsx` は置かない。言語ごとに `<html lang>` を出すため（D27・D28）。
- 存在しないパスの404は `app/global-not-found.tsx`（`experimental.globalNotFound`）。ルートレイアウトを通らないので、`<html lang="ja">` とスタイルの読み込みをこのファイルに書く。
- `dynamicParams = false` と `generateStaticParams` で、ja・en・zh の3つだけを静的に生成する。言語の一覧・判定・`<html lang>` の値は `src/i18n/lang.ts` に集める。
- Next.js 16 では `params` が `Promise`。`await` してから `isLang()` で確かめ、合わなければ `notFound()` にする。
- `@/` は `src/` を指す。設定は `tsconfig.json` と `vitest.config.ts` の両方にあるので、変えるときは2か所を合わせる。
- カバレッジの対象は `src/`・`scripts/`・`geo/scripts/`。`app/` は E2E（`tests/e2e/`）で確かめる。async の Server Component（ページ・レイアウト）は Vitest で描画できないので、E2E で確かめる。ドメインロジック（`src/lib/`・`src/features/`・`geo/scripts/lib/`）は 90% 以上を `vitest.config.ts` で強制している。
- 地図データ（7.4、D34）：N03 から `pnpm geo:build` で2種類の TopoJSON を作り、コミットする。どちらも経緯度のままで、投影と沖縄の別枠への移動は描くときに `src/features/map/projection.ts` だけで行う（設定は定数。都道府県と市区町村で同じ投影にして境界を合わせるため）。
  - `geo/data/prefs.topo.json`（`prefectures`）：ビルド時に SVG のパスにして HTML に埋め込む。配信しない。
  - `public/geo/muni/NN.topo.json`（`municipalities`）：県を最大化したときに `/geo/muni/` から読み込む。市区町村は `code` で引く（名前・読みが同じ市区町村がある）。
  - 変換は総務省のコード表と照合し、修正表の `before` が合わない・大きさが基準を超えるなどで止まる。コミットした出力は `tests/data/geo.test.ts` が CI で検査する。
- ふりがなの記法 `{漢字|よみ}`（7.2）：`src/lib/ruby.ts` の `parseRuby`（誤りがあれば例外）・`checkRuby`（誤りと警告の一覧）・`plainText`（読みを除く）と、`<ruby>` を描く `src/components/RubyText.tsx`。`dangerouslySetInnerHTML` は使わない。
- コンテンツ（7.1）：ビルドでは `src/lib/content.ts` の `loadContent()`（誤りがあれば例外。県を `code` の順に返す）を使い、検証は `validateContent()`（誤り・警告をすべて返す）。どちらも `CONTENT_DIR`（既定は `content/prefectures/`）を読む。`scripts/` から Node.js で直接読み込むので、`src/lib/` の相対の import には `.ts` を付ける。本番の `reviewed` だけの絞り込みは T3-02。
- `next.config.ts` の `agentRules: false` は消さない。消すと `next dev` が `AGENTS.md` に英語の指示を書き込む。

## 開発ルール

詳細は `.claude/rules/` にある（Claude Code は自動で読み込む。Codex は必要に応じて該当ファイルを読む）。

- **確認事項**：ユーザーに確認や判断を求めるときは、必ず推奨案とその理由を付ける（例：「A と B のどちらにしますか。推奨は A（理由：〜）」）。選択肢を並べるだけにしない。
- **言語**：ユーザーへの回答、ドキュメント、PR の本文、コミットメッセージは日本語で書く。PR のタイトルだけは英語で書く（形式は「コミット」の項目）。
- **TDD**：テストを先に書く（Red → Green → Refactor）。テスト名やコメントに要件IDを入れる。カバレッジは全体80%以上、ドメインロジックは90%以上。→ `testing.md`
- **ブランチと PR**：`main` に直接 push しない。1機能＝1ブランチ＝1PR。→ `git-workflow.md`
- **コミット**：`<type>: <description>`（feat / fix / refactor / docs / test / chore / perf / ci）。`<type>` は英語のまま、`<description>` と本文は日本語で書く（例：`docs: 操作仕様を追加`）。PR のタイトルも `<type>: <description>` の形式にするが、`<description>` は英語で書く（例：`docs: add interaction spec`）。
- **コーディング**：イミュータブルに書く、小さな関数・ファイル、境界での入力検証、export には JSDoc。→ `coding-style.md`
- **セキュリティ**：シークレットをリポジトリ・ログ・PR に書かない（gitleaks で検査）。→ `security.md`
- **画面の変更**：画面が変わるPRには、`pnpm screenshots` で撮った before/after の表を本文に載せる。撮る画面は `tests/screenshots/pages.spec.ts`、画像は `screenshots` ブランチ（main と履歴を共有しない。消さない。ふだんの fetch では取らない）に置く。
- `--no-verify` や force push など、hooks・検査を回避する操作はしない。
- lint や formatter の設定（`.prettierrc`、`.markdownlint.json`、`.yamllint` など）は、指示がない限り変えない。

## コンテンツ

- 1県＝1 YAML。`status` は `draft` → `verified` → `reviewed`。本番には `reviewed` だけを出す。
- ふりがなは `{漢字|よみ}` で書く。
- 出典は、実際に開いて内容を確認できた URL だけを残す。確認できなければ `sources: []`。
- 執筆ルールと文字数は設計書の 7.2・7.3・9.3 章に従う。
