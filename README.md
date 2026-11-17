# ご当地めいぶつ日本地図

47都道府県の名物・名所を、日本地図から探せる Web アプリ。日本語・英語・中国語（ja / en / zh）で読める。こども向けとおとな向けのモードと、ふりがなの ON/OFF がある。

- 本番：<https://maps.vivastack-dev.workers.dev/>
- 今の状態：地図・県のカード・多言語・モード・PWA・品質の検査（M0〜M4）が終わっている。コンテンツ（名物・名所）はこれから作るので、本番は47県とも「準備中」。進み具合は [docs/development-plan.md](docs/development-plan.md) の第3章にある。

## 必要な環境

- Node.js：`.nvmrc` の版（26）。[nvm](https://github.com/nvm-sh/nvm) で入れる。
- pnpm：`package.json` の `packageManager` の版。corepack で有効にする（npm・yarn は使わない）。
- yamllint 1.33.0：`pnpm lint` が使う（Python 製なので、pnpm では入らない。例：`pipx install yamllint==1.33.0`）。
- Playwright のブラウザ：E2E（`pnpm test:e2e`）を動かすときだけ。入れ方は [AGENTS.md](AGENTS.md) の「E2E の準備」。
- Windows では WSL2（Ubuntu）の中で作業する。

## セットアップ

```bash
git clone https://github.com/vivastack-labs/vivastack-build-maps.git
cd vivastack-build-maps
nvm install                # .nvmrc の版を入れる
npm install -g corepack    # Node.js 25 以降は corepack が同梱されない
corepack enable
pnpm install
git config --add remote.origin.fetch '^refs/heads/screenshots'   # PRの画像のブランチを、ふだんの fetch・pull で取らない
git update-ref -d refs/remotes/origin/screenshots   # clone で取った追跡ブランチを消す
```

## よく使うコマンド

```bash
pnpm dev               # http://localhost:3000/ja/
pnpm lint              # ESLint・Prettier・markdownlint・yamllint
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest（カバレッジの基準を下回ると失敗する）
pnpm build             # 本番用のビルド。out/ を作り、dist/ に組み立てる
pnpm build:preview     # プレビュー用のビルド（下書きの項目も出す）
pnpm exec wrangler dev   # dist/ を本番と同じ形で配信する（http://localhost:8787/ja/。先に pnpm build）
pnpm test:e2e          # Playwright（PC・スマホ・タブレット）
pnpm content:validate  # コンテンツの YAML を検証する
```

ほかのコマンド（地図データの変換、ふりがなの自動付与、サイズの計測、Lighthouse CI など）と、細かい注意は [AGENTS.md](AGENTS.md) の「コマンド」にある。

## 開発の流れ

1. 1タスク＝1ブランチ＝1PR。タスクの定義は `docs/tasks/` にあり、PRの本文にタスクのID（例：`T0-07`）を書く。
2. テストを先に書く（TDD）。カバレッジは全体80%以上、ドメインロジックは90%以上。
3. PR を `main` に向けて出すと、GitHub Actions の CI が動く（`.github/workflows/ci.yml`）。
4. オーナーが Environment `preview` のデプロイを承認すると、プレビュー（`https://pr-<番号>-maps.vivastack-dev.workers.dev/`）に出て、PR に URL がコメントされる。
5. `main` に merge すると、本番に自動で出る（`.github/workflows/deploy.yml`）。**手元から `wrangler deploy` はしない**（障害時の切り戻しを除く。開発概要書の第13章）。

E2E は PR ごとには動かさない。画面やルーティングを変えたときは、merge の前に手元（`pnpm test:e2e`）か、手動の workflow（`e2e.yml`）で確かめる。

規約（コミットメッセージ、コードの書き方、テスト、セキュリティ）は [AGENTS.md](AGENTS.md) と `.claude/rules/` にある。

Codex を使う場合は、[hooks の有効化手順と対応表](.codex/hooks/README.md) に従って `/hooks` で設定を確認・信頼する。Git 操作の保護、編集後の検査、作業情報の保存と音声通知を利用できる。

## ディレクトリ

| パス | 内容 |
|---|---|
| `app/` | ルーティングとページ（Next.js App Router） |
| `src/` | アプリのロジックと部品 |
| `content/` | 都道府県ごとのコンテンツ（YAML）、スキーマ、執筆ルール |
| `geo/` | 地図データの変換（国土数値情報 N03 から TopoJSON を作る） |
| `scripts/` | ビルドと保守のスクリプト |
| `public/` | そのまま配信するファイル（アイコン、地図データなど） |
| `tests/` | 単体テスト、データの検査、E2E |
| `docs/` | 設計書、開発計画、タスクの定義、実装メモ |

全部の表は [AGENTS.md](AGENTS.md) の「ディレクトリ」にある。

## 文書

- [docs/development-overview.md](docs/development-overview.md)：開発概要書（要件・設計・決定事項）
- [docs/development-plan.md](docs/development-plan.md)：開発計画（タスクの一覧・順番・進み具合）
- `docs/tasks/`：タスクごとの定義（目的・実装内容・完了条件・テスト条件）
- `docs/architecture/`：機能ごとの実装メモ（[地図](docs/architecture/map.md)・[カード](docs/architecture/card.md)・[多言語とモード](docs/architecture/i18n-mode.md)・[配信と品質](docs/architecture/platform.md)）
- [docs/device-checklist.md](docs/device-checklist.md)：公開前に実機で確かめる項目
- [content/guidelines/writing.md](content/guidelines/writing.md)・[review-checklist.md](content/guidelines/review-checklist.md)：コンテンツの執筆ルールとレビューの基準
- [AGENTS.md](AGENTS.md)：Claude Code と Codex の共通の指示（コマンド・ディレクトリ・規約）
- [CHANGELOG.md](CHANGELOG.md)：変更履歴

## ライセンス

[MIT License](LICENSE)。コード・文書・コンテンツ（`content/`）が対象。地図データ（`geo/`・`public/geo/`）は、国土数値情報（国土交通省）などを加工して作ったもので、使うときは元のデータの出典の表示が要る（[geo/README.md](geo/README.md) の「出典」）。
