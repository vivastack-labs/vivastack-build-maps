# T2-04 都道府県の地図の描画：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-04
- ブランチ：`feat/T2-04-prefecture-map`
- 参照仕様：開発概要書 F-MAP-01〜04・06、6.6 (1)、5.1、5.2、6.2（D26）、D24、U16

## 目的

ビルド時に `geo/data/prefs.topo.json` を SVG のパスにして HTML に埋め込み、JavaScript を読み込む前から（なくても）日本地図が見えるようにする。
8地方の色分け・県名ラベル・沖縄の点線枠・海域名・凡例を出し、ライト・ダークを切り替える。操作（ホバー・固定）は T2-05、拡大・縮小は T2-06。

## 作る・変えるファイル（この順番）

1. テストを先に書く（Red）。下の「先に書くテスト」。
2. `package.json`：`topojson-client` を `devDependencies` から `dependencies` に移す（判断 2）。
3. `src/features/map/pathContext.ts`：`geoPath(projection, context)` に渡す context。座標を 0.1 単位の整数に丸め、各リングを `M` の絶対座標で始めて、続きを `l` の差分で書く（レビューを受けて追加。パスが HTML と RSC のデータの2か所に入るため、短くする）。
4. `src/features/map/projection.ts`：県コードの正規表現を `PREF_CODE_PATTERN` として export する（`prefPaths.ts` と共有）。先頭のコメントに U16 の決定を書く。
5. `src/features/map/prefPaths.ts`（サーバーでだけ使う。ビルド時に動く）：
   - `loadPrefPaths()` が `geo/data/prefs.topo.json` を読み、`buildPrefPaths(topology)` が形を確かめてから、`topojson-client` の `feature()` で GeoJSON にする。
   - 県ごとに `createProjection(code)` と `pathContext.ts` の context でパスを作る（沖縄県は自動で点線枠に移る）。
   - `viewBox` の外に出る島は形から除く（判断 1。島（ポリゴン）ごとに、投影した外接矩形が `viewBox` と重ならないものを除く。一部だけ入る島は残す）。全部が外にある県は例外にする。
   - 県名ラベルの位置：`projectPoint(label, code)` に、重なりを避けるための手で決めたずらし（`LABEL_OFFSETS`。言語ごと。zh は ja と共有）を足す（判断 3）。文字の大きさは `LABEL_FONT_SIZE`（ja・zh 16、en 13）。
   - 返す形：`{ code, d, labels: { ja, en, zh } }[]`（県コードの順）。入力の形が想定と違えば例外（ビルドを止める）。
6. `src/features/map/regions.ts`：8地方の順と、Tailwind の塗り・色見本のクラス名（全部を書いた文字列。Tailwind がクラスを拾えるように組み立てない）。
7. `app/globals.css`：`@theme` に色の変数を足す（判断 4・5）。
   - 8地方の塗り `--color-region-<地方>`、海 `--color-map-sea`、県境・海岸線 `--color-map-border`、県名ラベル `--color-map-label`、海域名 `--color-map-sea-label`、点線枠 `--color-map-frame`。
   - ページの背景・文字 `--color-page-bg`・`--color-page-text`（判断 5）。
   - ダーク：`@media (prefers-color-scheme: dark) { :root { ... } }` で同じ変数を上書きする。
   - 県名ラベルを隠す幅の区切り `--breakpoint-map-label: 821px` を定義し、`max-map-label:hidden`（幅821px未満＝820px以下で隠す）で使う。
8. `src/components/JapanMap.tsx`（サーバーコンポーネント。props は `{ lang, prefectures }`）：
   - `<svg viewBox="0 0 1000 1130" role="group" aria-label="日本地図">`（`map.label` を `plainText`）。海の背景の `<rect>` は、拡大・縮小用の `<g data-map-layer>` の外に置く（T2-06 で背景が動かないように）。
   - `<g data-map-layer>` の中に、県のパス（`data-pref`・`data-region`・`role="button"`・`aria-label`＝その言語の県名。ふりがなを除く）、沖縄の点線枠（`OKINAWA_FRAME`）、海域名 2つ（`plainText`）、県名ラベル（`aria-hidden="true"`。「都・府・県・县」を省く）。
   - 県名・地方は `page.tsx` から受け取ったコンテンツから引く。パスは `loadPrefPaths()` から引き、コンテンツの県コードの形がなければ例外にする。
