# AGENTS.md

Claude Code と Codex の共通の指示。エージェント向けの指示はこのファイルに書く（`CLAUDE.md` はこのファイルを読み込むだけにする）。

## プロジェクト

- 「ご当地めいぶつ日本地図」：47都道府県の名物・名所を日本地図から探せる Web アプリ（ja / en / zh、こども／おとなモード、ふりがな ON/OFF）。
- 設計・要件・決定事項は [docs/development-overview.md](docs/development-overview.md) にある。作業の前に関係する章を読み、要件ID（例：`F-MAP-01`）で対応を確認する。
- タスクの一覧・順番・進み具合は [docs/development-plan.md](docs/development-plan.md)、タスクごとの定義（目的・参照仕様・実装内容・完了条件・テスト条件・依存関係）は `docs/tasks/` にある。タスクに着手するときは、その定義を読み、タスクのID（例：`T0-01`）をPRの本文に書く。終わったら「状態」を更新する。
- M2（地図コア。T2-01〜T2-11：地図の描画・操作・拡大・市区町村・ツールチップ・さくいん・キーボード）まで終わり、次は M3（カード・多言語・モード）。地図データ（T1-01〜T1-05：投影法、変換スクリプト、データの検査）と、ふりがなの記法のパーサー（T1-06）、コンテンツのスキーマと検証（T1-07。`pnpm content:validate`）、47県の基本情報（T1-08。`content/prefectures/`。名物・名所は未作成で、T5 で書く）ができている。M0 は手作業の T0-05 と、それに続く T0-06・T0-07（デプロイ）が残っている。アプリの雛形（Next.js・TypeScript・Tailwind CSS・ESLint・Vitest）はある（T0-01）。コンポーネントテストと E2E（Testing Library・Playwright）もある（T0-02）。`dist/` の組み立てと、`wrangler dev` での確認もできる（T0-03）。PRごとに GitHub Actions の CI（`.github/workflows/ci.yml`：lint・typecheck・test・build・gitleaks）が動く（T0-04）。E2E は開発中は PR ごとに動かさず、`.github/workflows/e2e.yml` を手動で実行する（D30）。デプロイはまだない。

## 技術スタック

導入済み：Next.js・TypeScript・Tailwind CSS・ESLint（eslint-plugin-jsdoc を含む）・Prettier・Vitest・Testing Library・Playwright・wrangler・GitHub Actions（PRのチェック）・Dependabot・d3-geo・d3-zoom・d3-selection・d3-transition・mapshaper・topojson-client・polylabel・yaml・ajv・json-schema-to-typescript。それ以外はまだ入っていない（予定）。

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
pnpm dev          # http://localhost:3000/ja/（3000番が使用中なら別の番号で起動する）。BUILD_TARGET が未設定なので本番と同じ絞り込み（本物のコンテンツは名物・名所が未作成で、47県とも「準備中」）。下書きを見るときは BUILD_TARGET=preview pnpm dev
pnpm lint         # ESLint・Prettier・markdownlint・yamllint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest（カバレッジの基準を下回ると失敗する）
pnpm test:e2e     # Playwright（PC・スマホ・タブレットの7プロジェクト。本番用のビルド）
pnpm test:e2e:preview   # プレビュー用のビルドの E2E（chromium だけ。8789番。tests/e2e-preview/。playwright.preview.config.ts）
pnpm build        # BUILD_TARGET=production の next build で out/ を作り、scripts/postbuild.ts で dist/ にコピーする
pnpm build:preview   # BUILD_TARGET=preview（すべての項目を `draft` の値を付けて出す。カードの項目に「下書き」の印。noindex つき）。レビュー用のプレビューに使う（T3-02）
pnpm exec wrangler dev   # dist/ を本番の Workers と同じ形で配信する（http://localhost:8787/ja/。先に pnpm build）
pnpm content:validate   # コンテンツの YAML を検証する（誤りで終了コード1。CONTENT_DIR で読むディレクトリを変える）
pnpm content:types      # スキーマから型（src/lib/content-schema.generated.ts）を作り直す（スキーマを変えたら実行してコミット）
pnpm geo:build    # 地図データを作り直す（年1回、手で実行。原データの取得は geo/README.md。毎回のビルドでは動かさない）

