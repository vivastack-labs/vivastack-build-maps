# T2-05 ホバー・固定・最大化の結線：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-05
- ブランチ：`feat/T2-05-hover-pin-maximize`
- 参照仕様：開発概要書 F-CARD-01・07、F-ZOOM-04、4.11.1〜4.11.3、6.6 (2)、D24、D26

## 目的

マウスとタッチの操作を状態遷移（T2-01 の `mapReducer`）につなぎ、県を選んで固定・最大化できるようにする。
カードには仮の表示として県名だけを出す（本物のカードは T3-03）。最大化は状態だけを変える（拡大の動きは T2-06）。

## 方針

- **状態は1か所に置く**：`MapStateProvider`（クライアント）が `useReducer(mapReducer, INITIAL_MAP_STATE)` を持ち、Context で配る。DOM の要素は出さない（`<main>` のグリッドを崩さない）。後の T2-06（拡大）・T2-10（さくいん）・T2-11（キーボード）も同じ Context から `dispatch` する（判断 2）。
- **サーバーで出力した要素は描き直さない**：地図のパスもカードも、サーバーコンポーネントの出力をそのまま使い、クライアントは `useEffect` で属性（`aria-pressed`・`data-state`・`hidden`）だけを書き換える（タスクの定義、D24、6.6 (2)）。
- **画面から切り離せる部分は純粋関数にする**：DOM のイベントを `MapEvent` に変える規則と、状態を DOM の属性に写す処理を `src/features/map/` に置き、単体テストで 90% 以上を確かめる。

## 作る・変えるファイル（この順番）

1. テストを先に書く（Red）。下の「先に書くテスト」。
2. `src/features/map/pointer.ts`（純粋関数）：
   - `prefFromTarget(target: EventTarget | null): PrefCode | null`：`closest('[data-pref]')` の `data-pref` を `PREF_CODE_PATTERN`（`projection.ts`）で確かめて返す。合わなければ `null`（境界での入力検証）。
   - `toMapEvent(input: { kind: 'over' | 'out' | 'click' | 'dblclick'; pref: PrefCode | null; relatedPref?: PrefCode | null; pointerType: string }): MapEvent | null`：
     - `over`：マウス・ペン（`pointerType` が `touch` 以外）で県の上 → `hover`。タッチ・県の外 → `null`。
     - `out`：マウス・ペンで県から出て、移った先が同じ県でない → `hoverEnd`。それ以外 → `null`。
     - `click`：県 → `click`、県の外（海・余白・点線枠） → `backgroundClick`。タップもクリックとして扱う（4.11.3）。
     - `dblclick`：直前の `pointerdown` がタッチなら `null`（ダブルタップは使わない。4.11.3）。県 → `doubleClick`、県の外 → `null`。
3. `src/features/map/mapDom.ts`（DOM を受け取る。jsdom で単体テスト）：
   - `applyPrefState(root: ParentNode, state: MapState): void`：`[data-pref]` ごとに `aria-pressed`（固定中の県だけ `"true"`、ほかは `"false"`）と `data-state`（`maximized`／`pinned`／なし）を書く。値が変わる要素だけを書き換える。
   - `applyCardState(root: ParentNode, pref: PrefCode | null): void`：`[data-card-pref]` は表示する県だけ `hidden` を外し、`[data-card-guide]` は県がないときだけ表示する。
4. `src/components/MapStateProvider.tsx`（`'use client'`）：Context と `useMapState()`（Provider の外で呼ぶと例外）。
5. `src/components/MapInteraction.tsx`（`'use client'`）：地図の箱（`data-map-box`）の中身を包む `<div>`。
   - `onPointerDown`（直前の `pointerType` を ref に覚える）・`onPointerOver`・`onPointerOut`・`onClick`・`onDoubleClick` を付ける。中身は `<svg>` だけなので、`<svg>` にまとめて付けるのと同じ（イベントの委譲。判断 3）。
   - `useLayoutEffect` で `applyPrefState(ref.current, state)`（ホバーの見た目が1フレーム遅れないように）。マウントしたら `useEffect` で `data-map-ready` を付ける（E2E が、ハイドレーションの後に操作するため。判断 7）。県のパスの要素は作り直さない前提（作り直すと状態と属性がずれる）を JSDoc に書く。
