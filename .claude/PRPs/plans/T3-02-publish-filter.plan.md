# T3-02 本番用・プレビュー用のコンテンツの絞り込み：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-02
- ブランチ：`feat/T3-02-publish-filter`
- 参照仕様：開発概要書 7.1（本番ビルド・プレビュービルドの行）、4.11.4（本番で `reviewed` になっていない県）、R1・R4、11.4 (5)（プレビューは `noindex`）、T0-06 の `pnpm build:preview`

## 目的

本番には人が確認した内容（`reviewed`）だけを出し、プレビューではレビューのためにすべてを出して「下書き」の印を付けられるようにする。
本番で内容を出せない県は「準備中」として、地図・凡例・さくいん・ツールチップに表示する（4.11.4）。

## 方針

### ビルドの種類（判断 2）

- 環境変数 `BUILD_TARGET`（`production` / `preview`）。読むのは `src/lib/publish.ts` の `buildTarget(env = process.env)`：未設定・空 → `production`、それ以外の値 → 例外（ビルドを止める）。
- `package.json`：
  - `build`：`BUILD_TARGET=production next build && node scripts/postbuild.ts`（シェルに `BUILD_TARGET=preview` が残っていても本番用になるよう、明示する）。
  - `build:preview`：`BUILD_TARGET=preview next build && node scripts/postbuild.ts`。
  - `test:e2e:preview`：`playwright test -c playwright.preview.config.ts`（判断 4）。
- `pnpm dev` は未設定なので本番と同じ絞り込み。本物のコンテンツ（名物・名所は未作成）では47県とも「準備中」になる。下書きを見るときは `BUILD_TARGET=preview pnpm dev`（`AGENTS.md` のコマンドに書く）。

### 絞り込み：`src/lib/publish.ts`（純粋関数。`node:fs`・React を使わない。相対の import に `.ts`）

- `isComplete(prefecture)`：行き方があり、名物・名所が1件以上あり、行き方・名物・名所のすべての `status` が `reviewed`（判断 1）。
- `publish(prefectures, target)` → `readonly PublishedPrefecture[]`：
  - 本番：`isComplete` の県はそのまま（`pending: false`、各項目 `draft: false`）。そうでない県は `pending: true` にし、`specialties: []`・`spots: []`、`access` は持たせない（キーごと除く。7.1「1項目でも reviewed でなければ名物・名所・行き方を出さない」）。
  - プレビュー：すべての県・項目を出す。`pending` は常に `false`（4.11.4「プレビュービルドでは使わない」）。各項目に `draft: status !== 'reviewed'`。
  - 入力の配列・オブジェクトは変えない（新しいオブジェクトを返す）。
- 型（判断 3）：

  ```ts
  type BuildTarget = 'production' | 'preview';
  type Drafted<T> = T & { readonly draft: boolean };
  type PublishedPrefecture = Omit<Prefecture, 'access' | 'specialties' | 'spots'> & {
    readonly access?: Drafted<Access>;
    readonly specialties: readonly Drafted<Specialty>[];
    readonly spots: readonly Drafted<Spot>[];
    /** 本番で内容を出さない県（4.11.4）。プレビューでは常に false */
    readonly pending: boolean;
  };
  ```

- 地図・カード・さくいん・ツールチップの props（`prefectures`）の型を `readonly PublishedPrefecture[]` に変える。`loadContent()` の結果をそのまま渡すと typecheck で落ちるので、絞り込みを通し忘れない（R1）。
- `app/[lang]/page.tsx`：`const prefectures = publish(loadContent(), buildTarget())`。距離（`distancesFromTokyo`）は県庁の位置だけを使うので、同じ配列から求める（引数の型を `readonly Pick<Prefecture, 'code' | 'capital'>[]` にする）。

### 「準備中」の表示（4.11.4）

