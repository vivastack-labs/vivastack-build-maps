# T0-03 `dist/` の組み立てとローカルの Workers 確認：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-03
- 参照仕様：6.4、11.4 (2)〜(4)、F-I18N-02、U8、R7、5.2、5.5
- ブランチ：`chore/T0-03-dist-workers`

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
| 単体（境界の検証）：`out/` に `_redirects`・`_headers` がない | 同上 | `R7：out/ に _redirects か _headers がなければエラーにする` |
| E2E：`/maps`・`/maps/` が 301 で `/maps/ja/` へ | `tests/e2e/workers.spec.ts` | `F-I18N-02：{パス} が 301 で /maps/ja/ にリダイレクトされる` |
| E2E：セキュリティのヘッダー | 同上 | `5.5：/maps/ja/ に X-Content-Type-Options・Referrer-Policy・Permissions-Policy が付く` |
| E2E：404 と `<html lang>` | 同上 | `5.2：存在しないパスは 404 を返し、<html lang> が ja である` |

既存の `tests/e2e/lang.spec.ts`（3言語の表示と `<html lang>`）は、サーバーを `wrangler dev` に変えてそのまま通す。

Red の確かめ方：

- 単体：`scripts/postbuild.ts` を作る前に実行し、読み込みで失敗することを見る。
- E2E：サーバーを `wrangler dev` に切り替え、`_redirects`・`_headers`・`global-not-found` を作る前に実行して、3つとも失敗することを見る。

## 作る・変えるファイル（順番）

1. `package.json`：devDependencies に `wrangler`（4.160.0）。
2. `tests/unit/scripts/postbuild.test.ts`（Red）
3. `scripts/postbuild.ts`：
   - `distPathOf(outPath)`：`out/` の中の相対パス → `dist/` の中の相対パス（純粋な関数。不正なパスはエラー）
   - `assembleDist({ outDir, distDir })`：`dist/` を消してから、`out/` のファイルを `distPathOf` の場所へコピーする。`_redirects`・`_headers` がなければエラー
   - `import.meta.main` のときだけ `assembleDist({ outDir: 'out', distDir: 'dist' })` を実行する
4. `vitest.config.ts`：カバレッジの対象に `scripts/**/*.ts` を加える（判断2）。
5. `public/_redirects`（11.4 (3)）、`public/_headers`（11.4 (4)。CSP は T4-01）。Next.js が `out/` の直下にコピーし、postbuild が `dist/` の直下に置く。
6. `package.json`：`build` を `next build && node scripts/postbuild.ts` にする。
7. `wrangler.jsonc`（11.4 (2)）。
8. `next.config.ts`：`experimental.globalNotFound: true`。`app/global-not-found.tsx`：`<html lang="ja">`、見出しと `/maps/ja/` へのリンクだけ。`globals.css` を読み込む。
9. `playwright.config.ts`：サーバーを `pnpm build && pnpm exec wrangler dev --port 8788` にする。`reuseExistingServer: false`。
10. `tests/e2e/workers.spec.ts`（Red → 上の 5・8 で Green）
11. `.gitignore`・`eslint.config.mjs`・`lint:md`：`.wrangler/`（wrangler dev の作業ディレクトリ）と `dist/` を対象から外す。
12. 文書：
    - `docs/development-overview.md`：6.4 の「要検証」を消し、上の確かめた結果を書く。第16章の U8 を決定にし、決定事項に D29 を加える。
    - `docs/development-plan.md` 第5章：U8 の行を決定済みにする。
    - `AGENTS.md`：「コマンド」（`pnpm build` が `dist/` を作る、E2E のサーバー、「まだないもの」を消す）、「ディレクトリ」（`scripts/`・`public/`）。
    - `docs/tasks/m0-setup.md`：T0-04・T0-06 に分かったことを書き足す（下の「後のタスクへの申し送り」）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| `pnpm build` で `dist/` が 6.4 の構成になる | `pnpm build` の後に `find dist -maxdepth 2` で見る。単体テスト（組み立て全体） |
| `pnpm exec wrangler dev` で `/maps/ja/` が表示される | 手で起動して curl で確かめる。E2E（`lang.spec.ts`）が `wrangler dev` に対して通る |
| U8 を決定にし、6.4 の「要検証」を消した | 文書の差分 |
| 共通：lint・typecheck・test・build・test:e2e が通る、レビューで CRITICAL・HIGH がない | 実行する。code-reviewer エージェント |

