# T0-02 コンポーネント・E2Eテストの道具：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-02
- 参照仕様：10.2、5.3、AGENTS.md の「コマンド」、F-I18N-01、6.2 D27
- ブランチ：`chore/T0-02-component-e2e-tools`（PR #10）
- この計画は実際の内容に合わせてある。承認したときの内容は、このファイルの最初のコミットと、末尾の「承認後に変えたこと」にある。

## 先に書くテスト

| テスト条件 | ファイル | テスト名 |
|---|---|---|
| E2E（全プロジェクト）：`/maps/ja/`・`/maps/en/`・`/maps/zh/` が表示され、`<html lang>` が `ja`・`en`・`zh-Hans` | `tests/e2e/lang.spec.ts` | `F-I18N-01・D27：/maps/{lang}/ が表示され、<html lang> が {値} である`（3言語を表で回す） |
| （道具の確認）Testing Library と jsdom で描画し、jest-dom のマッチャーで確かめられる | `tests/unit/testing-library.test.tsx` | `10.2：Testing Library で描画した要素を jest-dom のマッチャーで確かめられる` |

E2E は、ページの見出し（`h1`）が見えることと、レスポンスが 200 であることで「表示される」を確かめる。

Red の確かめ方と結果：

- コンポーネント：jsdom・セットアップを入れる前に実行し、`render` で失敗することを見た。
- E2E：アプリは T0-01 で動くので、そのままでは最初から通る。`htmlLang()` の `zh-Hans` を一時的に `zh` に変えると失敗する（`Expected: "zh-Hans" / Received: "zh"`）ことを見て、元に戻した。

## 作った・変えたファイル（順番）

1. `package.json`：devDependencies に `@playwright/test` 1.65.0・`@testing-library/react` 16.3.3・`@testing-library/dom` 10.4.2・`@testing-library/jest-dom` 7.0.1・`jsdom` 31.0.0。スクリプト `test:e2e`（`playwright test`）。
2. `vitest.config.ts`：`projects` で `unit`（node、`tests/unit/**/*.test.ts`）と `component`（jsdom、`tests/unit/**/*.test.tsx`、セットアップ `tests/setup/component.ts`）に分けた。カバレッジの設定は今のまま（ルートで両方に効く）。
3. `tests/setup/component.ts`：`@testing-library/jest-dom/vitest` を読み込み、`IS_REACT_ACT_ENVIRONMENT` を `true` にし、各テストの後に `cleanup()`。
4. `tests/unit/testing-library.test.tsx`
5. `playwright.config.ts`：`testDir: tests/e2e`。`webServer` は `pnpm dev --port 3000`、手元では動いている dev サーバーを使う（`reuseExistingServer`）。CI では `forbidOnly`・`retries: 2`・`workers: 1`、レポートは `github` と `html`。プロジェクトは下の「判断したこと」2。
6. `tests/e2e/lang.spec.ts`
7. `.gitignore`：`test-results/`・`blob-report/`・`playwright/.cache/`
8. `package.json` の `lint:md`：markdownlint の対象から生成物（`test-results`・`playwright-report`・`coverage`・`out`）を外した。
9. `AGENTS.md`：「コマンド」に `pnpm test:e2e`・1プロジェクトだけ動かす方法・ブラウザとシステムのライブラリの入れ方・E2E のサーバーの注意を加えた。「ディレクトリ」に `tests/e2e/`・`tests/setup/` を加えた。
10. `docs/tasks/m0-setup.md`：T0-03（`wrangler dev` にしたらポートを分ける）と T0-04（CI でブラウザとライブラリを入れる、CI の設定）に、分かったことを書き足した。

## 完了条件の確かめ方と結果

| 完了条件 | 確かめ方 | 結果 |
|---|---|---|
| `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm test:e2e` がすべて通る | 4つを実行した。`pnpm build` も実行した | すべて通った。カバレッジは全体 100% |
| E2E が全プロジェクトで通る | `pnpm test:e2e` | 7プロジェクト×3言語＝21件が通った |

## 判断したこと

1. **パッケージの版**：最新を入れた（上の「作った・変えたファイル」1）。どれも公開から1日以上たっていて、T0-01 の方針（公開直後の版だけを避ける）に合う。Vitest 5 と jsdom 31 の組み合わせで問題はなかった。
2. **Playwright のプロジェクト（端末）**：PC は Desktop Chrome・Desktop Firefox・Desktop Safari。スマホは `iPhone 17`・`Pixel 10`（入れた版の `devices` で最新。Pixel 10 は幅360px で、5.3 の画面幅の下限にあたる）。タブレットは `iPad Mini`（縦、768px）と `iPad Pro 11 landscape`（横、1194px）。5.3 のタブレットの範囲（768〜1366px）の下限をちょうど確かめ、上側も広く取れる。
3. **Vitest の環境の分け方**：`projects` で node と jsdom を分けた。ロジックのテストは node のまま速く動き、ファイルごとに環境のコメントを書かなくてよい。
4. **コンポーネントテストの対象**：同期のコンポーネントがまだない（ページは async の Server Component で、Vitest では描画できない）。道具が動くことだけを確かめるテストを1つ置いた。最初の本当のコンポーネントテスト（T2 以降）ができたら消してよい。
5. **E2E のサーバーのポート**：3000 番。手元で `pnpm dev` が動いていればそれを使う。Next.js 16 は同じディレクトリで `next dev` を2つ起動できないため。dev サーバーが動いているときと動いていないときの両方で通ることを確かめた。T0-03 で `wrangler dev` に切り替えるまでの形。
6. **WebKit・Firefox の依存ライブラリ（WSL）**：オーナーが `sudo env "PATH=<nvm の bin>:$PATH" pnpm exec playwright install-deps` で入れた。
7. **この計画ファイル**：コミットして残す（PR #11 で next-task の手順にした）。
8. **`@vitejs/plugin-react`**：入れない。なくても `.tsx` のテストが動いた（tsconfig の `jsx: react-jsx` で変換される）。
9. **`lint:md` の除外**：E2E が失敗すると `test-results/**/error-context.md` ができ、markdownlint-cli2 は `.gitignore` を見ないので `pnpm lint` が落ちた。生成物を対象から外した（オーナー承認済み。ルールの `.markdownlint.json` は変えていない）。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| E2E のサーバーのポート | 3100 番に固定 | 3000 番。手元では動いている `pnpm dev` を使う | Next.js 16 は同じディレクトリで `next dev` を2つ起動できず、3100 番で別に起動すると失敗した。計画に書いておいた代わりの方法を取った |
| スマホの端末 | `iPhone 15`・`Pixel 7` | `iPhone 17`・`Pixel 10` | 計画の「入れた版の `devices` にある最新のものにそろえる」に従った |
| WebKit の依存ライブラリを入れるコマンド | `sudo pnpm exec playwright install-deps` | `sudo env "PATH=<nvm の bin>:$PATH" pnpm exec playwright install-deps` | sudo の下では nvm の Node.js と pnpm が見つからなかった |
| `IS_REACT_ACT_ENVIRONMENT` | なし | `tests/setup/component.ts` で `true` にする | コードレビューの指摘。`globals` を使わないので、Testing Library の自動の準備が動かない |
| `lint:md` | 変えない | 生成物を対象から外す | 上の「判断したこと」9。オーナー承認済み |
| 計画ファイル | コミットしない | コミットする | オーナーの指示（PR #11） |