- **地図**（`JapanMap`）：`<defs>` に斜線の `<pattern id="pref-pending-hatch">`（`patternUnits="userSpaceOnUse"`、45度。線はタイルの中央に置き、太さが半分に切れないようにする。地の色 `fill-map-pending`・線の色 `stroke-map-pending-stripe`）。`pending` の県のパスは `REGION_FILL_CLASS` の代わりに `PENDING_FILL_CLASS`（`fill-[url(#pref-pending-hatch)]`。`regions.ts` に全体を書く）と `data-pending`。固定中の `aria-pressed:fill-map-selected`・ホバー・薄くする規則はほかの県と同じ（操作もほかの県と同じ。4.11.4）。
  - 色は `app/globals.css` の `@theme` に `--color-map-pending`・`--color-map-pending-stripe` を足し、ダークで上書きする。地と線は 3:1 以上（WCAG 1.4.11）、県名ラベルとは地・線とも 4.5:1 以上（ライト：地 `#f1f5f9`・線 `#7a8aa3`、ダーク：地 `#1e293b`・線 `#64748b`。値は仮で T4 で見直す）。
  - 県のパスの `aria-label` に「（準備中）」を足す（判断 6）。
- **凡例**（`MapLegend`）：`pending` の県が1つ以上あるときだけ、最後に `<li data-legend-pending>`（斜線の色見本＋「準備中」）。色見本の斜線は CSS の `repeating-linear-gradient`（`globals.css` の `@utility bg-pending-hatch`）。`MapLegend` は `prefectures` を受け取る（今は `lang` だけ）。
- **さくいん**（`PrefIndex`）：`pending` の県のボタンの県名の後に `<span data-index-pending>`「（準備中）」。項目の `<a>` は `inline-flex` なので、県名と（準備中）を1つの `<span>` で包む（flex の子が2つだと、英語の先頭の空白が消えて「Tokyo(coming soon)」になる）。
- **ツールチップ**（`MapTooltip`）：変更なし。準備中の県は `specialties` が空なので県名だけになる（T2-09 で分かったこと）。プレビューの「下書き」の印は付けない（判断 9）。
- **カード**：このタスクでは変えない（「名物・名所は準備中です」と「下書き」の印は T3-03。`pending`・`draft` を使う）。
- 辞書（判断 8）：凡例は既存の `comingSoon.label`、さくいんは新しく足した `comingSoon.indexSuffix`。

  | キー | ja | en | zh |
  |---|---|---|---|
  | `comingSoon.label`（既存） | `{準備中\|じゅんびちゅう}` | `Coming soon` | `准备中` |
  | `comingSoon.indexSuffix` | `（{準備中\|じゅんびちゅう}）` | `(coming soon)`（前に半角の空白） | `（准备中）` |

### プレビューの `noindex`（判断 5）

- `app/[lang]/layout.tsx` の `generateMetadata` で、`buildTarget() === 'preview'` のとき `robots: { index: false }`（`<meta name="robots" content="noindex">`）。`app/global-not-found.tsx` は変えない（Next.js が 404 のページに常に `noindex` を付ける）。
- T0-06 の定義の「`pnpm build:preview`：…`noindex` を加えたもの。コンテンツの絞り込みは T3-02 で加える」を、「T3-02 で作った」に直す。

## 先に書くテスト

### 単体：`tests/unit/lib/publish.test.ts`

- `buildTarget` › `7.1: 未設定・空なら production`
- `buildTarget` › `7.1: production・preview をそのまま返す`
- `buildTarget` › `7.1: それ以外の値は例外`
- `7.1: 本番：全項目が reviewed の県は内容を出す（pending: false、draft: false）`
- `7.1・4.11.4: 本番：1項目だけ verified の県は「準備中」になり、名物・名所・行き方を1つも含まない`（名物・名所・行き方のそれぞれ1件だけを `verified` にした3通り）
- `4.11.4: 本番：名物・名所が空（未作成）の県は「準備中」`
- `4.11.4: 本番：行き方がない県は「準備中」`
- `7.1: プレビュー：すべての県・項目を出し、reviewed でない項目に draft が付く（pending は常に false）`
- `入力を変えない`
- `県の順番を保つ`

