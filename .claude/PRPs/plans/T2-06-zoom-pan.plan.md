# T2-06 拡大・縮小・移動：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-06
- ブランチ：`feat/T2-06-zoom-pan`
- 参照仕様：開発概要書 F-ZOOM-01〜05、4.11.2（`0`・`+` `-` の行）、4.11.3、6.6 (1)、U16・D36

## 目的

地図を拡大・縮小・移動でき、最大化した県に寄れるようにする。キーボードの `+` `-` `0` は T2-11 で足す（この PR はボタン・ホイール・ピンチ・ドラッグ）。

## 方針

- **計算は純粋関数に分ける**：表示領域に収める変換・倍率の範囲・ボタン1回分の倍率・移動できる範囲を `src/features/map/viewport.ts` に置き、単体テストで 90% 以上を確かめる。d3-zoom に渡すのはその結果だけにする。
- **県の範囲はビルド時に求める**：`prefPaths.ts` が県ごとに「寄る範囲」（`fitBounds`）と「移動できる範囲」（`panBounds`）を計算し、`MapZoom`（クライアント）に props で渡す（判断 1・2）。実行時に `getBBox()` で求めると、東京都の父島を緯度で除けないため。
- **サーバーで出力した要素は描き直さない**（6.6 (2)）：d3-zoom は `<svg>` で操作を受け、`<g data-map-layer>` の `transform` 属性だけを書き換える。海の矩形（`data-map-sea`）は `<g>` の外にあり、動かない背景になる（判断 6）。
- **状態は T2-05 の Context から読む**：`useMapState()` の `maximized` が変わったら、その県に寄る（空になったら全体表示に戻す）。`mapReducer` は変えない（拡大率と表示位置は d3-zoom が持つ。`state.ts` の先頭のコメントのとおり）。

## 作る・変えるファイル（この順番）

1. 依存を足す（判断 12）：`d3-zoom`・`d3-selection`・`d3-transition`、型の `@types/d3-zoom`・`@types/d3-selection`・`@types/d3-transition`。
2. テストを先に書く（Red）。下の「先に書くテスト」。
3. `src/features/map/viewport.ts`（純粋関数。DOM を使わない）：
   - 型 `Bounds = { x0, y0, x1, y1 }`（viewBox の座標）、`ZoomTransform = { k, x, y }`（`translate(x,y) scale(k)`）。
   - 定数：`BASE_SCALE_EXTENT = [1, 8]`、`MAXIMIZED_ZOOM_IN_RATIO = 4`、`ZOOM_STEP = 1.5`、`FIT_PADDING = 0.05`（表示領域の各辺の 5%）、`ZOOM_DURATION_MS = 300`（判断 3・4・5）。
   - `fitTransform(bounds, size, padding)`：範囲を表示領域の中央に、余白を残して収める変換。`k = min(幅比, 高さ比)`。
   - `scaleExtent(fitScale: number | null)`：通常は `[1, 8]`。最大化中は `[fitScale, max(8, fitScale × 4)]`（縮小は県全体が収まる倍率まで。4.11.2）。
   - `stepScale(k, direction: 1 | -1, extent)`：ボタン1回分の倍率（`k × 1.5^direction`）を範囲に収めて返す。
   - `panExtent(panBounds: Bounds | null)`：移動できる範囲。viewBox と `panBounds` を合わせた外接矩形（最大化していなければ viewBox）。
   - 入力の検証：範囲の幅・高さが 0 以下、表示領域が 0 以下、数が有限でないときは例外。
4. `src/features/map/prefPaths.ts`：`PrefPath` に `fitBounds`・`panBounds`（`Bounds`。小数1桁に丸める）を足す（判断 1・2）。
   - `fitBounds`：描いた形（viewBox の外の島を除いた後）の外接矩形。東京都（13）だけは、北緯28度より南のポリゴン（父島・母島など）を除いて求める（D36。定数 `FIT_EXCLUDE_SOUTH_OF = { '13': 28 }`）。
   - `panBounds`：除く前の、県のすべてのポリゴンの外接矩形。東京都では硫黄島・南鳥島・沖ノ鳥島まで入り、ほかの県では viewBox の中に収まる。
