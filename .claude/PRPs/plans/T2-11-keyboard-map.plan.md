# T2-11 キーボード操作：実装計画

- タスク：`docs/tasks/m2-map-core.md` の T2-11
- ブランチ：`feat/T2-11-keyboard-map`
- 参照仕様：F-KB-01〜05、4.11.2、4.11.6、WCAG 2.1.1・1.4.13・2.4.7

## 目的

キーボードだけで地図のすべての操作（県の移動・固定・最大化・拡大・縮小・全体表示・解除）ができるようにする。

## 方針

- **共通のフックにまとめる**：`MapInteraction` と `PrefIndexInteraction` の共通部分（`send`・`lastPointerType`・`data-*-ready`・`applyPrefState` の effect、ポインターの各ハンドラー、フォーカス＝ホバー・ブラーでホバー解除、修飾キーとキーの繰り返しの無視）を `src/components/usePrefInteraction.ts` に移す。地図はここにキーボードの処理が加わり、さくいんと共通の部分がさらに増えるため。キーの処理は、呼ぶ側が `onKey`（地図とさくいんで異なる）を渡す。
- **キーの規則は純粋関数**（`src/features/map/keyboard.ts`）：
  - `keyToMapEvent`（既存）に Esc を足す：`Escape` → `{ type: 'escape' }`（県がなくても返す）。地図とさくいんの両方で使う。
  - `navigateKey({ key, pref })`：←↑ → 前の県、→↓ → 次の県（県コード順）、Home → `'01'`、End → `'47'`。端では止まる（回り込まない）。ほかのキー・県なしは `null`。
  - `zoomKey(key)`：`+` → `'in'`、`-` → `'out'`、`0` → `'reset'`。ほかは `null`（`+` は Shift を押して打つ配列があるので、Shift は見ない）。
  - `rovingPref({ focused, pinned })`：Tab の停止位置になる県。フォーカス中の県 → 固定中の県 → `'01'` の順。
- **roving tabindex**：
  - サーバーの出力で、県のパスに `tabIndex`（北海道だけ `0`、ほかは `-1`）を付ける（`JapanMap` の `PrefShape`）。ハイドレーション前から停止位置が1つになる。
  - クライアントは `mapDom.ts` の新しい `applyRovingTabIndex(root, code)` で、`rovingPref` の県だけ `tabindex="0"`、ほかを `"-1"` に書く（属性だけ。描き直さない）。
  - フォーカス中の県は `MapInteraction` の状態に持つ（focus で入れ、地図の県の外へ出る blur で消す）。地図の中でフォーカスを移すときは、停止位置もその県に移す（移さないと、Shift + Tab が北海道に止まり、停止位置が2つになる）。地図の外にいる間は「固定中の県、なければ北海道」になる。
- **矢印・Home・End**：`keydown` で `preventDefault`（ページのスクロールを止める）し、移った先の県のパスに `focus()` する。ホバー（カード）は focus の処理（`:focus-visible` のときだけホバー。さくいんと同じ）に任せる。最大化中も移れる（Shift + Enter で別の県に切り替えられる。マウスのダブルクリックと同じ）。
- **`+` `-` `0`**：`MapZoom` が Context（`MapZoomContext`。`useMapZoom()` は `{ step(direction), reset() }`、`MapZoom` の外では `null`）で、ボタンと同じ関数を渡す。動きを減らす設定と、動きの途中の「＋」の目標の倍率が、ボタンと同じになる。`MapInteraction` の `keydown` から呼ぶ。地図にフォーカスがあるとき（対象が県のパス）だけ。
- **Esc**：地図・さくいんとも `dispatch({ type: 'escape' })`（`mapReducer` が「最大化中なら解除、なければ固定を解除」を既に持つ）。
  - ツールチップは、`Tooltip` が `document` の `keydown` で Esc を受けて `hit` を捨てる（次にマウスが動くまで隠れる）。フォーカスが地図の外にあっても、マウスが地図の上ならツールチップは出るので、どこで押しても消せるようにする（WCAG 1.4.13）。
- **フォーカスの枠**：県のパスに `focus-visible:` の `outline`（さくいんと同じ色：`outline-slate-900`／ダーク `outline-slate-50`）。SVG の中の outline は viewBox と拡大の倍率で太さが変わるので、太さは `calc(基準px / var(--zoom-k, 1))`（`zoomInvariant` と同じ考え方）にする。
- **地図の箱の `overflow`**：`[data-map-box]` を `overflow-hidden` から `overflow-clip` に変える。`overflow: hidden` の箱はスクロールできる要素なので、拡大中に画面の外の県へフォーカスすると、ブラウザが箱の中をスクロールして地図がずれるおそれがある。`clip` はスクロールできないので、ずれない（ページのスクロールは今までどおり起きる）。
- **再試行の後のフォーカス**：`MuniStatus` は、「再試行」を押したときにフォーカスがボタンにあったかを覚え、再試行が成功して（`loaded`）ボタンが消えたら、最大化した県のパスに `focus()` する（フォーカスが `body` に落ちないように）。マウスで押してフォーカスがなかった場合（Safari はクリックでボタンにフォーカスしない）は何もしない。