9. `src/components/MapLegend.tsx`（サーバーコンポーネント）：8地方の色見本と地方名（`regions.*` を `RubyText`）。`<ul>`。「準備中」は T3-02。
10. `src/components/MapArea.tsx`：仮の箱を置き換える。`<section data-area="map">` の中に、`aspect-ratio` が `VIEWBOX` の箱（`data-map-box`。その中に `JapanMap`）と、その下に `MapLegend`。
11. `app/[lang]/page.tsx`：`loadContent()` を呼び、`MapArea` に `lang` と県の一覧を渡す。
12. `app/[lang]/layout.tsx`：`<body>` に `bg-page-bg text-page-text`（判断 5）。
13. `tests/screenshots/pages.spec.ts`：`ja-top-dark`（`prepare` で `page.emulateMedia({ colorScheme: 'dark' })`）を足す。
14. ドキュメント：U16 の決定（D36）を開発概要書（6.6 (1)、未決事項の表、決定事項の表、版 0.8）、`projection.ts` の先頭のコメント、開発計画 第5章に書く。T2-04・T2-06・T2-08 の定義と `AGENTS.md`（地図の描画）に書き足す。

## 先に書くテスト

### 単体（node）

- `tests/unit/features/map/pathContext.test.ts`
  - `F-MAP-01：小さな正方形が、絶対座標の M と、差分の l と、z の文字列になる`
  - `座標は 0.1 単位に丸め、先頭の0と、負の数・小数点の前の区切りを省く`
  - `0.1 の丸めの誤差が、差分を足してもたまらない（最後の点が絶対座標で丸めた値と同じ）`
  - `丸めて同じ座標になった続きの点は書かない`・`丸めると3点に満たないリングは書かない`・`複数のリングは、それぞれ M の絶対座標から書き始める`・`始点に戻る最後の点（閉じる点）は書かない`・`d3 が点（arc）を描こうとしたら例外にする（県の形には点がない）`
- `tests/unit/features/map/prefPaths.test.ts`（相対のパスを絶対座標に戻す補助は `path-helpers.ts`）
  - `F-MAP-01：47県のパスがあり、どれも空でない`
  - `F-MAP-01：県コードが 01〜47 の順に1つずつある`
  - `F-MAP-01：県名ラベルの位置がすべて viewBox の中にある（ja・en・zh）`
  - `F-MAP-02：沖縄県の県名ラベルが点線枠の中にある（ja・en・zh）`
  - `F-MAP-01：重なりを避けるずらしは、県コードを指し、小さい量である`
  - `F-MAP-01：県名ラベルの文字の大きさは、横に長い英語のほうが小さい`
  - `U16：今のデータでは、どの県のパスの座標も viewBox の外に出ない`・`U16：東京都の形に、viewBox の中の父島が残る`
  - `F-MAP-01：県の形と県名ラベルの位置を返す`・`F-MAP-01：パスは M の絶対座標と、l の差分でできていて、元の座標と 0.1 以内で同じである`
  - `prefs.topo.json の形が違うと例外にする`：オブジェクト名 prefectures がない／Topology でない／code がない・label が経緯度でない／形が Polygon・MultiPolygon でない
  - `U16：viewBox の外に出る島を除く`：(a) 内側の島と外側の島を持つとき、内側の島だけが残る／(b) 一部だけ viewBox からはみ出す島は残る／(c) 県の形が全部 viewBox の外にあると例外にする
- `tests/unit/features/map/regions.test.ts`
  - `F-MAP-03：8地方があり、辞書の地方名と同じ順に並ぶ`
  - `F-MAP-01：地方ごとに、@theme の色の変数に対応する塗りと色見本のクラスがある`

### コンポーネント（jsdom）

- `tests/unit/components/JapanMap.test.tsx`
  - `5.2：県のパスが47個あり、role="button" と aria-label（ふりがなを除いた県名）を持つ`（ja・en・zh）
  - `F-MAP-01：県のパスの data-region がコンテンツの地方と同じである`
  - `5.2：地図の svg は viewBox と、言語ごとの名前（ふりがなを除く）を持つ`
  - `F-MAP-06：海域名（日本海・太平洋）を、その言語で出す`
  - `F-MAP-02：沖縄県の点線枠がある`
  - `5.2：県名ラベルは aria-hidden である（パスの aria-label と重複するため）`
  - `F-MAP-01：県名ラベルは「都・府・県」（中国語は「县」）を省き、北海道はそのまま出す`
  - `F-MAP-01：県名ラベルは幅820px以下で隠す（max-map-label:hidden）`
  - `F-MAP-01：コンテンツの県コードからパスを引けないときは、パスのない県を描かずに例外にする`
- `tests/unit/components/MapLegend.test.tsx`
  - `F-MAP-03：凡例に8地方が地方の順にある`（ja・en・zh）
  - `F-MAP-03：色見本は地方の色（@theme の変数）で塗り、スクリーンリーダーには読ませない`