6. `src/components/CardSwitch.tsx`（`'use client'`）：カードの中身を包む `<div>`。`useLayoutEffect` で `applyCardState(ref.current, cardPref(state))`。
7. `src/components/JapanMap.tsx`：県のパス1つぶんを `PrefShape` に切り出し（関数が50行を超えたため）、県のパスに `aria-pressed="false"` を付け（判断 5）、見た目のクラスを足す（判断 6）：`cursor-pointer`、マウスをのせたときの `hover:opacity-80`、固定中の `aria-pressed:fill-map-selected`。
8. `src/components/MapArea.tsx`：`JapanMap` を `MapInteraction` で包む。
9. `src/components/CardArea.tsx`：props に `prefectures` を足す。`CardSwitch` の中に、案内文（`data-card-guide`）と、47県の県名（`<p data-card-pref="NN" hidden>`。`RubyText`）を出す（判断 1）。
10. `app/[lang]/page.tsx`：`<main>` の中を `MapStateProvider` で包み、`CardArea` に `prefectures` を渡す。
11. `app/globals.css`：`--color-map-selected`（ライト・ダーク）を足す（判断 6）。
12. `tests/screenshots/pages.spec.ts`：県を固定した状態の画面（`ja-pinned`）を `SCENES` に足す（判断 9）。
13. ドキュメント：`AGENTS.md` のアーキテクチャに「操作の結線」を1項目足す。T2-06・T2-10・T2-11・T3-03 の定義に、後のタスクに関係すること（Context から `dispatch` する、`[data-card-pref]` を切り替える、`data-map-ready` を待つ）を書き足す。T3-03 には、Tailwind v4 の preflight が `[hidden]` を `display: none !important` にするので、`:target` で見せる規則にも `!important` が要ることを、T2-06 には Apple Pencil（`pen`）のダブルタップの確認項目を書き足す（レビューの指摘）。

## 先に書くテスト

### 単体（node / jsdom）

- `tests/unit/features/map/pointer.test.ts`
  - `F-CARD-01：マウスで県にのると hover になる`・`ペンでも hover になる`
  - `4.11.3：タッチで県にのっても hover にならない`
  - `4.11.1：マウスで県から海へ出ると hoverEnd になる`・`県の中の別の要素へ移っても hoverEnd にならない`
  - `F-CARD-07：県のクリック（タップを含む）は click になる`
  - `4.11.2：海・余白のクリックは backgroundClick になる`
  - `F-ZOOM-04：マウスで県をダブルクリックすると doubleClick になる`・`4.11.3：タッチのダブルクリック（ダブルタップ）は無視する`・`県の外のダブルクリックは無視する`
  - `prefFromTarget：data-pref の祖先の県コードを返す`・`県コードの形でない値は null`・`data-pref がなければ null`（jsdom）
- `tests/unit/features/map/mapDom.test.ts`（jsdom）
  - `4.11.2：固定中の県だけ aria-pressed が true になり、data-state が pinned になる`
  - `F-ZOOM-04：最大化中の県は data-state が maximized になる`
  - `固定を解除すると aria-pressed が false に戻り、data-state がなくなる`
  - `4.11.1：表示する県のカードだけ hidden が外れ、案内文が隠れる`・`県がないときは案内文だけが見える`

`pointer.test.ts`・`mapDom.test.ts` は `.test.ts` に置き、先頭の `// @vitest-environment jsdom` で jsdom で動かす。

### コンポーネント（jsdom）

- `tests/unit/components/MapInteraction.test.tsx`（`MapStateProvider` ＋ `MapInteraction` ＋ `CardSwitch` を小さな SVG で組む）
  - `F-CARD-01：マウスで県にのると、カードの県名が変わる`
  - `4.11.1：県から海へマウスを動かしても、カードは残る`
  - `F-CARD-07：クリックで固定すると aria-pressed が true になり、別の県にのってもカードが変わらない`
  - `4.11.2：同じ県のクリックと海のクリックで固定が解除される`
  - `F-ZOOM-04：ダブルクリックで最大化と固定になる`
  - `4.11.3：タッチでは、のってもカードが変わらず、ダブルクリックしても最大化しない`
  - `マウントすると data-map-ready が付く`
  - `useMapState を Provider の外で使うと例外になる`