pnpm vitest run tests/unit/i18n/lang.test.ts   # 1ファイルだけ動かす（カバレッジなし）
pnpm vitest run -t "F-I18N-01"                 # テスト名で絞る（テスト名に要件IDが入っている）
pnpm vitest run --project data                 # データの検査（tests/data/）だけを動かす
pnpm test:e2e --project=chromium               # E2E を1プロジェクトだけ動かす
gh workflow run e2e.yml --ref <ブランチ> -f project=all   # CI で E2E を手動で動かす（UI・ルーティングを変えたPRは merge の前に）
pnpm screenshots > <ファイル>   # PRに載せる after（今の作業ツリー）のスクリーンショットを撮り、screenshots ブランチに push して、PR本文の表を出す
```

`screenshots` ブランチ（PRに載せる画像。main と履歴を共有しない）は、ふつうの `git clone`・`git fetch` ではほかのブランチと一緒にダウンロードされ、PRごとに増えていく。clone の直後に上の `git config` を実行し、すでに取ってしまった追跡ブランチは `git update-ref -d refs/remotes/origin/screenshots` で消す。clone の時点から取らないなら、`git clone --single-branch` で main だけを取り、`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` でほかのブランチを取れるように戻してから、上の `git config` を実行する。

`pnpm test` はカバレッジの基準も確かめるので、一部のテストだけを動かすときは `pnpm vitest run` を使う。`pnpm lint` は `yamllint`（Python 製。pnpm では入らない）を使うので、別に入れておく。

E2E の準備：はじめに `pnpm exec playwright install chromium firefox webkit` でブラウザを入れる。Linux（WSL を含む）では、WebKit・Firefox が使うシステムのライブラリも要る。`sudo env "PATH=$(dirname "$(which node)"):$PATH" pnpm exec playwright install-deps` で入れる（sudo の下でも nvm の Node.js を見つけるため）。

E2E のサーバーは、毎回 `CONTENT_DIR=tests/fixtures/content pnpm build`（本物の制作の進み具合で結果が変わらないように、コンテンツはフィクスチャ。開発計画 1.1）をしてから `wrangler dev` を 8788 番で起動する（`dist/` を確かめるため）。`pnpm dev`（3000番）や手で起動した `wrangler dev`（8787番）とはぶつからない。8788 番が使用中だと起動に失敗するので、止めてから実行する。

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
- 都道府県の地図の描画（T2-04、D24）：`src/features/map/prefPaths.ts`（`loadPrefPaths()`。ビルド時だけ）が `geo/data/prefs.topo.json` を SVG のパスと県名ラベルの位置にし、`JapanMap`（サーバーコンポーネント）が HTML に埋め込む。`viewBox` の外に出る島は形から除く（U16、D36）。県名ラベルは「都・府・県」を省き、重なる県は `LABEL_OFFSETS`（言語ごと）でずらす（文字の大きさ `LABEL_FONT_SIZE` も言語ごと）。ラベルの配置を変えたら `tests/e2e/map.spec.ts`（重なりの検査。chromium）で確かめる。色は `app/globals.css` の `@theme` の `--color-region-*`・`--color-map-*`（ダークは `prefers-color-scheme` で上書き）。クラス名は `src/features/map/regions.ts` に全体を書く（Tailwind が組み立てたクラス名を拾えないため）。
- ふりがなの記法 `{漢字|よみ}`（7.2）：`src/lib/ruby.ts` の `parseRuby`（誤りがあれば例外）・`checkRuby`（誤りと警告の一覧）・`plainText`（読みを除く）と、`<ruby>` を描く `src/components/RubyText.tsx`。`dangerouslySetInnerHTML` は使わない。
- UI文言の辞書（6.2 D28）：`src/i18n/ja.ts`（基準）・`en.ts`・`zh.ts`。`getMessages(lang)`（`src/i18n/messages.ts`）で引く。文言を足すときは `ja.ts` に書くと、`en.ts`・`zh.ts`（`satisfies Messages`）はキーが足りなければ typecheck で落ちる。日本語はふりがなの記法つきで書き、`RubyText` で描く（`aria-label` など属性は `plainText()` で読みを除く）。こども向け・おとな向けで言い方を変える文は `{ kids, adult }` にして、`ModeText` で両方を出す（表示の切替は T3-05 の CSS）。数は `formatNumber(lang, value)`。フォントは `app/globals.css` の `--font-sans` を `:root:lang()` で言語ごとに切り替える（D27）。
- 画面の枠組み（4.11.7、T2-03）：`Header`（サイト名の `<h1>`）・`Footer` は `app/[lang]/layout.tsx` に置き、`<title>` も `generateMetadata` で出す。地図・カード・さくいん（`MapArea`・`CardArea`・`IndexArea`）は `app/[lang]/page.tsx` に置く。各領域は `data-area` で見分け、1024px以上で地図とカードが2列、それより狭いと1列。ランドマークは `header`・`main`・`footer` の3つだけにする（領域の `section` に `aria-label` を付けない）。
- 操作の結線（T2-05。F-CARD-01・07、F-ZOOM-04、4.11.1〜4.11.3）：`app/[lang]/page.tsx` が `<main>` の中を `MapStateProvider`（`src/components/`。DOM を出さない）で包み、`useReducer(mapReducer)` の状態と `dispatch` を Context（`useMapState()`）で配る。サーバーで出力した要素は描き直さず、クライアントは属性だけを書き換える（6.6 (2)）。
  - `MapInteraction`（地図の `<svg>` を包む）：`pointerover`・`pointerout`・`click`・`dblclick` をまとめて受け、`src/features/map/pointer.ts` の `toMapEvent`（タッチはホバーとダブルタップを使わない。`click`・`dblclick` は直前の `pointerdown` の `pointerType` を使う）で `MapEvent` にする。状態は `mapDom.ts` の `applyPrefState` が県のパスの `aria-pressed`（固定中だけ `true`）・`data-state`（`pinned`／`maximized`）に書く。見た目は `aria-pressed:` のバリアントと `--color-map-selected`。マウントすると `data-map-ready` が付くので、E2E は操作の前にこれを待つ（ハイドレーション前の操作は失われる）。
  - `CardSwitch`（カードの中身を包む）：`applyCardState` が `[data-card-pref]` の `hidden` を切り替え、`[data-card-guide]`（案内文）は県がないときだけ見せる。カードの中身は `PrefCard`（下の「県のカード」）。
  - E2E は `tests/e2e/interaction.spec.ts`。県の要素の扱い（`PrefTarget`：`locate`〔県の要素を引く関数〕と、最大化中の県のクリック・ダブルクリック）を受け取る形で、地図とさくいん（T2-10）の両方で同じテストを回す。ホバー・クリックの対象は、外接矩形の中心が自分の形の中にある長野県（20）・岐阜県（21）（東京都は島を含むので中心が海になる）。
- 拡大・縮小・移動（T2-06。F-ZOOM-01〜05、4.11.2・4.11.3）：`MapArea` が `MapInteraction` を `MapZoom`（`src/components/`）で包む。d3-zoom を `<svg>` に付けて操作（ホイール・ピンチ・ドラッグ。ダブルクリックでの拡大は無効、`clickDistance(3)`）を受け、`<g data-map-layer>` の `transform` と `data-zoom-scale`（倍率。E2E が読む）だけを書く（海の矩形は動かない）。「＋」「−」「全体」のボタンは `MapInteraction` の外（クリックが海のクリックにならないように）に重ねる。計算は `src/features/map/viewport.ts` の純粋関数（`fitTransform`・`scaleExtent`・`stepScale`・`panExtent`・`constrainTransform`）。最大化した県（`useMapState()` の `maximized`）に寄り、最大化中は倍率を「県が収まる倍率」〜「その4倍（8 以上）」にする。県の範囲は `prefPaths.ts` がビルド時に求める（`fitBounds`：寄る範囲。東京都は北緯28度より南の父島などを除く `FIT_EXCLUDE_SOUTH_OF`。`panBounds`：移動できる範囲。県のすべてのポリゴン）。`prefers-reduced-motion: reduce` のときは d3-transition を使わず同期で動かす（F-ZOOM-05）。最大化すると県が海の矩形の上を覆うので、E2E で最大化中に海をクリックするときは、海の矩形へ `dispatchEvent('click')` を送る。層には CSS 変数 `--zoom-k`（倍率）も書き、県境の線の太さ・県名ラベル・海域名の文字の大きさは `calc(基準 / var(--zoom-k, 1))`（`JapanMap` の `zoomInvariant`）で、拡大しても画面の上の大きさを保つ（`vector-effect` は倍率1の太さが変わるので使わない）。
- 市区町村データの読み込み（T2-07。F-MUNI-05、4.11.5）：`src/features/map/muniLoader.ts` の `createMuniLoader({ fetch, isOnline, setTimeout, clearTimeout, fetchTimeoutMs? })`（DOM・React を使わない純粋な部品。テストで置き換える）が、県を最大化したときだけ `/geo/muni/NN.topo.json` を読む。`load(code, onStatus)` は `loading` →（300ms を超えたら `slow`）→ `loaded`（検証を通った `MuniTopology`）・`failed`（`reason`：`network`・`http`・`invalid`）・`offline`（fetch の失敗で `navigator.onLine` が `false`）の順に通知する。1回の読み込みは `AbortController` で15秒（`FETCH_TIMEOUT_MS`）を上限にし、超えたら fetch の失敗と同じく `network`・`offline` に分ける。成功だけをメモリに残し、読み込み中の同じ県は1回にまとめ、失敗は残さない（自動では再試行しない。「再試行」で呼び直す）。検証は `type`・`arcs`・`objects.municipalities`・`geometries` が空でないこと・各要素の `code`（県コードで始まる5桁の数字）・`name.ja`・`name.en`・`kana`・`cityName`（なしか文字列）だけ（各要素の `type`・`arcs` と座標は見ない）。アプリで1つの既定のインスタンス `muniLoader` を使う（T2-08 の地図とカードの一覧が同じキャッシュを使う）。`useMuniData(pref, loader?)`（`src/components/`）が `maximized` の県を読み込み、`{ status, isRetrying, retry }` を返す（別の県・解除後の古い通知は使わず、effect の後始末で前の状態を捨てる。T2-08 は `status.kind === 'loaded'` の `data` から描く）。`MuniStatus`（`MapArea` が `MapInteraction` の外に置く）が、地図の箱の左上に文言と「再試行」を出す。再試行の読み込み中は、ボタンを消さずに `aria-disabled="true"` にしてクリックを無視する（`disabled` や消すとフォーカスが外れるため）。型の名前は `MuniLoadStatus`（コンポーネント `MuniStatus` と区別する）。`<p role="status" aria-live="polite">` は最初から DOM に置き、300ms を超えたときだけ「読み込み中」を入れる。外側の `data-muni-status`（`loading`・`slow`・`loaded`・`failed`・`offline`。最大化していなければ属性なし）を E2E と T2-08 が読む。最大化は読み込みを待たない（`mapReducer`・`MapZoom` は読み込みを知らない）。E2E は `tests/e2e/muni.spec.ts`（`page.route('**/geo/muni/*.topo.json', …)` で応答を変える。オフラインは `context.setOffline`）。
- 市区町村の描画（T2-08。F-MUNI-01〜04、4.11.6、F-I18N-05）：`src/features/map/muniShapes.ts` の `muniShapes(data, 県コード)`（DOM・React を使わない）が、検証済みの `MuniTopology` から、市区町村ごとの `d`・濃淡 `shade`（0〜4。隣り合うものが同じにならない。Welsh–Powell）・ラベルの置き場所 `label`（いちばん大きなポリゴンの `polylabel` の点 `x`・`y` と、その点を通る水平・垂直の線が形の内側にある長さ `width`・`height`。外接矩形ではない。凹んだ形ではみ出さないため）と、県の外周の線 `outline`（`mesh` の `a === b`）を作る。投影は `createProjection(県コード)` だけ。形が壊れていれば例外にせず `null`（`invalid` の失敗にする）。結果は `WeakMap`（キーは `MuniTopology`）に覚え、同じデータは1回だけ計算する。パスの座標は小数2桁（`pathContext.ts` の 0.1 単位は、最大の倍率で角が目立つので使わない）。変換は北海道で初回約 90ms・2回目以降約 50ms かかる。`cachedMuniShapes(data, 県コード)` は、計算済みの結果だけを返す（計算しない。なければ `undefined`）。`useMuniShapes(pref, loader?)`（`src/components/`。`useMuniData` を包む）は、描画の中では変換せず、読み込めたあとの effect から `setTimeout(0)` で変換し、終わるまでは `loading` のまま返す（計算済みのデータは待たずに使う。県の切り替え・解除・アンマウントで待ちを止める）。変換に失敗すれば `failed`（`invalid`）にする。`data-muni-status="loaded"` は変換が終わった後なので、E2E は `toHaveCount` などの自動の再試行で待つ。`MuniStatus`・`MuniLayer`・`MuniList` が各自で呼ぶ（読み込みは `muniLoader` のキャッシュで1回、変換は `WeakMap` で1回）。
  - `MuniLayer`（`MapArea` が `JapanMap` の `children` として渡し、`<g data-map-layer>` の最後＝県名ラベルの上に出る）：`<g data-muni-layer data-muni-pref="NN" aria-hidden="true">` に、`<path data-muni="NNNNN" data-shade>`・`<path data-muni-outline>`・`<g data-muni-labels>`（`<text data-muni-label data-min-scale>`）。県のパスは描き直さない。最大化した県の形（1km）は下に残す（所属未定地が穴にならない）。市区町村にフォーカスは当てない（`aria-hidden`。名前はカードの一覧で確かめる）。色は `app/globals.css` の `--color-muni-0`〜`4`・`--color-muni-hover`・`--color-muni-border`、クラス名は `regions.ts` の `MUNI_SHADE_CLASS`。マウスをのせた強調は CSS の `hover:`（タッチでは効かない）。
  - ラベル（`src/features/map/labels.ts`、純粋関数）：文字の大きさは画面の上で一定（`--zoom-k` で割る）なので、倍率 `k` の箱は「推定の幅 ÷ k」。倍率の段（1〜128、約1.19倍ずつ。拡大の上限は県が収まる倍率の4倍で、佐賀県で約95）を下から順に、面積の大きい順に「外接矩形に入る・選んだものと重ならない」ものを足し、各ラベルに `minScale`（出はじめる倍率）を付ける。倍率を上げると箱は縮むので、前の段の選択は残り、数は減らない。幅の推定は日本語・中国語が1字＝1倍、英語が0.6倍（DOM を使わない）。倍率の変化には、`MuniLayer` が祖先の `[data-map-layer]` の `data-zoom-scale` を `MutationObserver` で見て、`applyLabelVisibility`（`mapDom.ts`）でラベルの `visibility` だけを書く（`MapZoom` は変えない）。区は区名だけ（ja「中央区」、en「Chuo-ku」）、zh は日本語の漢字表記で `lang="ja"`。幅820px以下では隠す（`max-map-label:hidden`）。
  - 操作：`prefFromTarget`（`pointer.ts`）は `[data-muni-pref]` の祖先からも県コードを引くので、市区町村の上のダブルクリックは「同じ県なら元に戻す」（4.11.2）。最大化中は、`applyPrefState` が `MapInteraction` の根に `data-map-maximized`（県コード）を書き、県のパスはそれと `group/map` で、最大化した県以外の不透明度を 0.4 にする。最大化した県の県名ラベルは、`data-state="maximized"` で隠す。
  - `MuniList`（`CardArea` の `CardSwitch` の下）：最大化中で読み込めたときだけ `<details data-muni-list>`（「市区町村の一覧（194）」。文言は辞書の `muni.listSummary`）。見出しの件数は辞書の `muni.listSummary` の `%n` に `fillCount`（`src/i18n/format.ts`）で入れる（括弧は言語ごとに辞書に書く）。項目は `code` の順の `<li data-muni-item>`で、ja・zh は `name.ja`（zh は `lang="ja"`）、en は `name.en`（区は市名を含む）。
  - 中国語のページの日本語の字形：`app/globals.css` の `--font-ja` を `:root:lang(ja)` の `--font-sans` と、`:root:not(:lang(ja)) [lang='ja']` の `font-family` で使う。
  - E2E：`tests/e2e/muni-render.spec.ts`。最大化した県の上には市区町村の形が重なるので、最大化中の県を `locator.dblclick()` で戻すと「ほかの要素がクリックを受ける」で止まる。`tests/e2e/helpers.ts` の `dblclickAtCenter`・`clickAtCenter`（寄る動きが止まるのを待ってから、外接矩形の中心の座標を押す）を使う。
  - 仕様の制限：県境の数px（市区町村の簡略化は 100m、県の形は 1km で、最大約1kmずれる）では、最大化中に隣の県をダブルクリックしたつもりでも、最大化した県の市区町村の形が受けて、元に戻る（隣の県への切り替えにならない）。最大化した県の外周の線の外側（隣の県の形のある側）をダブルクリックすれば、切り替わる。凹んだ形の内側の点は、`isPointInFill` で探す。
- ツールチップ（T2-09。F-TIP-01・02、4.11.2・4.11.3・4.11.4）：`MapArea` が `[data-map-box]` の中、`MapInteraction` の外（`MuniStatus` と同じ場所）に `MapTooltip`（サーバー）を置く。`MapTooltip` が47県ぶんの `<div data-tip-pref="NN" hidden>`（県名と名物の名前の `<ul>`。名物がない県は県名だけ。解説文・絵文字は出さない。`RubyText`）を出力し、`Tooltip`（クライアント。`children` で受ける）が `hidden`（`mapDom.ts` の `applyTipState`）と位置（`transform`）だけを書く（6.6 (2)）。`Tooltip` は effect で親の `[data-map-box]` に `pointerover`・`pointermove`・`pointerdown`・`pointerleave` を付け（`MapInteraction` は変えない）、マウスの下の要素の `data-pref`・`data-muni`・`pointerType`・`buttons` を状態に持つ（同じ値なら変えない。位置は動きのたびに `transform` だけを書く）。ルートは `aria-hidden`・`pointer-events-none`（同じ情報はカードと「市区町村の一覧」で読める）。色は `app/globals.css` の `--color-tooltip-*`（仮）。
  - 規則は `src/features/map/tooltip.ts`（純粋関数）。`tooltipTarget`：タッチ・ボタンを押している間は出さない（マウスとペンで出す。カードのホバーと同じ）。最大化していなければ県の上でその県（固定中も同じ）、最大化中は最大化した県の市区町村の上だけ（ほかの県・市区町村のない所は出さない）。属性の値は県コード・5桁の市区町村コードの形を確かめる。`muniTooltipText`：ja は `name.ja`（区は「札幌市中央区」）と、その下の行に `kana`（`data-tip-reading`。ふりがなの ON/OFF に関係なく常に出す）、en は `name.en`、zh は `name.ja`（`lang="ja"`）で読みなし。`tooltipPosition`：マウスの右下 12px、はみ出すなら左・上に反転、それでもはみ出すなら箱の内側に寄せる。
  - 市区町村の名前は `useMuniShapes(maximized)` の `shapes.shapes[].properties` を `data-muni` の `code` で引く（`MuniStatus`・`MuniLayer`・`MuniList` と同じキャッシュ）。
  - 本番の `reviewed` の絞り込みは T3-02（`publish.ts`）：`MapTooltip` に結果の県を渡しているので、準備中の県は名物がなくなり、県名だけになる。プレビューの「下書き」の印はツールチップには付けない。
  - E2E は `tests/e2e/tooltip.spec.ts`（フィクスチャのコンテンツ。北海道＝名物3つ、沖縄県＝名物なし、札幌市中央区）。マウスの位置は `page.mouse` で、形の内側の点（`helpers.ts` の `settledPoint(locator)`。`isPointInFill`）に動かす。Firefox・WebKit は `page.mouse` の座標を整数に切り捨てるので、`settledPoint` は整数にしても形の中にある点を返す。動きが止まったかは 250ms の間隔で2回測って判断する（続けて測ると、WebKit で動きの途中の点を返す）。
- 県名さくいん（T2-10。F-IDX-01〜03、4.11.2、6.6 (2)）：`IndexArea` が見出し（h2）の下に、`PrefIndexInteraction`（クライアント。`MapInteraction` と同じ形で、`pointerover`・`pointerout`・`click`・`dblclick` をまとめて受ける）で包んだ `PrefIndex`（サーバー）を置く。`PrefIndex` は8地方（`REGIONS` の順）ごとに h3（辞書の `regions`。色見本は `aria-hidden`）と県名の `<ul>` を出す。
  - 項目は `<a href="#pref-NN" role="button" tabIndex={0} aria-pressed="false" data-pref="NN">`。JavaScript がないときはリンクとして動き、ハッシュが `#pref-NN` になる（JavaScript がないときの `:target` でのカードの表示は T3-03 で済み〔下の「県のカード」〕、`replaceState` は T3-07）。仕様が「県名ボタン」なので `role="button"`（`aria-pressed` はリンクには付けられない）。`tabIndex={0}` は Safari が既定ではリンクに Tab で止まらないため。`data-pref` があるので、状態の書き換えは地図と同じ `applyPrefState`、県の引き当ては `prefFromTarget`。固定中は `aria-pressed:` で `--color-map-selected` の背景・文字 `text-slate-950`。
  - 項目の外（項目の間・見出し）のクリックは無視する（`backgroundClick` にしない。固定が外れない）。項目のクリックは `preventDefault`（リンクの移動を止める）。マウントすると `data-index-ready` が付くので、E2E は操作の前にこれを待つ。
  - キーボード：規則は `src/features/map/keyboard.ts` の `keyToMapEvent({ key, shiftKey, pref })`（Enter・Space＝`click`、Shift + Enter＝`doubleClick`。純粋関数で、T2-11 の地図でも使う）。キー操作は DOM の `click` を経由せず、`keydown` で `preventDefault`（Enter のリンクの移動・Shift + Enter の新しいウィンドウ・Space のスクロールを止める）して `dispatch` に直接渡す。Ctrl・Meta・Alt つきとキーの繰り返しは無視する。キーボードのフォーカス（`:focus-visible`）＝ホバー（タップのフォーカスではホバーしない）。フォーカスが外れたら `hoverEnd`（別の項目へ移るときは、移った先のホバーに任せる）。
  - E2E は `tests/e2e/index.spec.ts`（8地方の見出し・Tab で47県を順にたどる・キーボード・JavaScript なしのハッシュ）と、`interaction.spec.ts`（地図とさくいんで同じテスト）。状態は地図のパスとさくいんの項目の両方で確かめる（`expectState`）。さくいんは地図の下にあるので、座標で押す `clickAtCenter` は使わず `locator.click()` を使う。