5. `src/components/MapZoom.tsx`（`'use client'`。判断 7）：
   - props：`bounds: Readonly<Record<PrefCode, { fit: Bounds; pan: Bounds }>>`、ボタンの文言（`messages.zoom` の文字列）、`children`（`MapInteraction` ＋地図）。
   - `<div className="relative size-full">` の中に `children` と、右下に重ねた「＋」「−」「全体」のボタン（`ZoomControls`。同じファイルの小さなコンポーネント）。ボタンは `MapInteraction` の `<div>` の外に置く（中に置くと、ボタンのクリックが海のクリック＝固定の解除になる）。
   - `useEffect` で d3-zoom を `<svg>` に付ける：`extent` は `VIEWBOX`（jsdom は `viewBox.baseVal` を持たないので明示する）、`on('dblclick.zoom', null)`、`clickDistance(3)`（判断 9）、`on('zoom')` で `<g data-map-layer>` に `transform` を書く。`<g>` に `data-zoom-scale`（倍率）も書く（E2E が読む）。
   - `maximized` が変わったら `scaleExtent`・`translateExtent` を替え、`fitTransform` を d3 の `constrain` に通した変換へ動かす。空になったら全体表示（`k = 1`）へ。
   - 動かす関数（`zoomTo`）：`matchMedia('(prefers-reduced-motion: reduce)')` が合えば `zoom.transform` で直接（同期）、合わなければ `transition().duration(ZOOM_DURATION_MS)`（判断 5）。
   - 「＋」「−」：`zoom.scaleTo(stepScale(...))`。「全体」：`dispatch({ type: 'resetView' })` と全体表示（判断 8）。
   - ボタン：見える文字は `+`・`−`・`全体`（`RubyText`）、`+`・`−` は `aria-label`（`plainText(inLabel)`・`plainText(outLabel)`）。`type="button"`、`data-zoom="in" | "out" | "reset"`。
6. `src/components/JapanMap.tsx`：`<svg>` に `touch-none`（`touch-action: none`。4.11.3）。
7. `src/components/MapArea.tsx`：`MapInteraction` を `MapZoom` で包み、`loadPrefPaths()` から `bounds` を作って渡す。
8. `tests/e2e/zoom.spec.ts`（下の「先に書くテスト」）。
9. `tests/screenshots/pages.spec.ts`：`SCENES` に `ja-maximized`（長野県を最大化）と `ja-maximized-tokyo`（東京都を最大化。本土と伊豆諸島に寄ることを見る）を足す。`reducedMotion: 'reduce'` で動きを止めてから撮る。
10. ドキュメント：
    - `AGENTS.md` のアーキテクチャに、拡大・縮小（`MapZoom`・`viewport.ts`・`fitBounds`/`panBounds`・`data-zoom-scale`）を1項目足す。
    - `docs/tasks/m2-map-core.md` の T2-11：`+` `-` `0` は `MapZoom` の動かす関数を使うこと（キーボードから呼べるように Context か ref で渡す必要があること）を書き足す。
    - `docs/tasks/m4-*.md` の T4-06：Apple Pencil のダブルタップの確認（判断 11）と、ピンチを E2E にできなかった場合はピンチ（判断 10）を、実機確認の項目に書き足す。

## 先に書くテスト