- `tests/unit/components/CardArea.test.tsx`（更新）：`47県の県名が hidden で出て、案内文が見える`
- `tests/unit/components/JapanMap.test.tsx`（更新）：`5.2：県のパスはどれも aria-pressed="false" で始まる`

### E2E（`tests/e2e/interaction.spec.ts`）

県の要素を引く関数を引数に取る形にして、T2-10 でさくいん（F-IDX-02）でも同じテストを回せるようにする（判断 10）。
操作の前に `[data-map-ready]` を待つ。「変わらない」ことを確かめる前には、`settle()`（`requestAnimationFrame` を2回待つ）で操作の反映を待つ（待たないと、反映の前の DOM を見て空振りする）。ホバーの対象は、外接矩形の中心が自分の形の中にある県（例：長野県 20・岐阜県 21）にする（東京都は島を含むので中心が海になる）。

- PC（`hasTouch` でないプロジェクト：chromium・firefox・webkit）
  - `F-CARD-01：県にホバーすると、カードの県名が変わる`
  - `4.11.1：県から海へマウスを動かしても、カードは残る`
  - `F-CARD-07：クリックで固定し、別の県にホバーしてもカードが変わらない`
  - `4.11.2：同じ県のクリックで固定を解除する`・`4.11.2：海のクリックで固定を解除する`
  - `F-ZOOM-04：ダブルクリックで最大化と固定になる`・`4.11.2：最大化中のクリックでは何も変わらない`
  - `4.11.2：固定中に別の県をクリックすると、固定がその県に移る`
  - `4.11.2：最大化中に同じ県をダブルクリックすると最大化だけが解け、固定は残る`
  - `4.11.2：最大化中に別の県をダブルクリックすると、その県に切り替わる`
- スマホ・タブレット（`hasTouch` のプロジェクト：iphone・pixel・ipad-portrait・ipad-landscape）
  - `4.11.3：タップで固定する`
  - `4.11.3：同じ県を続けて2回タップしても最大化しない`（`tap()` を2回続けても `dblclick` が出るとは限らないので、タッチの `dblclick` の除外は `MapInteraction.test.tsx` で確かめる）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| PC とスマホの両方で、固定と最大化の状態が 4.11.2 のとおりに変わる | `pnpm test:e2e`（7プロジェクト）で上の E2E が通る。PR の前に `gh workflow run e2e.yml -f project=all` |
| 共通（開発計画 1.1） | `pnpm lint`・`pnpm typecheck`・`pnpm test`（`src/features/map/` は 90% 以上）・`pnpm build`。レビューで CRITICAL・HIGH なし |

## 判断が必要な点

1. **カードの仮の表示の作り方** — 推奨：47県の県名をサーバーで `hidden` 付きで出し、クライアントは `hidden` を切り替えるだけにする。
   理由：T3-03 が同じ方式（47県のカードを出して `hidden` を外す）なので、切り替えの仕組みをそのまま引き継げる。県名をクライアントコンポーネントの props に渡す方式は簡単だが、6.6 (2)「内容を props に渡さない」に反し、T3-03 で作り直しになる。
2. **状態の置き場所** — 推奨：`<main>` の中を包む Context（`MapStateProvider`。DOM を出さない）。
   理由：地図とカードは `<main>` のグリッドの別のセルにあり、両方が同じ状態を見る。T2-06・T2-10・T2-11 も同じ状態に `dispatch` する。外部の状態ライブラリは要らない大きさ。
3. **イベントを付ける場所** — 推奨：`<svg>` だけを包む `<div>` に、React のイベント（`onPointerOver` など）で付ける。
   理由：中身が `<svg>` だけなので「svg にまとめて付ける」と同じ働きになり、`addEventListener` の付け外しを書かずに済み、Testing Library で確かめやすい。T2-06 の d3-zoom は `<svg>` に付くので、ぶつからない（クリックとドラッグの区別は T2-06 で確かめる）。
4. **マウスとタッチの区別** — 推奨：ホバーは `pointerover`／`pointerout` の `pointerType` で、マウス・ペンだけを扱う。`click`・`dblclick` は `pointerType` を確実に持たないブラウザがあるので、直前の `pointerdown` の `pointerType` を覚えて使う。
   理由：タップでも `pointerover` が先に起きるので、タッチを除かないと「ホバー → 固定」が二重に動く。ダブルタップは `dblclick` を起こす端末があるので、タッチの `dblclick` を無視しないと「2回タップで最大化」になる（4.11.3）。