## 先に書くテスト

### 単体：`tests/unit/features/map/keyboard.test.ts`（追記）

- `F-KB-05: Escape は escape（県がなくても）`
- `4.11.6: → ↓ は次の県、← ↑ は前の県（県コード順）`
- `4.11.6: Home は北海道、End は沖縄県`
- `4.11.6: 端では止まる（北海道で ← は北海道、沖縄県で → は沖縄県）`
- `4.11.6: 矢印でないキー・県がないときは null`
- `F-KB-04: + は in、- は out、0 は reset、ほかは null`
- `F-KB-01: rovingPref はフォーカス中 → 固定中 → 北海道の順`

### 単体：`tests/unit/features/map/mapDom.test.ts`（追記。なければ新規）

- `F-KB-01: applyRovingTabIndex は指定の県だけ tabindex=0、ほかは -1`

### コンポーネント：`tests/unit/components/JapanMap.test.tsx`（追記）

- `F-KB-01: 県のパスは北海道だけ tabindex=0、ほかは -1（サーバーの出力）`
- `2.4.7: 県のパスに focus-visible の outline のクラスがある`

### コンポーネント：`tests/unit/components/MapInteraction.test.tsx`（追記。`MapStateProvider` で包む）

- `F-KB-01: 固定中の県が Tab の停止位置になり、固定を外すと北海道に戻る`
- `F-KB-01: → で次の県にフォーカスが移り、停止位置も移る`
- `F-KB-01: 地図の外にフォーカスが出たら、停止位置は固定中の県（なければ北海道）に戻る`
- `F-KB-02: Enter・Space で固定する`
- `F-KB-03: Shift + Enter で最大化する`
- `F-KB-05: Esc で最大化を解除し、もう1回で固定を解除する`
- `F-KB-04: + - 0 で useMapZoom の step(1)・step(-1)・reset を呼ぶ`（テスト用の Context の値で確かめる）
- `Ctrl・Meta・Alt つき・キーの繰り返しは無視する`
- 既存のポインターのテストはそのまま通る（共通フックへの移動の確かめ）

### コンポーネント：`tests/unit/components/PrefIndexInteraction.test.tsx`（追記）

- `F-KB-05: さくいんでも Esc で最大化を解除し、もう1回で固定を解除する`
- 既存のテストはそのまま通る

### コンポーネント：`tests/unit/components/MapZoom.test.tsx`（追記）

- `F-KB-04: useMapZoom の step・reset はボタンと同じ動きをする`（`data-zoom-scale` で確かめる）
- `useMapZoom は MapZoom の外では null`

### コンポーネント：`tests/unit/components/Tooltip.test.tsx`（追記）

- `WCAG 1.4.13: Esc でツールチップを隠し、マウスが動くとまた出る`

### コンポーネント：`tests/unit/components/MuniStatus.test.tsx`（追記）

- `T2-11: 再試行のボタンにフォーカスがあり、再試行が成功したら、最大化した県にフォーカスを戻す`
- `T2-11: ボタンにフォーカスがなかったら、フォーカスを動かさない`

### E2E：`tests/e2e/keyboard.spec.ts`（新規。`[data-map-ready]` を待ってからキーを押す）

- `F-KB-01: Tab で地図に入ると北海道にフォーカスし、カードに北海道が出る`
- `F-KB-01: 固定中の県があれば、Tab で入るとその県にフォーカスする`
- `4.11.6: → で青森県、← で北海道、End で沖縄県、Home で北海道`
- `F-KB-01: 地図の中で Tab をもう1回押すと地図の外に出る（Shift + Tab で入っても1つ）`
- `F-KB-02: Enter と Space で固定する`
- `F-KB-03: Shift + Enter で最大化する`
- `F-KB-04: + - 0 で拡大・縮小・全体表示になる`（`data-zoom-scale`）
- `F-KB-05: Esc で最大化を解除し、もう1回で固定を解除する`
- `2.4.7: フォーカス中の県の outline が none でない`
- `拡大中に画面の外の県へフォーカスしても、地図の箱がスクロールしない`（`scrollTop`・`scrollLeft` が 0、層の `transform` が変わらない）

### E2E：`tests/e2e/index.spec.ts`（追記）

- `F-KB-05: さくいんで Esc を押すと固定を解除する`

### スクリーンショット：`tests/screenshots/pages.spec.ts`

