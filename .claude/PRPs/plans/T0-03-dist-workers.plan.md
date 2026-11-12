# T0-03 `dist/` の組み立てとローカルの Workers 確認：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-03
- 参照仕様：6.4、11.4 (2)〜(4)、F-I18N-02、U8、R7、5.2、5.5
- ブランチ：`chore/T0-03-dist-workers`
- この計画は実際の内容に合わせてある。承認したときの内容は、このファイルの最初のコミットと、末尾の「承認後に変えたこと」にある。

## 着手前に確かめたこと（U8）

T0-01 の `pnpm build` の出力（`out/`）を見た。`basePath: '/maps'` を付けても、`out/` の中は `/maps` の下にまとまらない。

```text
out/
├─ 404.html、404/index.html、_not-found/...
├─ ja/index.html、en/index.html、zh/index.html（と RSC の .txt）
└─ _next/static/...
```

HTML の中の参照は `/maps/_next/static/...` のように `/maps` 付きで出る。つまり、`out/` の中身をそのまま `dist/maps/` に移せば、URL と置き場所が合う。
今の 404.html には `<html lang>` がない（T0-01 で確認したとおり）。

## 先に書くテスト

| テスト条件 | ファイル | テスト名 |
|---|---|---|
| 単体：`_redirects`・`_headers` は `dist/` の直下 | `tests/unit/scripts/postbuild.test.ts` | `U8・R7：_redirects と _headers は dist/ の直下に置く` |
| 単体：ほかは `maps/` の下 | 同上 | `U8・R7：ほかのファイルは maps/ の下に置く`（`ja/index.html`・`_next/static/...`・`404.html` を表で回す） |
| 単体（境界の検証）：不正なパス | 同上 | `R7：絶対パスや .. を含むパスはエラーにする` |
| 単体（組み立て全体）：一時ディレクトリで `out/` → `dist/` | 同上 | `U8・R7：out/ を dist/ の構成に組み立て、前の dist/ は消す` |
| 単体（境界の検証）：`out/` に `_redirects`・`_headers` がない | 同上 | `R7：out/ に {ファイル} がなければエラーにする`・`R7：out/ がなければエラーにする` |
| 単体（境界の検証）：`dist/` と `out/` が重なる | 同上 | `R7：dist/ と out/ が重なるとき（{同じ・out/ の中・dist/ の中に out/}）はエラーにし、out/ を消さない` |
| 単体（境界の検証）：シンボリックリンク | 同上 | `R7：out/ にシンボリックリンクがあればエラーにする` |
| E2E：`/maps`・`/maps/` が 301 で `/maps/ja/` へ | `tests/e2e/workers.spec.ts` | `F-I18N-02：{パス} が 301 で /maps/ja/ にリダイレクトされる` |
| E2E：セキュリティのヘッダー | 同上 | `5.5：/maps/ja/ に X-Content-Type-Options・Referrer-Policy・Permissions-Policy・HSTS が付く` |
| （加えた）E2E：キャッシュのヘッダー | 同上 | `11.4 (4)：/maps/_next/static/ のファイルは1年間キャッシュされる` |
| E2E：404 と `<html lang>` | 同上 | `5.2：存在しないパスは 404 を返し、<html lang> が ja である` |

既存の `tests/e2e/lang.spec.ts`（3言語の表示と `<html lang>`）は、サーバーを `wrangler dev` に変えてそのまま通す。

Red の確かめ方と結果：

- 単体：`scripts/postbuild.ts` を作る前に実行し、読み込みで失敗することを見た。レビュー後に加えた重なり・シンボリックリンクのテストも、実装の前に4件失敗することを見た。
- E2E：サーバーを `wrangler dev` に切り替え、空の `_redirects`・`_headers` で、`global-not-found` なしで実行した。リダイレクト2件・ヘッダー・404 の `<html lang>` の4件が失敗し、`lang.spec.ts` の3件は通ることを見た。

## 作った・変えたファイル（順番）

1. `package.json`：devDependencies に `wrangler`（4.160.0）。`pnpm-workspace.yaml`：esbuild・workerd のインストールスクリプトを実行しない（`allowBuilds`。判断13）。
2. `tests/unit/scripts/postbuild.test.ts`（Red）
3. `scripts/postbuild.ts`：
   - `distPathOf(outPath)`：`out/` の中の相対パス → `dist/` の中の相対パス（純粋な関数。不正なパスはエラー）
   - `assembleDist({ outDir, distDir })`：`dist/` を消してから、`out/` のファイルを `distPathOf` の場所へコピーする。`out/` がない、`_redirects`・`_headers` がない、`dist/` と `out/` が重なる、シンボリックリンクがある、のどれかならエラー
   - `import.meta.main` のときだけ、リポジトリの直下の `out/`・`dist/` で実行する（実行した場所によらない）