- `tests/unit/components/MapArea.test.tsx`（変更）
  - `4.11.7：地図の箱の縦横比が地図の viewBox と同じである`
  - `F-MAP-03：地図の箱の下に凡例がある`

### E2E（`tests/e2e/map.spec.ts`。手動で実行）

- `F-MAP-01・5.2：県の形が47個あり、aria-label が県名である`（ja・en・zh。県名はコンテンツから `plainText` で作る）
- `F-MAP-02：沖縄県の形が点線枠の中にある`（`getBBox()` で比べる）
- `F-MAP-04：colorScheme が dark のとき、県の塗りと海の色がライトのときと変わる`
- `F-MAP-01：幅820pxでは県名ラベルが見えず、幅821pxでは見える`（PC のプロジェクトだけ）
- `F-MAP-01：県名ラベルどうしが重ならない`（ja・en・zh。`getBBox()` で viewBox の単位で比べる。フォントで幅が変わるので chromium だけ）
- `F-MAP-03：凡例に8地方がある`（ja・en・zh）
- `F-MAP-06：海域名が2つ表示される`（ja・en・zh）
- `D24：JavaScriptを無効にしても、県の形が47個ある`（`test.use({ javaScriptEnabled: false })`）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| JavaScriptを無効にしても地図が表示される | E2E の D24 のテスト。あわせて `dist/ja/index.html` に `<path` が47個以上あることを `grep -c` で見る |
| 共通（lint・typecheck・test・build、カバレッジ） | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、`pnpm test:e2e` |
| 5.1 最初の読み込み 300KB 以下 | `dist/ja/index.html` と、そのページが読み込む JS・CSS を gzip で測り、PR に書く。超えたら `GEO_BUILD_SETTINGS` を見直す |
| 画面 | `pnpm screenshots`（ja・en・zh のトップ、ja のダーク） |

## 判断が必要な点

### 1. U16：小笠原村の表示

試しに描いた結果：父島・母島は `viewBox` の下の端（y≈1110〜1135）に、1〜2px の点として入る。硫黄島（y≈1250）・南鳥島（x≈1380）・沖ノ鳥島（y≈1510）は外に出る。
南鳥島と沖ノ鳥島は約1,800km 離れているので、1つの別枠に入れると縮尺がとても小さくなり、島は見えない。

| 案 | 内容 |
|---|---|
| **A（推奨）** | 実際の位置のまま描き、`viewBox` の外に出る島は県の形から除く（父島・母島は端に小さく残る）。東京都を最大化したとき（T2-06）は、本土と伊豆諸島に寄る。市区町村の形（T2-08）では小笠原村を実際の位置に描くので、最大化して地図を動かせば見える |
| B | 右下の海に「小笠原諸島」の別枠を作り、父島列島・母島列島を拡大して描く。`projection.ts` に「東京都の北緯28度より南の形を別の倍率・位置に移す」規則を足し、T2-08 の市区町村も同じ規則で描く。硫黄島・南鳥島・沖ノ鳥島は枠に入らない |

推奨は A。理由：B でも枠に入るのは父島・母島だけで、規則が投影と市区町村の両方に広がる（T2-06・T2-08 の作業も増える）。A は投影法を変えずに済み、後から B を足しても県の形のデータは作り直さなくてよい。

### 2. `topojson-client` を `dependencies` に移す

今はテストだけで使う `devDependencies`。このタスクからアプリ（ビルド時のサーバーコンポーネント）で使い、T2-07 ではブラウザでも使うので、`dependencies` に移す（推奨）。

### 3. 県名ラベルの書き方と重なり

試しに描くと、幅800pxで、宮城・山形、東京・神奈川・千葉・山梨、京都・滋賀、大阪・三重、愛媛・高知、徳島・和歌山のラベルが重なる。

- **推奨**：ラベルでは「都・府・県」（中国語は「都・府・县」）を付けない（「青森」「东京」。北海道はそのまま）。県の `aria-label`・カード・さくいんは正式な名前のまま。重なる県だけ、`prefPaths.ts` の `LABEL_OFFSETS` で位置をずらし、E2E で重ならないことを確かめる。文字の大きさは viewBox の単位で16（幅821pxで約13px）。
- 理由：地図帳の日本全図も県名を短く書くのがふつうで、短くすれば文字を大きくできる。ずらす県を表で持てば、どこを変えたかが読み返せる。

### 4. 8地方の色（`@theme`。D26）

ライトは淡い色（Tailwind の 200 番台）に濃い文字、ダークは濃い色（800 番台）に明るい文字にする。
T4-03 で「県名ラベルと地方の色のコントラスト 4.5:1 以上」を確かめるので、ラベルに縁取りは付けず、文字の色と各地方の塗り・海の色が直接 4.5:1 以上になる組み合わせにする。