## 判断が必要な点

1. **U8 の決定**：上の「着手前に確かめたこと」のとおり、`out/` は `/maps` の下にまとまらない。開発計画 5章の推奨案どおり、`postbuild.ts` で必ず `dist/maps/` に組み立てる。D29 として決定事項に加える。
2. **カバレッジの対象に `scripts/` を加える**：推奨は加える。理由：postbuild はデプロイの中身を決める（R7）ので、`src/` と同じ基準（全体80%）で守りたい。一時ディレクトリで組み立て全体もテストするので、基準は満たせる。代わりの案は `src/` だけのまま（AGENTS.md のとおり）。
3. **TypeScript のスクリプトの実行方法**：推奨は `node scripts/postbuild.ts`（Node.js 26 の型の除去で直接実行）。理由：`tsx` などの依存を増やさなくてよい。制約は、`enum` など型の除去で消せない書き方を使わないこと。
4. **`build` のスクリプト**：`next build && node scripts/postbuild.ts` と1行で書き、`postbuild` という名前のスクリプトは作らない。理由：pnpm の設定（`enable-pre-post-scripts`）しだいで、`build` の後に自動で2回目が動くのを避ける。
5. **`_redirects`・`_headers` の置き場所**：`public/`（6.5 のとおり）。Next.js が `out/` の直下にコピーする。postbuild は、2つがなければエラーにする（リダイレクトのないまま配信するのを防ぐ）。
6. **`_headers` の内容**：11.4 (4) のうち CSP 以外をすべて入れる（HSTS、`/maps/_next/static/*` と `/maps/geo/*` の `Cache-Control` も）。CSP は T4-01。
7. **wrangler の版**：4.160.0。最新の 4.160.1 は公開から1日たっていない（T0-01 からの方針：公開直後の版を避ける）。`compatibility_date` は実装の日（2026-11-12）。入れた wrangler（workerd）がその日付に対応していなければ、対応する最新の日付にする。
8. **`wrangler.jsonc` の内容**：11.4 (2) のとおり（`routes`・`workers_dev: false`・`preview_urls: true` を含む）。`routes` などはローカルの `wrangler dev` には影響しない。U6（2つを同時に設定できるか）は T0-06 で確かめる。
9. **E2E のサーバー**：推奨は `pnpm build && wrangler dev --port 8788`、`reuseExistingServer: false`。理由：
   - 毎回ビルドするので、古い `dist/` を確かめてしまうことがない。代わりに E2E の実行が1回のビルドの分だけ遅くなる。
   - 8788 番にするのは、`pnpm dev`（3000番）とも、手で起動した `wrangler dev`（既定の 8787 番）ともぶつからないため。
   - wrangler の利用状況の送信は、E2E の起動では `WRANGLER_SEND_METRICS=false` で止める。
   - 代わりの案：先に `pnpm build` を手で実行しておく前提にし、サーバーは `wrangler dev` だけにする（速いが、古い `dist/` で通ってしまうおそれがある）。
10. **404 のページ**：`app/global-not-found.tsx` で、`<html lang="ja">`、見出し「ページが見つかりません」と `/maps/ja/` へのリンクだけにする。3言語にはしない（言語が分からないため。タスクの定義のとおり）。デザインは後のタスク。
11. **axe**：今は入れない。`<html lang>` が `ja` であることを Playwright で直接確かめる（axe の `html-has-lang` は属性があるかだけを見るので、こちらのほうが厳しい）。axe は M4（T4-03）で入れる。
12. **リダイレクト・ヘッダーの E2E を回すプロジェクト**：7つすべてで回す。ブラウザによらない確認なので重複するが、件数が少なく、設定を分けるより単純なため。

## 後のタスクへの申し送り（実装の中で確かめて書き足す）

- T0-04：E2E のサーバーが `pnpm build` を含むので、CI の `build` の手順と合わせて2回ビルドする。気になれば、CI では `build` の手順を省くか、E2E の手順にまとめる。
- T0-06：`wrangler.jsonc` は T0-03 で作った。`dist/` は `pnpm build` でできる。
