# AGENTS.md

Claude Code と Codex の共通の指示。エージェント向けの指示はこのファイルに書く（`CLAUDE.md` はこのファイルを読み込むだけにする）。細かいことは参照先に書き、ここには毎回要ることだけを書く。

## プロジェクト

- 「ご当地めいぶつ日本地図」：47都道府県の名物・名所を日本地図から探せる Web アプリ（ja / en / zh、こども／おとなモード、ふりがな ON/OFF）。本番は `https://jp-map.vivastack-dev.workers.dev/`。
- 設計・要件・決定事項は [docs/development-overview.md](docs/development-overview.md)。作業の前に関係する章を読み、要件ID（例：`F-MAP-01`）で対応を確かめる。
- タスクの一覧と進み具合は [docs/development-plan.md](docs/development-plan.md)、タスクごとの定義は `docs/tasks/`。着手するときは定義を読み、タスクのID（例：`T0-01`）を PR の本文に書き、終わったら計画の「状態」を直す。進み具合はこのファイルには書かない。
- `CHANGELOG.md` は PR ごとには書かない。マイルストーンの最後のタスクの PR と、公開のときに `[Unreleased]` にまとめて書く。

## 技術スタック

- Next.js 16（App Router、`output: 'export'`、`basePath` なし）＋ TypeScript（strict）。学習データより新しい変更があるので、Next.js のコードを書く前に `node_modules/next/dist/docs/` の該当する章を読み、非推奨の警告に従う。
- 地図：SVG ＋ d3-geo ＋ topojson-client（国土数値情報 N03 2026年版）。配信は Cloudflare Workers（Static Assets）。
- パッケージ管理は **pnpm**（npm・yarn は使わない）。Node.js は `.nvmrc` の版。

## コマンド

スクリプトは `package.json` にある。準備・E2E・Lighthouse CI・GitHub の設定の注意は [docs/development-commands.md](docs/development-commands.md)（スクリプトを足したらそこに足す）。名前で分からないものだけを書く。

```bash
BUILD_TARGET=preview pnpm dev   # 下書き（draft）も表示する（http://localhost:3000/ja/）
pnpm vitest run <ファイル>      # 一部だけ。-t "<要件ID>" でも絞れる。pnpm test はカバレッジの基準も確かめる
pnpm exec wrangler dev          # dist/ を本番と同じ形で配信する（8787番。pnpm build の後）
pnpm test:e2e                   # Playwright（8788番でサーバーを起動する）
pnpm screenshots > <ファイル>   # PRに載せるスクリーンショットを撮り、PR本文の表を出す
```

## ブランチ・PR・デプロイ

- `main` から feature ブランチを切り、PR は `main` 向けに出す。1機能＝1ブランチ＝1PR。`main` に直接 push しない。
- PR ごとに CI（`.github/workflows/ci.yml`）が動く。オーナーが Environment `preview` を承認すると、プレビュー（`https://pr-<番号>-jp-map.vivastack-dev.workers.dev/`）に出る。
- E2E は PR ごとには動かさない。UI・ルーティングを変えたときは、merge の前に手元か `e2e.yml`（手動）で確かめる（D30）。
- 本番へのデプロイは、`main` のコミットを指す `vMAJOR.MINOR.PATCH` の GitHub Release を正式公開し、オーナーが承認する（`deploy.yml`、D50）。手元から `wrangler deploy`・`wrangler versions upload` はしない（障害時の切り戻し〔開発概要書 第13章〕を除く）。

## ディレクトリ

- `@/` は `src/`。`tsconfig.json` と `vitest.config.ts` の2か所で設定している。
- `geo/downloads/`（原データ）はコミットしない。手順は `geo/README.md`。`public/geo/muni/` は `pnpm geo:build` の出力なので、手で直さない。
- `scripts/`・`geo/scripts/` は Node.js で直接実行するので、`enum` など型の除去で消せない書き方を使わず、相対の import に `.ts` を付ける。
- `tests/unit/` は `src/` と同じ構成。`tests/fixtures/content/` は E2E 用のコンテンツで、`CONTENT_DIR` で読む。

## アーキテクチャ

機能ごとの実装メモは `docs/architecture/` にある。**その範囲のコード・テストを変える前に読み**、変えたら更新する。