4. `vitest.config.ts`：カバレッジの対象に `scripts/**/*.ts` を加える（判断2）。
5. `public/_redirects`（11.4 (3)）、`public/_headers`（11.4 (4)。CSP は T4-01）。Next.js が `out/` の直下にコピーし、postbuild が `dist/` の直下に置く。
6. `package.json`：`build` を `next build && node scripts/postbuild.ts` にする。
7. `wrangler.jsonc`（11.4 (2)。`compatibility_date` は 2026-11-10）。
8. `next.config.ts`：`experimental.globalNotFound: true`。`app/global-not-found.tsx`：`<html lang="ja">`、見出しと `/maps/ja/` へのリンクだけ。`globals.css` を読み込む。
9. `playwright.config.ts`：サーバーを `pnpm build && pnpm exec wrangler dev --port 8788` にする。`reuseExistingServer: false`、`WRANGLER_SEND_METRICS=false`。
10. `tests/e2e/workers.spec.ts`（Red → 上の 5・8 で Green）
11. `.gitignore`・`eslint.config.mjs`・`lint:md`：`.wrangler/`（wrangler dev の作業ディレクトリ）と `dist/` を対象から外す。`lint:prettier` の対象に `wrangler.jsonc` を加える。
12. 文書：
    - `docs/development-overview.md`：6.4 の「要検証」を消し、上の確かめた結果を書く。第16章の U8 を決定にし、決定事項に D29 を加える。
    - `docs/development-plan.md` 第5章：U8 の行を決定済みにする。
    - `AGENTS.md`：「コマンド」（`pnpm build` が `dist/` を作る、`wrangler dev`、E2E のサーバー、`allowBuilds`、「まだないもの」を消す）、「ディレクトリ」（`scripts/`・`public/`）、「アーキテクチャ」（global-not-found、カバレッジの対象）。
    - `docs/tasks/m0-setup.md`：T0-04・T0-06 に分かったことを書き足す（下の「後のタスクへの申し送り」）。

## 完了条件の確かめ方と結果

| 完了条件 | 確かめ方 | 結果 |
|---|---|---|
| `pnpm build` で `dist/` が 6.4 の構成になる | `pnpm build` の後に `find dist -maxdepth 2` で見る。単体テスト（組み立て全体） | `dist/_redirects`・`dist/_headers`・`dist/maps/{ja,en,zh,_next,404.html,...}` になった |
| `pnpm exec wrangler dev` で `/maps/ja/` が表示される | 手で起動して curl で確かめる。E2E（`lang.spec.ts`）が `wrangler dev` に対して通る | 8787番で `/maps/ja/` が 200（ヘッダー付き）、`/maps` が 301。E2E も通った |
| U8 を決定にし、6.4 の「要検証」を消した | 文書の差分 | D29 を加え、6.4・第16章・開発計画 第5章を直した |
| 共通：lint・typecheck・test・build・test:e2e が通る、レビューで CRITICAL・HIGH がない | 実行する。code-reviewer エージェント | すべて通った。単体35件（カバレッジ全体 約96%）、E2E 8件×7プロジェクト＝56件。レビューは CRITICAL・HIGH なし、MEDIUM 1件と LOW を直した |

## 判断したこと