### コンポーネント（既存のファイルに足す）

- `JapanMap.test.tsx`：`4.11.4: 準備中の県は斜線（pattern）で塗り、data-pending と aria-label の（準備中）が付く`、`4.11.4: 準備中でない県は地方の色`、`斜線の pattern が1つある`
- `MapLegend.test.tsx`（新規）：既存の8地方の確認に加え、`4.11.4: 準備中の県があるときだけ「準備中」の項目を出す（ja・en・zh）`
- `PrefIndex.test.tsx`：`4.11.4: 準備中の県のボタンに（準備中）が付く（ja・en・zh）`、`準備中でない県には付かない`
- `MapTooltip.test.tsx`：`4.11.4: 準備中の県（publish の結果）は県名だけ`
- `layout` は async の Server Component なので Vitest では描かない（`noindex` は E2E）。
- 既存のテストの県データは `publish(…, 'preview')` などで `PublishedPrefecture` にする（テスト用の小さな関数を `tests/unit/` に置く）。

### E2E（本番用のビルド。既存の `playwright.config.ts`、フィクスチャ：北海道＝全部 `reviewed`、東京都＝混在、沖縄県・ほか44県＝未作成）

`tests/e2e/pending.spec.ts`（新規）：

- `4.11.4：本番で reviewed になっていない県` › `準備中の県（東京都・沖縄県）は斜線で塗られ、北海道は地方の色`（計算した `fill` が `url(` を含むか）
- 同 › `凡例に「準備中」が出る（ja・en・zh）`
- 同 › `さくいんの準備中の県に（準備中）が付き、北海道には付かない`
- 同 › `英語のさくいんは、県名と（準備中）の間に空白が見える（「Tokyo (coming soon)」）`（`innerText`）
- 同 › `準備中の県の形の aria-label に（準備中）が付く`
- 同 › `準備中の県のツールチップは、名物があるフィクスチャ（東京都）でも県名だけ`（PC のプロジェクトだけ）
- R1 › `画面の文字（ふりがなを除く）に、東京都の名物・名所の名前・解説文が1つも出てこない。北海道の名物は出る（ja・en・zh）`（`rt`・`script` を除いた `textContent`。`<ruby>` で文字が分かれるので、HTML の文字列の比較では日本語の漏れを見つけられない）
- R1 › `HTML と RSC のデータに、東京都の名物・名所の id と、ふりがなのない文（en・zh）・記法のままの文が出てこない（ja・en・zh）`（`/<lang>/`・`index.txt`・`__next._full.txt`・`__next.$d$lang.__PAGE__.txt` を `request.get`。chromium だけ）
- R4 › `/<lang>/ に robots の meta がない`、`/<lang>/ の HTML に noindex がない`（後者は chromium だけ）

既存の直し：`map.spec.ts` のライト・ダークの塗りの比較を、東京都（準備中になる）から北海道に変える。

### E2E（プレビュー用のビルド。判断 4）

`playwright.preview.config.ts`（新規）：`testDir: 'tests/e2e-preview'`、chromium だけ、8789番、`webServer` は `CONTENT_DIR=tests/fixtures/content pnpm build:preview && pnpm exec wrangler dev --port 8789`。

`tests/e2e-preview/preview.spec.ts`：

- `すべての県が地方の色で塗られる（斜線の県がない）`
- `凡例に「準備中」がなく、さくいんに（準備中）が付かない`
- `東京都のツールチップに、verified・draft の名物の名前も出る`
- `/<lang>/ に <meta name="robots" content="noindex"> がある`（ja・en・zh）

レポート・trace の出力先は `playwright-report-preview/`・`test-results-preview/`（本番用の E2E の失敗のレポートを上書きしない）。

`.github/workflows/e2e.yml`：`project` が `all` か `chromium` のとき、`pnpm test:e2e` の後に `pnpm test:e2e:preview` も動かし、失敗したら両方の出力先をアップロードする。