| ファイル | 範囲 |
|---|---|
| `map.md` | 地図データ・県の描画・操作の結線・拡大縮小・市区町村・ツールチップ・さくいん・キーボード |
| `card.md` | コンテンツの読み込み・本番とプレビューの絞り込み・県のカード・出典・下から出るパネル |
| `i18n-mode.md` | 画面の枠組み・UI文言の辞書・ふりがな・モードの切替・言語の切替とハッシュ・説明のページ |
| `platform.md` | CSP・PWA（Service Worker）・アクセシビリティの検査・対応環境 |

どの作業でも守ること：

- ルートレイアウトは `app/[lang]/layout.tsx`（`app/layout.tsx` は置かない。D27・D28）。404 は `app/global-not-found.tsx` で、`<html lang="ja">` とスタイルの読み込みをこのファイルに書く。
- 言語は ja・en・zh だけを静的に生成する（`dynamicParams = false`）。言語の一覧・判定は `src/i18n/lang.ts`。`params` は `Promise` なので `await` して `isLang()` で確かめ、違えば `notFound()`。
- サーバーで出力した要素は描き直さず、クライアントは属性（`hidden`・`aria-*`・`data-*`）だけを書き換える。カードなどの内容をクライアントコンポーネントに props で渡さない（6.6 (2)）。
- CSP：サーバーの HTML に `style` 属性・`<style>`・`onclick=` などを出さない（見た目は Tailwind のクラスで、クラス名は組み立てずに全体を書く）。`pnpm dev` には CSP がかからないので、`pnpm build` ＋ `wrangler dev` か E2E で確かめる。
- 文言は `src/i18n/ja.ts` に足し、ふりがなの記法で書いて `RubyText` で描く。新しい色の組み合わせは `tests/unit/styles/theme-contrast.test.ts` に足す。
- カバレッジは全体80%以上、ドメインロジック（`src/lib/`・`src/features/`・`geo/scripts/lib/`・`scripts/lib/`）は90%以上。`app/` と async の Server Component は E2E で確かめる。
- E2E：PC だけ・タッチだけのテストはタグ（`@pc`・`@touch`）で書く。操作の前に `data-map-ready`・`data-index-ready`・`data-card-ready` を待つ。
- `next.config.ts` の `agentRules: false` は消さない（消すと `next dev` がこのファイルに書き込む）。

## 開発ルール

詳細は `.claude/rules/`（Codex は `.codex/rules/`）にある。

- **確認事項**：ユーザーに確認や判断を求めるときは、推奨案と理由を付ける。選択肢を並べるだけにしない。
- **言語**：回答・ドキュメント・PR の本文・コミットメッセージは日本語。PR のタイトルだけ英語。
- **コミット・PR のタイトル**：`<type>: <description>`（feat / fix / refactor / docs / test / chore / perf / ci）。コミットの `<description>` は日本語、PR のタイトルの `<description>` は英語。
- **TDD**：テストを先に書く。テスト名やコメントに要件IDを入れる。
- **コーディング**：イミュータブル、小さな関数・ファイル、境界での入力検証、export には JSDoc。
- **セキュリティ**：シークレットをリポジトリ・ログ・PR に書かない（gitleaks で検査）。
- **画面の変更**：画面が変わる PR には、`pnpm screenshots` で撮った after の表を本文に載せる（画像は `screenshots` ブランチ。消さない）。
- `--no-verify` や force push など、hooks・検査を回避する操作はしない。lint・formatter の設定は、指示がない限り変えない。

## コンテンツ

- 1県＝1 YAML。`status` は `draft` → `verified` → `reviewed`。本番には `reviewed` だけを出す。`reviewed` にするのはオーナー。
- ふりがなは `{漢字|よみ}`。出典は、実際に開いて内容を確かめた URL だけを残す（なければ `sources: []`）。
- 書く前に `content/guidelines/writing.md` を読む（設計書の 7.2・7.3・9.3 章）。レビューの基準は `content/guidelines/review-checklist.md`。
- 1県分の①〜④は `gotouchi-content` スキルで行う（Claude Code は `.claude/skills/`、Codex は `.agents/skills/`。検証のエージェントは D22）。