| テストのファイル | テスト名（要件ID） | 確かめること |
|---|---|---|
| `tests/unit/features/map/viewport.test.ts` | `fitTransform は横長の範囲を表示領域の中央に収める（F-ZOOM-04）` | 幅で倍率が決まり、縦は中央。余白 5% |
| 同上 | `fitTransform は縦長の範囲を表示領域の中央に収める（F-ZOOM-04）` | 高さで倍率が決まり、横は中央 |
| 同上 | `fitTransform は幅・高さが0以下の範囲を例外にする` | 入力の検証 |
| 同上 | `scaleExtent は通常 1〜8 を返す（F-ZOOM-01）` | |
| 同上 | `scaleExtent は最大化中、県全体が収まる倍率より小さくならない（4.11.2）` | 下限＝fitScale、上限＝max(8, fitScale×4) |
| 同上 | `stepScale は1回で 1.5 倍・1/1.5 倍にし、範囲を超えない（F-ZOOM-01）` | 上限・下限で止まる |
| 同上 | `panExtent は最大化していなければ viewBox、していれば viewBox と県の範囲を合わせる（D36）` | |
| `tests/unit/features/map/prefPaths.test.ts`（既存に追加） | `fitBounds・panBounds は小さな TopoJSON の形の外接矩形になる` | 合成データで値を確かめる |
| `tests/data/`（既存の地図データの検査に追加。実データ） | `東京都の fitBounds は父島（北緯28度より南）を除く（D36）` | `fitBounds.y1` が父島の y（約1110）より上 |
| 同上 | `東京都の panBounds は viewBox の外の小笠原村まで入る（D36）` | |
| 同上 | `東京都以外の fitBounds・panBounds は viewBox の中にある` | |
| `tests/unit/components/MapZoom.test.tsx`（jsdom） | `「＋」「−」「全体」のボタンが aria-label・文字付きで出る（F-ZOOM-01・02）` | |
| 同上 | `動きを減らす設定では「＋」の直後に倍率が上がっている（F-ZOOM-05）` | `matchMedia` を差し替え、`data-zoom-scale` が 1.5 |
| 同上 | `「全体」で resetView を渡し、倍率が1に戻る（F-ZOOM-02）` | |
| `tests/e2e/zoom.spec.ts` | `「＋」で倍率が上がり、「−」で下がる（F-ZOOM-01）` | 全プロジェクト。`data-zoom-scale` |
| 同上 | `ホイールで倍率が変わる（F-ZOOM-01）` | PC だけ |
| 同上 | `「全体」で倍率が1に戻る（F-ZOOM-02）` | |
| 同上 | `拡大した後、ドラッグで表示位置が変わり、固定は変わらない（F-ZOOM-03）` | PC だけ。県の上でドラッグしても `aria-pressed` が変わらない（ドラッグの後の click が県に届かない） |
| 同上 | `最大化すると、その県の範囲が表示領域いっぱいになる（F-ZOOM-04）` | PC だけ。長野県をダブルクリック → 県のパスの外接矩形が地図の箱の中にあり、幅か高さが箱の 85% 以上 |
| 同上 | `最大化を解除すると全体表示に戻る（F-ZOOM-04）` | もう一度ダブルクリック → 倍率1 |
| 同上 | `reducedMotion: 'reduce' のとき、操作の直後に最終の位置になっている（F-ZOOM-05）` | 「＋」の直後に `data-zoom-scale` が 1.5 |
| 同上 | `ピンチで倍率が変わる（F-ZOOM-01）` | `pixel`（Chromium）だけ。CDP の `Input.dispatchTouchEvent` で2本指を動かす（判断 10） |

