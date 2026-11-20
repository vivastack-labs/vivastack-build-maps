# 開発のコマンド

コマンドの全部と細かい注意を、ここに書く（`package.json` のスクリプトを足したら、ここに足す）。[README.md](../README.md) には、入口として要るものだけを載せる。よく使うものは [AGENTS.md](../AGENTS.md) にもある。

## 準備

Node.js は `.nvmrc` の版（26）を使う。Node.js 25 以降は corepack が同梱されないので、先に `npm install -g corepack` で入れる。

```bash
nvm use
corepack enable
pnpm install
git config --add remote.origin.fetch '^refs/heads/screenshots'   # 初回だけ。PRの画像のブランチを、ふだんの fetch・pull で取らない
```

- `screenshots` ブランチ（PRに載せる画像。main と履歴を共有しない）は、ふつうの `git clone`・`git fetch` ではほかのブランチと一緒にダウンロードされ、PRごとに増えていく。clone の直後に上の `git config` を実行し、すでに取ってしまった追跡ブランチは `git update-ref -d refs/remotes/origin/screenshots` で消す。clone の時点から取らないなら、`git clone --single-branch` で main だけを取り、`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` でほかのブランチを取れるように戻してから、上の `git config` を実行する。
- `pnpm lint` は `yamllint`（Python 製。pnpm では入らない）を使うので、別に入れておく。
- pnpm は、`pnpm-workspace.yaml` の `allowBuilds` で、esbuild・workerd のインストールスクリプトを実行しない設定にしている（本体はプラットフォーム別のパッケージから入るので、なくても動く）。新しい依存にインストールスクリプトがあると `pnpm install` が失敗するので、許すか止めるかを決めて `allowBuilds` に書く。

## コマンドの一覧

```bash
pnpm dev          # http://localhost:3000/ja/（3000番が使用中なら別の番号で起動する）。BUILD_TARGET が未設定なので本番と同じ絞り込み。下書きを見るときは BUILD_TARGET=preview pnpm dev
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
pnpm content:links   # 出典（sources[].url）のリンク切れを確かめて、Markdown のレポートを標準出力に出す（下の「出典のリンク切れ」）
pnpm github:setup   # GitHub の設定を gh api で反映する（下の「GitHub の設定」）
pnpm content:types      # スキーマから型（src/lib/content-schema.generated.ts）を作り直す（スキーマを変えたら実行してコミット）
pnpm size         # dist/ の言語ごとの最初の読み込み（HTML＋JS＋CSS）の圧縮後のサイズを表にする（gzip が 300KB を超えると終了コード 1。先に pnpm build）
node scripts/make-max-content.ts --out <ディレクトリ>   # 47県を 7.3 の上限の文字数で埋めたダミーのコンテンツを作る（コミットしない。CONTENT_DIR=<ディレクトリ> pnpm build の後に pnpm size で測る）
pnpm lhci         # dist/ を Lighthouse CI で測る（下の「Lighthouse CI」）
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

`pnpm test` はカバレッジの基準も確かめるので、一部のテストだけを動かすときは `pnpm vitest run` を使う。

## E2E

- 準備：はじめに `pnpm exec playwright install chromium firefox webkit` でブラウザを入れる。Linux（WSL を含む）では、WebKit・Firefox が使うシステムのライブラリも要る。`sudo env "PATH=$(dirname "$(which node)"):$PATH" pnpm exec playwright install-deps` で入れる（sudo の下でも nvm の Node.js を見つけるため）。
- サーバー：毎回 `CONTENT_DIR=tests/fixtures/content pnpm build`（本物の制作の進み具合で結果が変わらないように、コンテンツはフィクスチャ。開発計画 1.1）をしてから `wrangler dev` を 8788 番で起動する（`dist/` を確かめるため）。`pnpm dev`（3000番）や手で起動した `wrangler dev`（8787番）とはぶつからない。8788 番が使用中だと起動に失敗するので、止めてから実行する。

## Lighthouse CI

`pnpm lhci`（T4-04）は、スマホの設定で `/ja/`・`/en/`・`/zh/`、幅 800px の `/ja/#pref-01` を3回ずつ測る。基準値（5.1）を下回ると終了コード 1。結果は `.lighthouseci/`。

- CI の「Size budget」と同じく、上限のコンテンツで `dist/` を作ってから動かす（最悪の場合を測るため）：`node scripts/make-max-content.ts --out <ディレクトリ>` → `CONTENT_DIR=<ディレクトリ> pnpm build` → `pnpm lhci`。
- 設定は `lighthouserc.yml`（基準値・3言語）と `lighthouserc.tablet.yml`（幅 800px・ハッシュつき。画面の設定は `package.json` の引数）。
- 設定ファイルの `collect.settings` は、コマンドラインや環境変数で `settings.*` を足すとオブジェクトごと置き換わって消える（lhci の仕様）ので、画面の設定をファイルに書かない。
- Chrome は、ふつうの Linux・macOS ではそのまま見つかる。WSL では、chrome-launcher が Chrome に繋がらない。Playwright の Chromium を `--remote-debugging-port` で先に起動し、`LHCI_COLLECT__SETTINGS__PORT` で繋ぐ：`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --headless=new --no-sandbox --remote-debugging-port=9333 --user-data-dir=<一時のディレクトリ> about:blank &` のあとに `LHCI_COLLECT__SETTINGS__PORT=9333 pnpm lhci`。
- 基準値を一時的に厳しくして CI が失敗することを確かめるときは、`lighthouserc.yml` の `assert` の値を変える。

## 出典のリンク切れ

`pnpm content:links`（T5-03）：

- `--pref 26,kyoto` で県を絞る。`--out <ファイル>` でファイルにも書く。コンテンツは `CONTENT_DIR`。
- 同時4件・同じホストへは同時に1件で、前の応答から2秒以上あける。
- リンク切れ（404・410）があれば終了コード 1、引数・コンテンツの誤りは 2。
- ふつうは手動の workflow `link-check.yml` で動かす。外のサイトにリクエストを送るので、手元で試すときは件数に気をつける。

## GitHub の設定

`pnpm github:setup`（T0-05）は、GitHub の設定を `gh api` で反映する。

- 反映する項目：
  - main のルールセット（CI 必須・承認1件・merge をバイパスできるのは admin・オーナーだけ）
  - 本番タグのルールセット（`v*` の作成・更新・削除を admin・オーナーに制限）
  - Environment（production は `v*` タグだけ。どちらもオーナーの承認）
  - Team `maps-reviewers`（Write。実行者はメンバーから外す）
  - Actions の権限（SHA 固定の必須・fork の PR の承認）
  - merge した PR のブランチの自動削除
  - Secret scanning・push protection、脆弱性の非公開の報告・Dependabot alerts
- 既定は確かめるだけ（GET と、今の値と違うものの「送る予定の書き込み」の表示だけ。同じなら「変更なし」）。`--apply` で反映する。何度実行しても同じ結果。
- Team の操作に `gh auth refresh -h github.com -s admin:org` が要る。Secrets は扱わない。
- `scripts/github-settings.ts` を変えたら、merge のあとに `--apply` で反映する（反映しないと、GitHub 上の設定が古いままになる）。