- キーボード操作（T2-11。F-KB-01〜05、4.11.2・4.11.6、WCAG 2.1.1・1.4.13・2.4.7）：`MapInteraction`（地図）と `PrefIndexInteraction`（さくいん）の結線は、共通のフック `src/components/usePrefInteraction.ts`（ポインター・フォーカス＝ホバー・キー・`data-*-ready`・`applyPrefState` の effect。Ctrl・Meta・Alt つきとキーの繰り返しは無視）。`dispatchKey` が `keyToMapEvent` の結果を `preventDefault` してから `dispatch` に渡す。
  - 規則は `src/features/map/keyboard.ts` の純粋関数。`keyToMapEvent`（Esc は県がなくても `escape`。地図・さくいんとも）、`navigateKey({ key, pref })`（←↑ 前・→↓ 次・Home 北海道・End 沖縄県。端で止まる）、`zoomKey(key)`（`+` `-` `0`。Shift は見ない）、`rovingPref({ focused, pinned })`（Tab の停止位置：フォーカス中 → 固定中 → 北海道）。
  - roving tabindex：サーバーの出力（`JapanMap` の `PrefShape`）で北海道だけ `tabIndex={0}`、ほかは `-1`。`MapInteraction` が `focused`（地図の県にフォーカスがある間）を持ち、`applyRovingTabIndex`（`mapDom.ts`）で `tabindex` の属性だけを書く。地図の外では「固定中の県、なければ北海道」。矢印・Home・End は `keydown` で `preventDefault` し、移った先の県のパスへ `focus()` する（ホバー＝カードは、`:focus-visible` のときの focus の処理に任せる）。最大化中も移れる。
  - `+` `-` `0` は `MapZoom` の `MapZoomContext`（`useMapZoom()` が `{ step(direction), reset() }`。`MapZoom` の外では `null`）で、ボタンと同じ関数を呼ぶ（動きを減らす設定と、動きの途中の「＋」の目標が同じになる）。県のパスにフォーカスがあるときだけ。
  - Esc でツールチップを隠す：`Tooltip` が `document` の `keydown` で `hit` を捨てる（次にマウスが動くまで）。状態の解除は、地図・さくいんにフォーカスがあるときだけ。
  - フォーカスの枠：県のパスの `focus-visible:outline-solid`（太さは `calc(4px / var(--zoom-k, 1))`。`JapanMap` の `PREF_FOCUS_CLASS`）。地図の箱 `[data-map-box]` は `overflow-clip`。
  - 「再試行」が成功してボタンが消えたら、押したときにフォーカスがボタンにあった場合だけ、最大化した県のパスへフォーカスを戻す（`MuniStatus`。`useRestoreFocusAfterRetry`）。
  - E2E は `tests/e2e/keyboard.spec.ts`（PC のプロジェクトだけ。`tabIntoMap` で Tab を押して地図に入る）と、`index.spec.ts`（さくいんの Esc）。倍率は層の `data-zoom-scale` で読む。