E2E は `[data-map-ready]` を待ってから操作する（T2-05 と同じ）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| PC で拡大・縮小・移動ができる | E2E（chromium・firefox・webkit）：ボタン・ホイール・ドラッグ・最大化 |
| スマホで拡大・縮小・移動ができる | E2E（iphone・pixel）：ボタン。ピンチは pixel で CDP（できなければ T4-06 の実機確認へ）。手元の chromium のスマホ表示で、スワイプで動くことを目で確かめる |
| 共通（1.1） | `pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジ）・`pnpm build`・`pnpm test:e2e`、レビューで CRITICAL・HIGH なし |

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 県の範囲をクライアントに渡す方法 | ビルド時に `prefPaths.ts` で求め、`MapZoom` に props で渡す（47県×8つの数、約3KB） | 実行時の `getBBox()` では東京都の父島を緯度で除けない。data 属性にすると、読むときに文字列の解析と検証が要る。props なら型のまま渡せ、量も小さい（6.6 (2) の「props に渡さない」はカードの本文の話） |
| 2 | 東京都の範囲 | 寄る範囲は北緯28度より南のポリゴンを除いた外接矩形。移動できる範囲は「viewBox と、県のすべてのポリゴンの外接矩形を合わせたもの」という県共通の規則にし、東京都では南鳥島・沖ノ鳥島まで動ける | タスクの定義と D36 のとおり。共通の規則にすれば、東京都の特別な扱いは「寄る範囲の緯度」の1つだけで済む。T2-08 は小笠原村（南鳥島・沖ノ鳥島を含む）を描くので、そこまで動ける必要がある |
| 3 | 倍率の範囲 | 通常 1〜8。最大化中は「県が収まる倍率」〜「その4倍（8より小さければ8）」 | 香川県・大阪府は収まる倍率が約15〜20になり、固定の上限では最大化した県で拡大できない。4倍あれば T2-08 の市区町村も見分けられる |
| 4 | ボタン1回分の倍率と、寄るときの余白 | 1.5倍。余白は各辺 5% | 2倍だと 1→2→4→8 の3回で上限になり、細かく合わせにくい。余白がないと県の端が枠に接して見にくい |
| 5 | 動きの時間と、動きを減らす設定 | ボタン・最大化は 300ms で動かす。`prefers-reduced-motion: reduce` のときは d3-transition を使わず、`zoom.transform` で直接（同期で）動かす | 長さ0の transition でも反映は次のフレームになり、「操作の直後に最終の位置」（F-ZOOM-05 のテスト条件）を満たさない。ホイール・ピンチ・ドラッグは d3-zoom がもともと動きなしで反映する |
| 6 | d3-zoom を付ける要素 | 操作は `<svg>` で受け、`transform` は `<g data-map-layer>` に書く（タスクの定義の「`<g>` に付ける」を、こう読み替える） | `<g>` で受けると、海の上（`<g>` の外の矩形）でホイール・ドラッグが効かない。`<svg>` で受けて `<g>` を動かすのが d3-zoom のふつうの使い方 |
| 7 | ボタンの置き場所とコンポーネントの分け方 | 新しいクライアントコンポーネント `MapZoom` が d3-zoom とボタンを持ち、`MapInteraction` を包む。ボタンは地図の箱の右下に重ねる | `MapInteraction` の中に置くと、ボタンのクリックが海のクリック（固定の解除）として扱われる。右下は太平洋で陸地も海域名もない（左上は沖縄の枠、右上は北海道） |
| 8 | 「＋」「−」「全体」で `mapReducer` に送るもの | 「全体」は `resetView` を送り（最大化を解除）、全体表示に動かす。「＋」「−」は送らない（`zoomStep` は状態を変えないので） | 「全体」は最大化していないときも全体表示に戻す必要があるので、状態の変化を待たずに直接動かす |
| 9 | ドラッグの後のクリックの区別 | d3-zoom の `clickDistance(3)`（3px まではクリックとして通す） | 既定の 0 だと、クリックのときに手が 1px ぶれただけで固定が効かなくなる。3px を超えて動かせば、d3-zoom がその後の click を止める（E2E で、県の上のドラッグで固定が変わらないことを確かめる）。タッチは d3-zoom が touchmove を止めるので click が出ない |
| 10 | ピンチの E2E | `pixel`（Chromium）で CDP の `Input.dispatchTouchEvent` を使って入れる。安定しなければ外して、T4-06 の実機確認の項目に移す | タスクの定義のとおり。WebKit（iphone）では CDP が使えないので、iPhone の確認はどちらにしても実機になる |
| 11 | Apple Pencil のダブルタップ | この PR では確かめられないので、T4-06 の実機確認の項目に書き足す | CI・手元に実機がない。`touch-action: none` で Safari の拡大が止まる想定はタスクの定義のとおり |
| 12 | 依存の版 | `d3-zoom` 3.0.1・`d3-selection` 3.0.1・`d3-transition` 3.0.2（固定の版で入れる）、型は最新の `@types/d3-zoom` 3.0.9・`@types/d3-selection` 3.0.12・`@types/d3-transition` 3.0.9 | どれも 2026-11-03 に公開された版（11日前）。導入済みの `d3-geo` 3.1.2 も同じ日に出た d3 の一斉の更新で、すでに使っている。2021年の版（`d3-zoom` 3.0.0）を選んでも、依存の範囲（`d3-selection` "2 - 3"）で新しい版が入る |
| 13 | キーボードの `+` `-` `0` | この PR では入れない（T2-11 のテスト条件 F-KB-04 にある）。T2-11 の定義に、`MapZoom` の動かす関数を使うことを書き足す | タスクの定義の実装内容にない。T2-11 はロービングの tabindex と一緒に、地図のキー操作をまとめて入れる |

## 承認後に変えたこと

- `viewport.ts` に `constrainTransform` を足した：計画は「`fitTransform` を d3 の constrain に通す」だったが、d3-zoom の constrain は `zoom.constrain()` で取り出せても、`zoom.transform` には使われず、寄る先を範囲に合わせて渡す必要がある。この計算は d3 の既定の constrain と同じ（`zoom().constrain()` の結果と一致することを単体テストで確かめた）なので、DOM を使わない純粋関数にして、`fitTransform` の結果をこの関数に通してから d3 に渡す形にした。
- `MapZoom` の props：`bounds`・`labels`（辞書の `zoom` をそのまま渡す）・`children`。見える文字は辞書の `in`・`out`・`reset`（`RubyText`）、`aria-label` は `+`・`−`・「全体」とも付けた（「全体」は読みの二重読みを避けるため）。
- 動きの途中で「＋」を押したときは、途中の倍率ではなく目標の変換から1回分進める（`pending`。レビューで、倍率だけだと寄った県から外れた位置で止まると指摘されたため、変換ごと持つ。表示の中心のまわりで倍率を変え、`constrainTransform` に通す）。操作（`sourceEvent` がある `start`）が始まったら消す。E2E で、続けて2回押して 1.5 のままになる不具合が見つかったため。
- 実データの県の範囲の検査は、新しい `tests/data/prefBounds.test.ts` に置いた（`geo.test.ts` はファイルを直接読む検査のため）。
- `interaction.spec.ts`：最大化すると県が海の矩形を覆い、Playwright の `click()` が届かなくなるので、最大化中の海のクリックは `dispatchEvent('click')` にした。
- スクリーンショットの最大化は、東京都の外接矩形の中心が海なので、`dblclick` のイベントを県のパスに直接送る。
- ピンチは pixel の CDP で入れた（`--repeat-each=6` で安定）。T4-06 には、iPhone の確認と Apple Pencil だけを書き足した。

### レビューの後に変えたこと

- 線の太さと県名ラベル・海域名の文字の大きさは、拡大しても画面の上で変わらない（オーナーの判断）。`MapZoom` が地図の層に CSS 変数 `--zoom-k`（倍率）を書き、`JapanMap` が `calc(基準 / var(--zoom-k, 1))` で大きさを決める。JavaScript がないとき・倍率1のときは今と同じ大きさ。海域名もラベルと同じ扱いにした（見た目で、拡大しても読める大きさのまま邪魔にならないため）。
- 線の太さに `vector-effect: non-scaling-stroke` は使わなかった。この指定は線の太さを「画面の CSS px」で決めるので、倍率1でも viewBox の縮尺（スマホの幅360pxでは0.36）が効かなくなり、今より太くなる。`calc(基準 / var(--zoom-k, 1))` なら倍率1で今と同じ。沖縄の点線枠の破線の間隔（`6 4`）は地図の形の一部として拡大に合わせて変わる。
- 操作（ドラッグ・ホイール・クリック）の終わりに、倍率を範囲に・位置を移動できる範囲に収める（`normalizeView`）。寄る動きを途中で止めたとき、倍率が下限より小さいまま残らないため（動かさないクリックで止めた場合も `end` が出るので直る）。
- 後片付けで `shownPref` を戻す。`attachZoom` は `zoom.transform(zoomIdentity)` で d3 の内部の変換と層をそろえる。県の範囲は `Object.hasOwn` で引く。
- E2E：`settle()` を `tests/e2e/helpers.ts` に移し、「固定は変わらない」の前に待つ。最大化中に押す隣の県は、きわどい岐阜県（21）から山梨県（19）に替えた。スクリーンショットは、寄る動きが終わるまで待つ。
