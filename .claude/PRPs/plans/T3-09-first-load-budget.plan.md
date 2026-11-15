# T3-09 最初の読み込みのサイズを基準値に収める：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-09
- ブランチ：`perf/T3-09-first-load-budget`
- 参照仕様：開発概要書 5.1、5.2、6.6 (2)、D24、F-MODE-04、4.11.1〜4.11.4・4.11.7、F-SRC-01〜03

## 目的

本番と同じ量（上限）のコンテンツでも、最初に読み込む HTML＋JavaScript＋CSS を gzip 後 300KB 以下にし、Lighthouse（スマホ）の 5.1 の基準値に収める。

## 着手時の調査（(b) を先に調べた結果）

今の main を本物のコンテンツでビルドし、`dist/` の JavaScript を調べた。上限のコンテンツの値は T3-08 の実測（6.6 (2)）。単位は gzip 後の KB。

### JavaScript（178.5KB）の内訳

| ファイル | gzip | 中身 |
|---|---:|---|
| 0nrspd…js | 71.8 | React DOM |
| 086kpv…js | 46.6 | Next.js のルーター・実行環境 |
| 01pu-x…js | 41.9 | アプリのコード（d3-zoom・d3-selection・d3-transition・d3-geo・topojson-client・polylabel を含む） |
| ほか5つ | 18.2 | Next.js・Turbopack の実行環境など |

- d3 などを1つずつ esbuild で束ねて測ると、d3-zoom＋selection＋transition が 18.3、d3-geo が 9.5、topojson-client が 1.6、polylabel が 1.7。
- 最大化したときにしか使わない d3-geo・topojson-client・polylabel と市区町村の描画のコードを、後から読み込む（dynamic import）にしても、減るのは **約 14KB** だけ。React・Next.js の約 137KB は減らせない。JavaScript の下限は約 165KB。

### RSC のデータからカードの内容を外せるか

- App Router には、サーバーコンポーネントの結果を RSC のデータに入れない設定はない（T3-03）。
- ビルドの後で、カードの HTML を空の要素に差し込む方法（React の外に置く）なら、RSC のデータの2回目はなくせる。それでも ja の上限では、HTML の本体 170.8＋RSC のデータの残り 41.8＋JS 約 165＋CSS 5.9 ≒ **384KB** で、基準値を超える。en も約 334KB。
- **(b) だけでは、どの言語も収まらない。** ja はカードの内容だけで HTML の本体に約 136KB ある。

### (a) にしたときの見込み

上限のコンテンツ（`make-max-content.ts`）から、その言語の文だけの JSON を作って測った（行き方・名物・名所・出典。こども向けとおとな向けの両方。ふりがなは記法のまま）。

| 言語 | 全県を1ファイル | 1県ずつ（平均・最大） |
|---|---:|---:|
| ja | 107.0 | 3.3・3.4 |
| en | 96.7 | 2.9・3.0 |
| zh | 93.5 | 2.9・3.0 |

- 最初の読み込みは、今の本物のコンテンツ（47県とも「準備中」）と同じ 255〜261KB に、カードを描くコード（数 KB）を足した値になる見込み。余裕は 30KB 台。
- HTML の `<ruby>` の2回分（本体と RSC のデータ）より、記法のままの JSON の1回分のほうがずっと小さい。

### (c) 基準値を見直す場合

- 300KB を 600KB にすれば JavaScript なしの表示は残るが、ja の LCP 2.7秒（基準値 2.5秒）は残る。LCP の基準値も緩めることになる。

## 方針（推奨：(a) を1県ずつの JSON で。県名などの見出しは HTML に残す）

### 1. JSON を作る：Route Handler

- `app/cards/[lang]/[file]/route.ts`（`dynamic = 'force-static'`、`dynamicParams = false`、`generateStaticParams`）が、ビルド時に `/cards/{ja,en,zh}/NN.json` を出力する（市区町村の `/geo/muni/NN.topo.json` と並べる）。
- 中身は `publish(loadContent(), buildTarget())` の結果から、その言語の行き方・名物・名所・出典だけ。文はふりがなの記法のまま（ja だけに付いている）。`draft` の印も入れる（プレビュー）。
- 「準備中」（`pending`）の県の JSON は作らない（カードは HTML の「準備中」の文のまま。読み込まない）。
- 形を決める純粋関数 `cardData(pref, lang)` を `src/features/card/cardData.ts` に置き、Route Handler はそれを返すだけにする（単体テストできるように）。
- 同じビルドの出力なので、`BUILD_TARGET`・`CONTENT_DIR` もそのまま効く。

### 2. HTML に残すもの・外すもの

| 残す（サーバーで描く。今のまま） | 外す（JSON から描く） |
|---|---|
| 地方名・県名の h2・県庁所在地・東京からの距離・最大化ボタン・「準備中」の文・ツールチップ（名物の名前） | 行き方・名物・名所（解説文）・出典欄 |

- `PrefCard` は、外す部分の代わりに空の差し込み先を2つ出す：`<div data-card-body="NN" data-sheet-detail>`（距離の後）と `<div data-card-sources-slot="NN" data-sheet-detail>`（最大化ボタンの後）。4.11.7 の並び（最大化ボタン → 出典）は変えない。
- ツールチップの名物の名前は小さい（47県×3）ので HTML に残す。