- 東京からの距離（T3-01。F-CARD-03、7.5）：`src/lib/distance.ts`（純粋関数）の `distancesFromTokyo(prefectures)` が、県の `capital` の緯度経度から、東京都庁（code `"13"`）からのハバーサイン距離（半径 6,371km）を10km 単位に丸めて、県コード → km の `Map` にする（東京都がなければ例外）。`app/[lang]/page.tsx` がビルド時に1回だけ求めて `CardArea` に渡し、`distanceText(lang, km)`（辞書の `card.distance`。`RubyText` で描く）で `<p data-card-distance>` に出す。東京都（`TOKYO_CODE`）のカードは基準の点なので、距離の行を出さない（F-CARD-03 は東京都庁から県庁所在地まで。`distancesFromTokyo` は東京都に 0 を返す）。`PrefCard` に移してある（T3-03）。`distanceText` は `src/i18n/cardText.ts`（`distance.ts` は計算だけ）。
- 県のカード（T3-03。F-CARD-02〜06・08、4.11.4・4.11.7、F-MODE-04、6.6 (2)・D24）：`CardArea` が `CardSwitch` の中に、`PrefCard`（`src/components/`。サーバーコンポーネント。フックなし）を47県ぶん出す。`<article id="pref-NN" data-card-pref="NN" hidden>`：地方名（`data-card-region`）・県名の `<h2 data-card-name>`・県庁所在地（`data-card-capital`）・距離（`data-card-distance`。`distanceKm` が `null` の東京都は出さない）・行き方（`data-card-access`。絵文字は `aria-hidden`。所要時間は `data-card-duration`）・名物（`data-card-specialties`）・名所（`data-card-spots`。絵文字は任意）の `<h3>` と `<li data-card-item>`・最大化ボタン。`pending` の県は、行き方・名物・名所の代わりに `<p data-card-coming-soon>`（`ModeText`）。`draft` の項目には `<span data-card-draft>`。解説文は `ModeText`（こども向け・おとな向けの両方。片方を隠すのは T3-05）。文字はすべて `RubyText`。文の組み立ては `src/i18n/cardText.ts`（`distanceText`・`durationText`。日本語の「分」は数に合わせて「ふん」「ぷん」）。
  - `CardSwitch`：根に `data-card-switch`、マウントすると `data-card-ready` を付け、最大化ボタン（`<button data-card-maximize="NN" hidden>`。JavaScript なしでは動かないので `hidden` で出力する。「準備中」の県にも出す）の `hidden` を外す。クリックは根の `onClick` で受け、県コードの形を確かめて `doubleClick` を送る（4.11.2 の列が、最大化＋固定／同じ県なら元に戻す〔固定は残す〕と同じ。`mapReducer` は変えない）。`applyCardState(root, pref, maximized)` が最大化中の県のボタンだけ `[data-label-restore]` を見せる。
  - JavaScript がないとき：`app/globals.css` の `@layer card-target`（Tailwind より前に宣言したレイヤー）に、`[data-card-switch]:not([data-card-ready]) [data-card-pref]:target { display: block !important }`。preflight の `[hidden] { display: none !important }` は `@layer base` の中で、!important はレイヤーでは先に並べたものが勝つので、レイヤーなしや後ろのレイヤーでは勝てない。`:has()` で案内文も隠す。
  - HTML の大きさ：サーバーコンポーネントの結果は、HTML の本体と RSC のデータ（`<script>self.__next_f.push`）に1回ずつ入る（止める設定はない。地図のパスも同じ）。クライアントコンポーネントに内容を props で渡すと3回目ができるので渡さない。`MuniList` は47枚のカードの中に入れず、`CardSwitch` の外に1つだけ置く。
  - E2E は `tests/e2e/card.spec.ts`（フィクスチャ。内容の文字はふりがなのない英語のページで比べる。JavaScript なし・D24 の出現回数を含む）と、プレビューの「下書き」の印（`tests/e2e-preview/preview.spec.ts`）。スクリーンショットは `{lang}-card`（北海道）。