## 作る・変えるファイルと順番

1. `tests/unit/lib/publish.test.ts`（Red）→ `src/lib/publish.ts`（Green）
2. 辞書 `src/i18n/ja.ts`・`en.ts`・`zh.ts`（`pending`）
3. `app/globals.css`（色の変数・`bg-pending-hatch`）、`src/features/map/regions.ts`（`PENDING_FILL_CLASS`）
4. コンポーネントのテスト（Red）→ `JapanMap`・`MapLegend`・`PrefIndex`・`MapTooltip`・`MapArea`・`IndexArea`・`CardArea` の props の型（Green）
5. `app/[lang]/page.tsx`（`publish`）、`app/[lang]/layout.tsx`（`noindex`）
6. `package.json`（`build`・`build:preview`・`test:e2e:preview`）、`playwright.preview.config.ts`、`tests/e2e-preview/preview.spec.ts`、`tests/e2e/pending.spec.ts`、`map.spec.ts` の直し、`.github/workflows/e2e.yml`
7. スクリーンショット：`tests/screenshots/pages.spec.ts` に、準備中の県を固定した状態（`ja-pending-pinned`：沖縄県）を足す（トップの画面にも斜線が出る）
8. 文書：`AGENTS.md`（コマンド・アーキテクチャ・ディレクトリの `tests/e2e-preview/`）、`docs/tasks/m0-setup.md`（T0-06 の `build:preview`）、`docs/tasks/m3-card-i18n-mode.md`（T3-03 に `pending`・`draft` の使い方）、開発概要書 7.1 の表（`BUILD_TARGET`）

## 完了条件の確かめ方

- **本番用のビルドに、`reviewed` でない項目の文が含まれない**：E2E の R1 のテスト（HTML）。あわせて、`CONTENT_DIR=tests/fixtures/content pnpm build` の後に `grep -r` で `dist/` のすべてのファイル（RSC の `.txt` を含む）に東京都の `verified`・`draft` の文が出てこないことを手で確かめ、PR に記録する。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（`src/lib/publish.ts` は 90% 以上）・`pnpm build`・`pnpm test:e2e`・`pnpm test:e2e:preview`、レビューで CRITICAL・HIGH なし。

## 判断が必要な点