- 「キーボードで地図の県にフォーカスした」場面を足す（PC だけ。Tab で北海道に入り、→ で青森県へ）。

## 作る・変えるファイル（順番）

1. `src/features/map/keyboard.ts`：`keyToMapEvent` に Esc、`navigateKey`・`zoomKey`・`rovingPref` を足す
2. `src/features/map/mapDom.ts`：`applyRovingTabIndex`
3. `src/components/usePrefInteraction.ts`（新規）：共通のフック。`MapInteraction`・`PrefIndexInteraction` をこれで書き直す
4. `src/components/MapZoom.tsx`：`MapZoomContext`・`useMapZoom()`
5. `src/components/JapanMap.tsx`：パスの `tabIndex` と focus-visible の outline
6. `src/components/MapInteraction.tsx`：roving tabindex・矢印・Home・End・`+` `-` `0`・Esc
7. `src/components/PrefIndexInteraction.tsx`：Esc（`keyToMapEvent` の変更で入る）
8. `src/components/Tooltip.tsx`：Esc で隠す
9. `src/components/MuniStatus.tsx`：再試行の後のフォーカス
10. `src/components/MapArea.tsx`：`overflow-clip`
11. E2E・スクリーンショット
12. ドキュメント：`AGENTS.md`（キーボード操作の設計）、`docs/tasks/m2-map-core.md`（T2-11 で決めたこと：さくいんの Esc・共通フック）、必要なら `docs/development-overview.md` 4.11.6（端で止まる）

## 完了条件の確かめ方

- 「マウスを使わずに、F-KB-01〜05 の操作がすべてできる」：`tests/e2e/keyboard.spec.ts` を全7プロジェクトで通す（`gh workflow run e2e.yml` でも確かめる）。加えて、手元の Chromium で Tab・矢印・Enter・Shift + Enter・`+` `-` `0`・Esc を実際に操作して確かめる。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジ基準以上）・`pnpm build`・`pnpm test:e2e`、レビューで CRITICAL・HIGH なし。

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | `MapInteraction` と `PrefIndexInteraction` を共通のフックにまとめるか | まとめる（`usePrefInteraction`） | 地図にもフォーカス＝ホバー・修飾キーの無視が入り、同じコードが2か所でさらに増える。違いはキーの処理と、項目の外のクリックの扱いだけで、引数で渡せる |
| 2 | さくいんでも Esc を扱うか | 扱う | 4.11.2 に「さくいんのボタンもこの表に従う」とあり、表に Esc の行がある。`keyToMapEvent` に足せば、追加のコードはほぼない |
| 3 | 矢印で端（北海道・沖縄県）を越えたとき | 止まる（回り込まない） | 仕様は「前の県・次の県」で、回り込みは書いていない。Home・End で端へ飛べる。沖縄県の次が北海道になると、位置がわからなくなりやすい |
| 4 | 最大化中に矢印で別の県へ移れるか | 移れる | マウスでもほかの県をダブルクリックして切り替えられる（4.11.2）。キーボードでも Shift + Enter で切り替えられるようにする。最大化中のホバーは `mapReducer` が無視するので、カードは変わらない |
| 5 | `+` `-` `0` の対象のキー | `+`・`-`・`0` だけ（テンキーを含む。US 配列の `=` は入れない） | 仕様のとおり。Ctrl・Meta つき（ブラウザの拡大）は無視するので、ぶつからない |
| 6 | Esc でツールチップを隠す範囲 | ページのどこで押しても隠す（`document` の keydown） | ツールチップはマウスで出るので、フォーカスが地図にないときも出ている。状態の変更（固定・最大化の解除）は、地図・さくいんにフォーカスがあるときだけ |
| 7 | 県のパスの `tabIndex` をサーバーで出力するか | 出力する（北海道だけ `0`） | ハイドレーション前から Tab の停止位置が1つになり、クライアントの最初の状態とも同じになる。JavaScript がないときに北海道に止まるだけで操作はできないが、`role="button"` のパスは今も操作できないので、悪くはならない |
| 8 | フォーカスの枠の描き方 | `focus-visible:` の `outline`（太さは倍率で割る） | テスト条件が outline。SVG の outline は形の外接矩形に出て、後に描く隣の県に一部隠れることがある。スクリーンショットで見え方を確かめ、見えにくければ相談する |
| 9 | 地図の箱を `overflow-clip` にする | する | 拡大中に画面の外の県へフォーカスしたとき、`overflow: hidden` の箱はブラウザがスクロールして地図がずれるおそれがある。`clip` は見た目が同じで、スクロールしない。E2E で確かめる |
| 10 | フォーカスした県へ地図を自動で動かすか | 動かさない | 仕様にない。カードで県がわかり、`0` で全体に戻れる。動かすと d3-zoom の状態との整合が増える |

## 承認後に変えたこと

（実装後に書く）