1. **U8 の決定**：上の「着手前に確かめたこと」のとおり、`out/` は `/maps` の下にまとまらない。開発計画 5章の推奨案どおり、`postbuild.ts` で必ず `dist/maps/` に組み立てる。D29 として決定事項に加える。
2. **カバレッジの対象に `scripts/` を加える**：推奨は加える。理由：postbuild はデプロイの中身を決める（R7）ので、`src/` と同じ基準（全体80%）で守りたい。一時ディレクトリで組み立て全体もテストするので、基準は満たせる。代わりの案は `src/` だけのまま（AGENTS.md のとおり）。
3. **TypeScript のスクリプトの実行方法**：推奨は `node scripts/postbuild.ts`（Node.js 26 の型の除去で直接実行）。理由：`tsx` などの依存を増やさなくてよい。制約は、`enum` など型の除去で消せない書き方を使わないこと。
4. **`build` のスクリプト**：`next build && node scripts/postbuild.ts` と1行で書き、`postbuild` という名前のスクリプトは作らない。理由：pnpm の設定（`enable-pre-post-scripts`）しだいで、`build` の後に自動で2回目が動くのを避ける。
5. **`_redirects`・`_headers` の置き場所**：`public/`（6.5 のとおり）。Next.js が `out/` の直下にコピーする。postbuild は、2つがなければエラーにする（リダイレクトのないまま配信するのを防ぐ）。
6. **`_headers` の内容**：11.4 (4) のうち CSP 以外をすべて入れる（HSTS、`/maps/_next/static/*` と `/maps/geo/*` の `Cache-Control` も）。CSP は T4-01。
7. **wrangler の版**：4.160.0。最新の 4.160.1 は公開から1日たっていない（T0-01 からの方針：公開直後の版を避ける）。`compatibility_date` は、入れた workerd（1.20261110.1）が対応する最新の 2026-11-10。
8. **`wrangler.jsonc` の内容**：11.4 (2) のとおり（`routes`・`workers_dev: false`・`preview_urls: true` を含む）。`routes` などはローカルの `wrangler dev` には影響しない。U6（2つを同時に設定できるか）は T0-06 で確かめる。
9. **E2E のサーバー**：推奨は `pnpm build && wrangler dev --port 8788`、`reuseExistingServer: false`。理由：
   - 毎回ビルドするので、古い `dist/` を確かめてしまうことがない。代わりに E2E の実行が1回のビルドの分だけ遅くなる。
   - 8788 番にするのは、`pnpm dev`（3000番）とも、手で起動した `wrangler dev`（既定の 8787 番）ともぶつからないため。
   - wrangler の利用状況の送信は、E2E の起動では `WRANGLER_SEND_METRICS=false` で止める。
   - 代わりの案：先に `pnpm build` を手で実行しておく前提にし、サーバーは `wrangler dev` だけにする（速いが、古い `dist/` で通ってしまうおそれがある）。
10. **404 のページ**：`app/global-not-found.tsx` で、`<html lang="ja">`、見出し「ページが見つかりません」と `/maps/ja/` へのリンクだけにする。3言語にはしない（言語が分からないため。タスクの定義のとおり）。デザインは後のタスク。
11. **axe**：今は入れない。`<html lang>` が `ja` であることを Playwright で直接確かめる（axe の `html-has-lang` は属性があるかだけを見るので、こちらのほうが厳しい）。axe は M4（T4-03）で入れる。
12. **リダイレクト・ヘッダーの E2E を回すプロジェクト**：7つすべてで回す。ブラウザによらない確認なので重複するが、件数が少なく、設定を分けるより単純なため（レビューでも LOW の任意の指摘だった）。
13. **esbuild・workerd のインストールスクリプト**（承認の後に出た点）：pnpm 12 は、インストールスクリプトのある依存を `allowBuilds` に書くまで `pnpm install` を失敗させる。「実行しない」にした。本体はプラットフォーム別のパッケージから入り、スクリプトなしで `wrangler dev` と E2E が動いた。インストールのときに他人のコードを動かさずに済む（特に、T0-06 以降の Token のある CI の job で）。失うのは、本体が入らない珍しい環境での予備のダウンロードだけ。オーナーに影響を説明し、PR で確かめてもらう。

## 後のタスクへの申し送り（タスクの定義に書き足した）

- T0-04：E2E のサーバーが `pnpm build` を含むので、CI の `build` の手順と合わせて2回ビルドする。気になれば、CI では `build` の手順を省くか、E2E の手順にまとめる。
- T0-06：`wrangler.jsonc` と `dist/` を作る仕組みは T0-03 で用意した。`compatibility_date` は、入れた wrangler（workerd）が対応する日付までしか使えない。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| `compatibility_date` | 2026-11-12（対応していなければ対応する最新） | 2026-11-10 | 入れた workerd が 2026-11-10 までの日付に対応していたため。計画に書いておいた代わりの方法を取った |
| esbuild・workerd のインストールスクリプト | 計画になし | `pnpm-workspace.yaml` の `allowBuilds` で実行しない | pnpm 12 が `pnpm install` を失敗させたため。判断13。オーナーには後から影響を説明した |
| `lint:prettier` の対象 | 変えない | `wrangler.jsonc` を加えた | 新しく作った設定ファイルの整形も確かめるため |
| postbuild の検証 | `out/` と `_redirects`・`_headers` があるか | 加えて、`dist/` と `out/` が重ならないこと、シンボリックリンクがないことを確かめる。リポジトリの直下の `out/`・`dist/` を使う | コードレビューの指摘（LOW） |
| E2E のヘッダー | 3つのヘッダー | HSTS と `/maps/_next/static/` の `Cache-Control` も確かめる | コードレビューの指摘（MEDIUM） |
