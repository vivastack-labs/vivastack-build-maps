# T0-02 コンポーネント・E2Eテストの道具：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-02
- 参照仕様：10.2、5.3、AGENTS.md の「コマンド」、F-I18N-01、6.2 D27
- ブランチ：`chore/T0-02-component-e2e-tools`

## 先に書くテスト

| テスト条件 | ファイル | テスト名 |
|---|---|---|
| E2E（全プロジェクト）：`/maps/ja/`・`/maps/en/`・`/maps/zh/` が表示され、`<html lang>` が `ja`・`en`・`zh-Hans` | `tests/e2e/lang.spec.ts` | `F-I18N-01・D27：/maps/{lang}/ が表示され、<html lang> が {値} である`（3言語を表で回す） |
| （道具の確認）Testing Library と jsdom で描画し、jest-dom のマッチャーで確かめられる | `tests/unit/testing-library.test.tsx` | `10.2：Testing Library で描画した要素を jest-dom のマッチャーで確かめられる` |

E2E は、ページの見出し（`h1`）が見えることと、レスポンスが 200 であることで「表示される」を確かめる。

Red の確かめ方：

- コンポーネント：jsdom・セットアップを入れる前に実行し、`document is not defined` などで失敗することを見る。
- E2E：アプリは T0-01 で動くので、そのままでは最初から通る。`htmlLang()` の `zh-Hans` を一時的に `zh` に変えて失敗することを確かめ、元に戻す。

## 作る・変えるファイル（順番）

1. `package.json`：devDependencies に `@playwright/test`・`@testing-library/react`・`@testing-library/dom`・`@testing-library/jest-dom`・`jsdom`。スクリプト `test:e2e`（`playwright test`）。
2. `vitest.config.ts`：`projects` で `unit`（node、`tests/unit/**/*.test.ts`）と `component`（jsdom、`tests/unit/**/*.test.tsx`、セットアップ `tests/setup/component.ts`）に分ける。カバレッジの設定は今のまま。
3. `tests/setup/component.ts`：`@testing-library/jest-dom/vitest` を読み込み、各テストの後に `cleanup()`。
4. `tests/unit/testing-library.test.tsx`
5. `playwright.config.ts`：`testDir: tests/e2e`、`webServer` は `pnpm dev --port 3100`、`baseURL` は `http://localhost:3100`。CI では `forbidOnly`・`retries: 2`・`workers: 1`。プロジェクトは下の「判断が必要な点」2。
6. `tests/e2e/lang.spec.ts`
7. `.gitignore`：`test-results/`・`blob-report/`・`playwright/.cache/`
8. `AGENTS.md`：「コマンド」に `pnpm test:e2e` とブラウザの入れ方を加え、「まだないもの」から `test:e2e` を消す。「導入済み」に Testing Library・Playwright を加える。
9. `docs/development-plan.md`：完了時に状態は変えない（マージ後の next-task で「完了」にする）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm test:e2e` がすべて通る | 4つを実行し、結果をPRに書く。`pnpm build` も通ることを確かめる |
| E2E が全プロジェクトで通る | `pnpm test:e2e` の結果で、7プロジェクト×3言語＝21件が通ることを確かめる |

## 判断が必要な点

1. **パッケージの版**：最新を入れる（`@playwright/test` 1.65.0、`jsdom` 31.0.0 など）。理由：どれも公開から1日以上たっていて、T0-01 の方針（公開直後の版だけを避ける）に合う。Vitest 5 と jsdom 31 が合わなければ 30.1.3 にする。
2. **Playwright のプロジェクト（端末）**：PC は Desktop Chrome・Desktop Firefox・Desktop Safari。スマホは `iPhone 15`・`Pixel 7`。タブレットは `iPad Mini`（縦、768px）と `iPad Pro 11 landscape`（横、1194px）。理由：5.3 のタブレットの範囲（768〜1366px）の下限をちょうど確かめ、上側も広く取れる。端末名は、入れた版の `devices` にある最新のものにそろえる。
3. **Vitest の環境の分け方**：`projects` で node と jsdom を分ける。理由：ロジックのテストは node のまま速く動き、ファイルごとに環境のコメントを書かなくてよい。
4. **コンポーネントテストの対象**：まだ同期のコンポーネントがない（ページは async の Server Component で、Vitest では描画できない）。道具が動くことだけを確かめるテストを1つ置く。理由：アプリのコードをこのタスクで変えない。最初の本当のコンポーネントテスト（T2 以降）ができたら消してよい。
5. **E2E のサーバーのポート**：3100 番に固定する。理由：手元で `pnpm dev`（3000番）を動かしていても E2E とぶつからない。ただし Next.js 16 は同じディレクトリで `next dev` を2つ動かせない可能性があるので、実装で確かめ、ぶつかる場合は `reuseExistingServer` で既存の dev サーバーを使う方法を取る。
6. **WebKit・Firefox の依存ライブラリ（WSL）**：手元には WebKit に必要なライブラリがほぼない。`sudo pnpm exec playwright install-deps` をオーナーに実行してもらう必要がある（sudo のため）。
7. **この計画ファイル**：コミットしない。理由：内容はPRの本文に移す。
