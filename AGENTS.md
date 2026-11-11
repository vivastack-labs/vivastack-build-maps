# AGENTS.md

Claude Code と Codex の共通の指示。エージェント向けの指示はこのファイルに書く（`CLAUDE.md` はこのファイルを読み込むだけにする）。

## プロジェクト

- 「ご当地めいぶつ日本地図」：47都道府県の名物・名所を日本地図から探せる Web アプリ（ja / en / zh、こども／おとなモード、ふりがな ON/OFF）。
- 設計・要件・決定事項は [docs/development-overview.md](docs/development-overview.md) にある。作業の前に関係する章を読み、要件ID（例：`F-MAP-01`）で対応を確認する。
- タスクの一覧・順番・進み具合は [docs/development-plan.md](docs/development-plan.md)、タスクごとの定義（目的・参照仕様・実装内容・完了条件・テスト条件・依存関係）は `docs/tasks/` にある。タスクに着手するときは、その定義を読み、タスクのID（例：`T0-01`）をPRの本文に書く。終わったら「状態」を更新する。
- 現在は M0（準備）の途中。アプリの雛形（Next.js・TypeScript・Tailwind CSS・ESLint・Vitest）はある（T0-01）。コンポーネントテストと E2E（Testing Library・Playwright）もある（T0-02）。デプロイはまだない。

## 技術スタック

導入済み：Next.js・TypeScript・Tailwind CSS・ESLint・Prettier・Vitest・Testing Library・Playwright。それ以外はまだ入っていない（予定）。

- Next.js（App Router、`output: 'export'`、`basePath: '/maps'`）＋ TypeScript（strict）
- 地図：SVG ＋ d3-geo ＋ topojson-client（国土数値情報 N03 2026年版から作る TopoJSON）
- テスト：Vitest、Testing Library、Playwright、axe-core、Lighthouse CI
- 配信：Cloudflare Workers（Static Assets）。CI/CD は GitHub Actions ＋ wrangler-action
- パッケージ管理：**pnpm**（npm / yarn は使わない）
- Next.js は 16 系で、学習データより新しい変更がある。Next.js のコードを書く前に、インストールされた版に同梱のドキュメント（`node_modules/next/dist/docs/`）の該当する章を読み、非推奨の警告に従う。

## コマンド

Node.js は `.nvmrc` の版（26）を使う。Node.js 25 以降は corepack が同梱されないので、先に `npm install -g corepack` で入れる。

```bash
nvm use
corepack enable
pnpm install
pnpm dev          # http://localhost:3000/maps/ja/（3000番が使用中なら別の番号で起動する）
pnpm lint         # ESLint・Prettier・markdownlint・yamllint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest（カバレッジの基準を下回ると失敗する）
pnpm test:e2e     # Playwright（PC・スマホ・タブレットの7プロジェクト）
pnpm build        # 静的出力を out/ に作る

pnpm vitest run tests/unit/i18n/lang.test.ts   # 1ファイルだけ動かす（カバレッジなし）
pnpm vitest run -t "F-I18N-01"                 # テスト名で絞る（テスト名に要件IDが入っている）
pnpm test:e2e --project=chromium               # E2E を1プロジェクトだけ動かす
```

`pnpm test` はカバレッジの基準も確かめるので、一部のテストだけを動かすときは `pnpm vitest run` を使う。`pnpm lint` は `yamllint`（Python 製。pnpm では入らない）を使うので、別に入れておく。

E2E の準備：はじめに `pnpm exec playwright install chromium firefox webkit` でブラウザを入れる。Linux（WSL を含む）では、WebKit・Firefox が使うシステムのライブラリも要る。`sudo env "PATH=$(dirname "$(which node)"):$PATH" pnpm exec playwright install-deps` で入れる（sudo の下でも nvm の Node.js を見つけるため）。

E2E のサーバーは `next dev` の 3000 番。Next.js 16 は同じディレクトリで `next dev` を2つ起動できない。そのため、`pnpm dev` が 3000 番で動いていればそれを使う。別の番号で動いていると E2E は起動に失敗するので、止めてから実行する。逆に、別の worktree の dev サーバーが 3000 番で動いていると、そのサーバーに対して E2E が通ってしまうので注意する。