### 3. 読み込みと描画：1つのクライアントコンポーネント

- `CardDetails`（`src/components/`、クライアント）を `CardSwitch` の中に1つだけ置く。`useMapState()` から、カードに出す県（固定中、なければホバー中）を受け、JSON を読み込み、`createPortal` で表示中のカードの2つの差し込み先に描く。47枚に1つずつ置かない（props が RSC のデータに47回入るため）。見出し・「読み込み中」「再試行」などの文言は、辞書から必要な分だけを props で1回渡す（6.6 (2)）。
- 読み込みは `createCardLoader`。今の `createMuniLoader` と同じ形（`fetch`・`isOnline`・タイマーを外から渡す、`loading` → 300ms で `slow` → `loaded`／`failed`（`network`・`http`・`invalid`）／`offline`、成功だけをメモリに残す、同じ県の読み込みを1回にまとめる、15秒で打ち切る）。共通の部分（読み込みの状態の流れ）を `src/features/loader/` に切り出し、市区町村とカードで使う。検証（`validate`）と URL だけが違う。
- 検証は境界で行う：`code` が県コードと同じ、各項目の `id`・`name`・`description`（`kids`・`adult`）が文字列、出典の `url` が `https:` か `http:` で始まる、など。合わなければ `invalid`。
- 描画は今の `PrefCard`・`SourceList` の中身をクライアントでも使えるように分ける（`RubyText`・`ModeText`・`durationText`・`formatDate` はフックを使わないので、そのまま使える）。サーバーとクライアントで同じ部品を使い、見た目を変えない。
- ホバーで読み込みが始まる（ホバーでカードが変わるので）。表示中の県が変わったら、前の県の読み込みの結果は使わない。
- 状態の表示：300ms を超えたら差し込み先に「読み込み中」、失敗したら文言と「再試行」（市区町村の `MuniStatus` と同じ。再試行中は `aria-disabled`）、オフラインならその文言。文言は辞書の `card.loading` など（新規）。
- ハッシュの復元（T3-07）：固定した県の JSON を読み込んで出す。パネル（T3-06）の高さは、中身が入ったあと `ResizeObserver` で `--sheet-h` が合う（今の仕組みのまま）。

### 4. JavaScript がないとき

- `:target` で開いたカードには、見出し（県名・県庁所在地・距離）だけが出る。差し込み先に「くわしい内容は JavaScript を有効にすると読めます」（辞書の `card.needsScript`。`noscript:block`、ふだんは `hidden`）を出す。JavaScript が有効なのに読み込めなかったとき（`data-card-ready` がない）も同じ文を出す（`globals.css`）。
- 5.2 の「JavaScript が使えない環境でも…県名さくいんから県のカードを開ける」と F-MODE-04 は、「カードの見出しまで」に書き直す（判断 2）。

### 5. 文書

- 開発概要書：5.1（表の「カードの内容は HTML に含む」）、5.2、6.6 (2)（方式・結果・調査）、F-MODE-04、D24 の書き直しと、新しい決定事項 D38（カードの内容は県ごとの JSON）。
- 開発計画：5章の T3-09 の行を決定済みにする。T4-01（CSP の `connect-src 'self'`）、T4-04（Lighthouse CI は上限のコンテンツでも測るか）、U13（Service Worker のキャッシュの対象に `/cards/`）の定義に書き足す。
- `AGENTS.md`：アーキテクチャ（県のカード・出典の節）。

## 先に書くテスト

| ファイル | テスト名 |
|---|---|
| `tests/unit/features/card/cardData.test.ts` | `D38：cardData はその言語の行き方・名物・名所・出典だけを返す（ほかの言語の文を含まない）` |
| 同 | `D38：ja の文はふりがなの記法のまま、en・zh は記法を含まない` |
| 同 | `D38：プレビューの draft の項目には draft: true が付く` |
| `tests/unit/features/card/cardValidate.test.ts` | `D38：validateCardData は正しい JSON を受け入れる` |
| 同 | `D38：県コードの違い・項目の欠け・文字列でない値・http(s) でない出典の URL を invalid にする` |
| `tests/unit/features/loader/*.test.ts` | 今の `muniLoader.test.ts` の状態の流れのテストを共通の部分へ移す（市区町村の検証のテストは残す） |
| `tests/unit/features/card/cardLoader.test.ts` | `D38：/cards/{lang}/NN.json を読み、loading → loaded を通知する`、`300ms を超えると slow`、`HTTP の誤り・形の誤り・オフラインを分ける`、`同じ県の読み込みは1回にまとめ、成功だけを残す` |
| `tests/unit/components/CardDetails.test.tsx` | `F-CARD-02〜06：表示中の県の行き方・名物・名所を差し込み先に描く`、`F-SRC-01〜03：出典を出典欄の差し込み先に描く`、`表示中の県が変わったら前の県の結果を使わない`、`失敗したら文言と再試行、再試行で読み直す` |
| `tests/unit/scripts/measure-size.test.ts` | 変えない |
| `tests/e2e/card.spec.ts` | 今のテストを JSON から描く形に直す。`D38：/cards/ja/01.json を読み込んでカードの内容を出す`、`D38：読み込み中・失敗（再試行で出る）・オフラインの表示`（`page.route`）、`D38：HTML にカードの解説文が入らない`（今の「D24 の出現回数」を置き換える） |
| `tests/e2e/lang-switch.spec.ts` | `D38：ハッシュから復元した県のカードの内容が出る` |
| `tests/e2e/card.spec.ts`（JavaScript なし） | `5.2：JavaScript がないとき、:target のカードに見出しと「JavaScript を有効に」の文が出る` |