| # | 項目 | 推奨案 | 理由 |
|---|---|---|---|
| 1 | 「準備中」の判定 | 行き方があり、名物・名所が1件以上あり、すべて `reviewed` のときだけ内容を出す。行き方がない県も「準備中」 | 仕様（7.1・4.11.4）は「名物・名所・行き方のすべての項目」。スキーマでは行き方だけ省ける（`access?`）ので、名物・名所が揃っていても行き方がなければカードの一部が欠ける |
| 2 | `BUILD_TARGET` が未設定・不正のとき | 未設定は `production`、不正な値はビルドを止める。`pnpm build` には `BUILD_TARGET=production` を明示する | 間違えたときに下書きが外に出ない側に倒す（R1）。シェルに `preview` が残っていても本番用のビルドは本番用になる |
| 3 | 絞り込みの結果の形 | `PublishedPrefecture`（県に `pending`、各項目に `draft`）を返し、コンポーネントの props をこの型にする | 「下書き」の印を `publish.ts` が付ける（仕様のとおり）。`loadContent()` の結果を直接渡すと typecheck で落ちるので、絞り込みを通し忘れない |
| 4 | プレビュー用のビルドの E2E の動かし方 | 別の設定 `playwright.preview.config.ts`（chromium だけ、8789番、`tests/e2e-preview/`）と `pnpm test:e2e:preview`。`e2e.yml` は `all`・`chromium` のときに続けて動かす | 1つの設定に2つの `webServer` を置くと、`next build` の出力（`out/`・`dist/`）がぶつかり、毎回2回ビルドする。プレビューの違いはブラウザによらないので chromium だけで足りる。スクリーンショットも別の設定にしている前例がある |
| 5 | プレビューの `noindex` | このタスクで入れる（`layout` の `robots`。404 は Next.js が常に付ける）。T0-06 の定義から外す | `build:preview` をこのタスクで作るので、`noindex` のないプレビュー用のビルドが一時でも存在しないようにする（R4）。同じ `buildTarget()` で数行 |
| 6 | 地図の県のパスの読み上げ | `aria-label` に「（準備中）」を足す（「東京都（準備中）」） | 斜線は見た目だけの情報。さくいんと同じ情報をスクリーンリーダーにも伝える（WCAG 1.3.1）。仕様（4.11.4）には地図の読み上げの記述がないので、足すかどうかの判断になる |
| 7 | 斜線の描き方と凡例 | SVG の `<pattern>`（拡大すると斜線も太くなるのは許す）。凡例の「準備中」は、準備中の県があるときだけ出す | 4.11.4 の表示は公開前の途中経過でだけ使う。倍率に合わせて斜線の間隔を保つには、属性に CSS 変数を使えないのでクライアントの処理が要る。全県 `reviewed`（M6）の後に凡例に「準備中」が残らない |
| 8 | 文言 | 上の表（ja「準備中」、en「Coming soon」、zh「准备中」）。こども向け・おとな向けで変えない | 短い表示名で、言い方を変える必要がない。英語は利用者（訪日客）に分かりやすい表現 |
| 9 | ツールチップの「下書き」の印 | 付けない | ツールチップは名前だけの短い表示（F-TIP-01）。レビューはカード（T3-03 で印を付ける）で行う |
| 10 | E2E・スクリーンショットへの影響 | フィクスチャでは北海道以外の46県が「準備中」になるので、`map.spec.ts` の塗りの比較を北海道に変える。スクリーンショットの地図は大半が斜線になる | E2E は本番用のビルド。フィクスチャは変えない（44県を `reviewed` で埋めると、フィクスチャが大きくなり、未作成の県の確認ができなくなる） |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| 辞書のキー | `pending.legend`・`pending.indexSuffix` を足す | 凡例は既存の `comingSoon.label`、足したのは `comingSoon.indexSuffix` だけ | 同じ文言（準備中・Coming soon・准备中）がすでにあり、重複したキーを作らないため |
| 404 の `noindex` | `app/global-not-found.tsx` にも付ける | 付けない | Next.js が 404 のページに常に `<meta name="robots" content="noindex">` を付ける（本番用のビルドで確かめた） |
| `distancesFromTokyo` の引数 | 記載なし | `readonly Pick<Prefecture, 'code' \| 'capital'>[]` | `PublishedPrefecture` は `Prefecture` に代入できない（`readonly` の配列）。距離は県コードと県庁の位置しか使わない |
| さくいんの（準備中）の置き方 | 県名の後に `<span>` | 県名と（準備中）を1つの `<span>` で包む | `<a>` が `inline-flex` で、子が2つだと英語の先頭の空白が消えた（レビューで分かった） |
| 斜線の色 | 地 `#e2e8f0`・線 `#94a3b8`（ダーク：`#334155`・`#475569`） | ライト：地 `#f1f5f9`・線 `#7a8aa3`、ダーク：地 `#1e293b`・線 `#64748b` | ダークの地と線が 1.37:1 で斜線が見えなかった。地と線 3:1 以上、ラベルと 4.5:1 以上にした |
| R1 の E2E | `request.get` の HTML の文字列 | 画面の文字（`rt` を除く）と、HTML・RSC の `.txt` の id・en・zh の文 | `<ruby>` で文字が分かれ、HTML の文字列では日本語の漏れを見つけられなかった。`publish.ts` を壊すと失敗することを確かめた |
| E2E の出力先 | 本番用と同じ | `playwright-report-preview/`・`test-results-preview/` | プレビューの E2E が本番用の E2E の失敗のレポートを上書きしていた（レビューの HIGH） |