まだないもの：`dist/` の組み立て（T0-03）。

## ディレクトリ

| パス | 内容 |
|---|---|
| `docs/` | 設計書 |
| `app/` | ルーティングとページ（Next.js App Router） |
| `src/` | アプリのロジック。`src/lib/` は `.gitignore` の例外で管理している |
| `tests/unit/` | 単体テスト（`.test.ts`、node）とコンポーネントテスト（`.test.tsx`、jsdom）。`src/` と同じ構成で置く |
| `tests/e2e/` | E2E（Playwright。`*.spec.ts`） |
| `tests/setup/` | テストの共通の準備（jest-dom のマッチャーなど） |
| `content/` | 都道府県ごとの YAML（予定）。lint は `content/.yamllint` |
| `geo/` | 地図データの変換スクリプト（予定）。原データは `geo/downloads/` に置き、コミットしない |
| `.claude/` | Claude Code の設定・ルール・エージェント・スキル・hooks |
| `.codex/`、`.agents/` | Codex の設定・hooks・スキル |

## アーキテクチャ

- ルートレイアウトは `app/[lang]/layout.tsx`。`app/layout.tsx` は置かない。言語ごとに `<html lang>` を出すため（D27・D28）。
- `dynamicParams = false` と `generateStaticParams` で、ja・en・zh の3つだけを静的に生成する。言語の一覧・判定・`<html lang>` の値は `src/i18n/lang.ts` に集める。
- Next.js 16 では `params` が `Promise`。`await` してから `isLang()` で確かめ、合わなければ `notFound()` にする。
- `@/` は `src/` を指す。設定は `tsconfig.json` と `vitest.config.ts` の両方にあるので、変えるときは2か所を合わせる。
- カバレッジの対象は `src/` だけ。`app/` は E2E（`tests/e2e/`）で確かめる。async の Server Component（ページ・レイアウト）は Vitest で描画できないので、E2E で確かめる。ドメインロジック（`src/lib/`・`src/features/`）は 90% 以上を `vitest.config.ts` で強制している。
- `next.config.ts` の `agentRules: false` は消さない。消すと `next dev` が `AGENTS.md` に英語の指示を書き込む。

## 開発ルール

詳細は `.claude/rules/` にある（Claude Code は自動で読み込む。Codex は必要に応じて該当ファイルを読む）。

- **確認事項**：ユーザーに確認や判断を求めるときは、必ず推奨案とその理由を付ける（例：「A と B のどちらにしますか。推奨は A（理由：〜）」）。選択肢を並べるだけにしない。
- **言語**：ユーザーへの回答、ドキュメント、PR の本文、コミットメッセージは日本語で書く。PR のタイトルだけは英語で書く（形式は「コミット」の項目）。
- **TDD**：テストを先に書く（Red → Green → Refactor）。テスト名やコメントに要件IDを入れる。カバレッジは全体80%以上、ドメインロジックは90%以上。→ `testing.md`
- **ブランチと PR**：`main` に直接 push しない。1機能＝1ブランチ＝1PR。→ `git-workflow.md`
- **コミット**：`<type>: <description>`（feat / fix / refactor / docs / test / chore / perf / ci）。`<type>` は英語のまま、`<description>` と本文は日本語で書く（例：`docs: 操作仕様を追加`）。PR のタイトルも `<type>: <description>` の形式にするが、`<description>` は英語で書く（例：`docs: add interaction spec`）。
- **コーディング**：イミュータブルに書く、小さな関数・ファイル、境界での入力検証。→ `coding-style.md`
- **セキュリティ**：シークレットをリポジトリ・ログ・PR に書かない（gitleaks で検査）。→ `security.md`
- `--no-verify` や force push など、hooks・検査を回避する操作はしない。
- lint や formatter の設定（`.prettierrc`、`.markdownlint.json`、`.yamllint` など）は、指示がない限り変えない。

## コンテンツ

- 1県＝1 YAML。`status` は `draft` → `verified` → `reviewed`。本番には `reviewed` だけを出す。
- ふりがなは `{漢字|よみ}` で書く。
- 出典は、実際に開いて内容を確認できた URL だけを残す。確認できなければ `sources: []`。
- 執筆ルールと文字数は設計書の 7.2・7.3・9.3 章に従う。