既存の E2E（`mode.spec.ts`・`sheet.spec.ts`・`pending.spec.ts`・`e2e-preview/preview.spec.ts` など）でカードの内容を見ているものは、JSON が届くのを待つ形に直す。

## 作る・変えるファイル（順番）

1. `src/features/loader/`（共通の読み込み）と `muniLoader.ts` の移行（テストが通ったまま）
2. `src/features/card/cardData.ts`・`cardValidate.ts`・`cardLoader.ts` と単体テスト
3. `app/cards/[lang]/[file]/route.ts`（ビルドで `dist/cards/` ができることを確かめる）
4. `PrefCard`・`SourceList` の描画の部品の分割、差し込み先、`CardDetails`、辞書（ja・en・zh）
5. `globals.css`（JavaScript なし・読み込めなかったときの文）
6. E2E の追加と修正、スクリーンショットの画面（必要なら）
7. 測る（メイン）：上限のコンテンツで `pnpm size`、Lighthouse（ja・en・zh）
8. 文書（開発概要書・開発計画・タスクの定義・`AGENTS.md`）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 上限のコンテンツで `measure-size.ts` の終了コードが 0 | `make-max-content.ts --out <scratch>` → `CONTENT_DIR=<scratch> pnpm build` → `pnpm size` |
| 上限のコンテンツで Lighthouse の ja・en・zh が基準値に収まる | T3-08 と同じ手順（`wrangler dev`、スマホの既定、スクラッチパッドで実行）。ja は3回 |
| 方式と結果を 6.6 (2)・5.1 に書いた | 文書の差分 |
| テスト条件 | 上の単体テスト・E2E |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`・`build`・`test:e2e`・`test:e2e:preview` が通り、レビューで CRITICAL・HIGH がない |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 方式 | **(a)**：カードの内容（行き方・名物・名所・出典）を JSON にして後から読み込む | (b) は上の調査で、どの言語も基準値に届かない（ja 約 384KB）。(c) は ja の LCP も緩めることになる。(a) は最初の読み込みが今の本物とほぼ同じ（255〜261KB＋数 KB）になる |
| 2 | JavaScript がないときの扱い | カードの見出し（県名・県庁所在地・距離）までを `:target` で出し、内容は「JavaScript を有効に」の文にする。5.2・F-MODE-04 をそのように書き直す | 内容を HTML に残すと (a) にならない。見出しまでは今の HTML にあり、サイズは増えない。学校の端末は JavaScript が動くので、影響は小さい |
| 3 | JSON の分け方 | 1県×1言語ずつ（`/cards/ja/01.json`、約 3KB） | 市区町村（`/geo/muni/NN.topo.json`）と同じ形で、読み込みの部品と状態の表示を共通にできる。ハッシュの復元・スマホのタップでは 3KB だけで済む。全県を1ファイル（約 100KB）にすると、遅い回線で最初のタップが待たされる |
| 4 | JSON の作り方 | Route Handler（`force-static`）でビルド時に出す | `publish()`・`BUILD_TARGET`・`CONTENT_DIR` をページと同じ流れで使え、別のスクリプトで絞り込みを書き直さずに済む（静的出力で使える。`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`）。`[file]` に `01.json` のような値が使えるかを最初に確かめ、だめなら `postbuild.ts` で出す |
| 5 | JavaScript を減らす（市区町村の描画を後から読み込む） | このタスクではしない | 減るのは約 14KB で、(a) だけで基準値に収まる見込み。収まらなかったときだけ足す |
| 6 | 検索エンジンへの影響 | このタスクでは対応しない。開発計画 5章に「県ごとの静的なページ（JavaScript なしと検索向け）」を検討課題として書く | (a) にすると、解説文が最初の HTML に入らず、検索結果に出にくくなる。県ごとのページは JavaScript なしの表示も戻せるが、ページが141増える大きな変更なので、公開前に別に決める |
| 7 | 読み込みの部品の共通化 | 市区町村の `createMuniLoader` の状態の流れを共通にし、カードと市区町村で使う | 同じ状態（`slow`・`offline`・再試行）を2回書くと食い違う。市区町村の単体テスト・E2E が通ったままで移す |
| 8 | 1県分のカードのデータの基準 | 5.1 に「1県分のカードのデータ（圧縮後）10KB 以下（目安）」を足す。`pnpm size` では確かめない | 市区町村の「1県分 100KB 以下（目安）」と同じ扱い。上限で約 3.4KB なので余裕がある |