- コンテンツ（7.1）：ビルドでは `src/lib/content.ts` の `loadContent()`（誤りがあれば例外。県を `code` の順に返す）を使い、検証は `validateContent()`（誤り・警告をすべて返す）。どちらも `CONTENT_DIR`（既定は `content/prefectures/`）を読む。`scripts/` から Node.js で直接読み込むので、`src/lib/` の相対の import には `.ts` を付ける。本番の `reviewed` だけの絞り込みは `publish()`（下の T3-02）。
- 本番・プレビューの絞り込みと「準備中」（T3-02。7.1・4.11.4、R1・R4）：環境変数 `BUILD_TARGET`（`production`／`preview`）を `src/lib/publish.ts` の `buildTarget()` が読む（未設定・空は `production`、それ以外は例外）。`pnpm build` は `production`、`pnpm build:preview` は `preview`（`package.json` で明示する）。`pnpm dev` は未設定＝本番と同じ。
  - `publish(loadContent(), buildTarget())`（純粋関数。`app/[lang]/page.tsx` がビルド時に1回だけ呼ぶ）が `PublishedPrefecture[]` を返す。地図・カード・さくいん・ツールチップの props はこの型なので、`loadContent()` の結果を直接渡すと typecheck で落ちる（絞り込みの通し忘れを防ぐ）。本番：`isComplete`（行き方があり、名物・名所が1件以上あり、すべて `reviewed`）の県だけ内容を出し、そうでない県は `pending: true` で、`specialties: []`・`spots: []`・`access` なし（基本情報の県名・県庁だけ残す。項目を1つずつ書いているので、スキーマに必須の項目が増えれば型で落ち、省ける項目が増えても除かれる＝漏れない側）。プレビュー：すべて出し、`reviewed` でない項目に `draft: true`、`pending` は常に `false`。入力は変えない。
  - 表示（`pending` の県）：地図は `JapanMap` の `<defs>` の `<pattern id="pref-pending-hatch">` で斜線に塗り（`regions.ts` の `PENDING_FILL_CLASS`・`PENDING_PATTERN_ID`。色は `globals.css` の `--color-map-pending`・`--color-map-pending-stripe`）、`data-pending` と `aria-label` の「（準備中）」を付ける。凡例（`MapLegend`）は `pending` の県が1つ以上あるときだけ最後に `<li data-legend-pending>`（色見本は `globals.css` の `@utility bg-pending-hatch`）。さくいんは県名の後ろに `<span data-index-pending>`。ツールチップは名物が空なので県名だけ。文言は辞書の `comingSoon.label`・`comingSoon.indexSuffix`。カードの「準備中」の文と「下書き」の印は `PrefCard`（T3-03。下の「県のカード」）。
  - `noindex`：プレビューのときだけ `app/[lang]/layout.tsx` の `generateMetadata` が `robots: { index: false }` を返す。404（`global-not-found`）の `noindex` は Next.js が常に付ける（本番にも付く）ので、何もしない。
  - E2E：本番用は `tests/e2e/pending.spec.ts`（フィクスチャ。HTML に東京都の `reviewed` でない項目の文が出ないことも確かめる）。プレビュー用は `tests/e2e-preview/preview.spec.ts`（`pnpm test:e2e:preview`。`playwright.preview.config.ts`。`out/`・`dist/` が本番用のビルドとぶつかるので、設定を分けている。レポート・trace は `playwright-report-preview/`・`test-results-preview/` に出す）。`e2e.yml` は `all`・`chromium` のときに続けて動かす。E2E のフィクスチャでは、北海道以外の46県が「準備中」になるので、塗りの色を比べるテストは北海道を使う（東京都は斜線）。
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
- **画面の変更**：画面が変わるPRには、`pnpm screenshots` で撮った after の表を本文に載せる（before は前のPRの after で見られるので撮らない）。撮る画面は `tests/screenshots/pages.spec.ts`、画像は `screenshots` ブランチ（main と履歴を共有しない。消さない。ふだんの fetch では取らない）に置く。
- `--no-verify` や force push など、hooks・検査を回避する操作はしない。
- lint や formatter の設定（`.prettierrc`、`.markdownlint.json`、`.yamllint` など）は、指示がない限り変えない。

## コンテンツ

- 1県＝1 YAML。`status` は `draft` → `verified` → `reviewed`。本番には `reviewed` だけを出す。
- ふりがなは `{漢字|よみ}` で書く。
- 出典は、実際に開いて内容を確認できた URL だけを残す。確認できなければ `sources: []`。
- 執筆ルールと文字数は設計書の 7.2・7.3・9.3 章に従う。