5. **状態を表す属性** — 推奨：`aria-pressed`（固定中の県だけ `true`。サーバーでは全部 `false` で出す）と `data-state`（`maximized`／`pinned`／なし）。
   理由：`role="button"` に `aria-pressed` があると、スクリーンリーダーが「切り替えボタン」として固定の有無を読む。サーバーで `false` を出しておかないと、最初は普通のボタンとして読まれ、固定すると切り替えボタンに変わってしまう。最大化は `aria-pressed` では表せないので `data-state` で分け、T2-06 の見た目の切り替えにも使う。
6. **見た目** — 推奨：マウスをのせた県は `hover:opacity-80`（少し薄く）、固定中・最大化中の県は塗りを新しい変数 `--color-map-selected`（ライト：amber-400 `#fbbf24`、ダーク：amber-600 `#d97706`）にする。`cursor-pointer` を付ける。
   理由：8地方の色はどれも寒色〜中間色なので、暖色の塗りで固定した県がはっきり分かる。枠線を太くする方式は、後に描く隣の県に線が隠れるので使わない（DOM の順を変えると描き直しになる）。Tailwind の `hover:` は `(hover: hover)` のときだけ効くので、タッチで色が残らない。色の値は仮で、T4（アクセシビリティの検査）で見直せる。
7. **ハイドレーションの目印** — 推奨：`MapInteraction` がマウントしたら `data-map-ready` を付け、E2E は操作の前にそれを待つ。
   理由：JS の読み込みとハイドレーションの前のクリックは失われ、E2E がまれに失敗する。待つ目印を決めておくと、T2-06〜T2-11 の E2E も同じ書き方で待てる。
8. **E2E のプロジェクトの分け方** — 推奨：PC の操作は `hasTouch` でないプロジェクト（chromium・firefox・webkit）、タップの操作は `hasTouch` のプロジェクト（iphone・pixel・iPad 2つ）で動かし、ほかは `test.skip` する。
   理由：Playwright の iPad のエミュレーションはタッチの端末（`hasTouch`）として動く。タスクの定義の「スマホ」には、同じタッチの規則（4.11.3）に従うタブレットも入れる。
9. **スクリーンショット** — 推奨：`SCENES` に `ja-pinned`（長野県をクリックして固定した状態）を足す。最大化は見た目が変わらない（拡大は T2-06）ので撮らない。
   理由：このタスクで変わる見た目は、固定した県の塗りとカードの県名だけ。
10. **E2E を T2-10 で使い回す形** — 推奨：テストの本体を「県の要素を引く関数」を受け取る形にして、今は地図の `path[data-pref]` で呼ぶ。
    理由：T2-10 の定義に「T2-05 のテストを、地図とさくいんの両方で実行する形にする」とある。今その形にしておくと、T2-10 は呼ぶ側を1つ足すだけで済む。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| `JapanMap` | 県のパスに属性とクラスを足す | パス1つぶんを `PrefShape` に切り出した | 属性が増えて、関数が50行（`max-lines-per-function`）を超えた |
| 属性の書き換え | `useEffect` | `useLayoutEffect`（`data-map-ready` は `useEffect` のまま） | レビューの指摘。ホバーの見た目が、画面を一度描いた後に1フレーム遅れて変わるため。React 19 の SSR では警告が出ない |
| E2E の「変わらない」の確かめ方 | ホバーの直後に確かめる | `settle()` で反映を待ってから確かめる | レビューの指摘。待たないと、壊れた実装でも通る（わざと壊して落ちることを確かめた） |
| E2E の 4.11.2 の行 | PC 7本 | PC 10本（固定を移す、最大化中の同じ県・別の県のダブルクリックを追加） | レビューの指摘。完了条件「4.11.2 のとおり」に関わる行を E2E でも確かめる |
| E2E の海の操作 | 画面の座標を計算して操作する | `locator.hover/click({ position })` | 画面の高さを超える位置を `page.mouse` で操作すると届かず、空振りする |
| E2E の県名の比べ方 | 表示の文字列で比べる | `<rt>`（ふりがな）を除いて比べる | ふりがなが本文に入り、`toHaveText` が合わない |