| 地方 | ライト | ダーク |
|---|---|---|
| 北海道 | sky-200 `#bae6fd` | sky-800 `#075985` |
| 東北 | indigo-200 `#c7d2fe` | indigo-800 `#3730a3` |
| 関東 | emerald-200 `#a7f3d0` | emerald-800 `#065f46` |
| 中部 | lime-200 `#d9f99d` | lime-800 `#3f6212` |
| 近畿 | amber-200 `#fde68a` | amber-800 `#92400e` |
| 中国 | cyan-200 `#a5f3fc` | cyan-800 `#155e75` |
| 四国 | rose-200 `#fecdd3` | rose-800 `#9f1239` |
| 九州（沖縄を含む） | fuchsia-200 `#f5d0fe` | fuchsia-800 `#86198f` |
| 海 | sky-50 `#f0f9ff` | slate-900 `#0f172a` |
| 県名ラベル・海域名 | slate-900 `#0f172a` | slate-50 `#f8fafc` |
| 県境・海岸線 | slate-500 `#64748b` | slate-400 `#94a3b8` |

推奨はこの表のとおり。理由：文字と塗り・海のコントラストは、ライトで 12.0〜16.7:1、ダークで 6.8〜17.1:1（計算した値）。県境・海岸線と海は 4.5:1（ライト）・7.0:1（ダーク）で、WCAG 1.4.11 の 3:1 を超える。隣り合う地方の色相が離れている。見た目はスクリーンショットで確かめ、直すなら PR で示す。

### 5. ダークにする範囲

F-MAP-04 はこのタスクの参照仕様だが、ページ全体のダークを受け持つタスクはない（T4-03 の axe はライト・ダークの両方でページ全体を検査する）。

- **推奨**：地図（海・県・ラベル・凡例）に加えて、ページの背景と文字の色（`<body>`）だけを変数にして切り替える。ヘッダーやカードの枠線の色は、それぞれの部品を作るタスクで直す。
- 理由：地図だけが暗いと白いページの中で浮く。背景と文字だけなら変更は小さい。

### 6. 県のパスの `role="button"` とフォーカス

`role="button"` は付けるが、`tabindex` とキー操作は T2-05（roving tabindex。4.11.6）で入れる。このタスクではフォーカスできない（推奨。理由：キー操作がないままフォーカスだけできると、押しても何も起きないボタンになる）。

### 7. 海域名と地図の大きさ

海域名は文字の大きさを viewBox の単位で24にし、幅820px以下でも出す（F-MAP-06 は幅で隠すと書いていない）。位置は日本海が (370, 470) 付近、太平洋が (830, 900) 付近で、画面で見て決める。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| U16 で除かれる島（判断 1） | 硫黄島・南鳥島・沖ノ鳥島が外に出る見込み | 除かれるのは硫黄島だけ | `prefs.topo.json` の東京都には、小笠原村の島が父島と硫黄島しか入っていない（母島・南鳥島・沖ノ鳥島は市区町村のファイルにだけある） |
| 県名ラベルの文字の大きさ（判断 3） | 全言語 16 | ja・zh 16、en 13 | 英語は横に長く、16 では重なりを避けきれない |
| `LABEL_OFFSETS`（判断 3） | 1つの表 | 言語ごと（zh は ja と共有）。`PrefPath` の `label` は `labels` | 重なる組が言語で違う |
| 海域名 | `RubyText` で出す想定 | `plainText` で出す | SVG の `<text>` の中では `<ruby>` を使えない |
| 中国地方の色（判断 4） | orange-200 / orange-800 | cyan-200 `#a5f3fc` / cyan-800 `#155e75` | 近畿（amber）と隣り合い、ライト・ダークの両方でほぼ同じ色に見えた。文字との比はライト 14.3:1、ダーク 6.9:1 |
| パスの書き方 | `geoPath(...).digits(1)`（絶対座標） | `pathContext.ts`（`M` の絶対座標＋`l` の差分、0.1 単位の整数） | レビューの指摘。パスが HTML と RSC のデータの2か所に入るため。最初の読み込みが gzip で 267KB → 228KB |
| 県コードの正規表現 | `prefPaths.ts` に書く | `projection.ts` の `PREF_CODE_PATTERN` を共有 | レビューの指摘（重複） |
| 地方の表 | なし | `regions.ts` を追加 | 凡例と地図で地方の順・クラス名を共有するため |
| 決定事項を書く章 | 開発計画 第4章 | 第5章 | 未決事項の表は第5章にあった |
