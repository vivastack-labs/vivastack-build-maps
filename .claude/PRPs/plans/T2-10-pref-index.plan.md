# T2-10 県名さくいん：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-10
- ブランチ：`feat/T2-10-pref-index`
- 参照仕様：開発概要書 F-IDX-01〜03、4.11.2（「県名さくいんのボタンも、この表に従う」・キーボードの対応）、4.11.6、4.11.7、5.2、5.3（JavaScript なし）、6.6 (2)

## 目的

地図を見られない・使えない利用者も、8地方ごとの県名の一覧から、地図と同じ操作（ホバー・クリック・ダブルクリック）と同じ情報（カード）にたどり着けるようにする。

## 方針

- **さくいんの中身はサーバーで出力する**：`src/components/PrefIndex.tsx`（サーバー）が、8地方（`REGIONS` の順）ごとに、見出し `<h3>`（辞書の `regions`。凡例と同じ色見本を `aria-hidden` で添える）と、県名の `<ul>` を出す。`IndexArea` の見出し `<h2>` の下に置く。領域にランドマーク・`aria-label` は付けない（AGENTS.md の画面の枠組み）。
- **県名の項目（判断 1）**：`<a href="#pref-NN" role="button" tabIndex={0} aria-pressed="false" data-pref="NN">県名</a>`。
  - JavaScript がないときはリンクとして動き、ハッシュが `#pref-NN` になる（6.6 (2)。`:target` でカードを見せるのは T3-03）。
  - 仕様（F-IDX-01・4.11.2）は「県名ボタン」なので `role="button"` にし、固定中を `aria-pressed` で表す（ARIA では `aria-pressed` はリンクに付けられず、axe の `aria-allowed-attr` に当たるため）。
  - `tabIndex={0}`：Safari（WebKit）は既定では Tab でリンクに止まらない。ボタンとして Tab でたどれるように明示する（F-IDX-03）。E2E の WebKit で確かめる。
  - `data-pref` を付けるので、状態の書き換えは地図と同じ `applyPrefState`（`aria-pressed`・`data-state`）、県の引き当ては `prefFromTarget` をそのまま使う。
  - 見た目：固定中は `aria-pressed:` で背景を `--color-map-selected`、文字は濃い色（ライト・ダークとも 4.5:1 以上）。最大化中は `data-[state=maximized]:` で太字などを足す。フォーカスは `focus-visible:` の枠。押せる大きさは 24px 以上（WCAG 2.5.8）。
- **操作の結線**：`src/components/PrefIndexInteraction.tsx`（クライアント。`PrefIndex` の `<ul>` たちを `children` で包む）。`MapInteraction` と同じく、イベントは根でまとめて受け（委譲）、`toMapEvent`・`prefFromTarget` で `MapEvent` にして `useMapState()` の `dispatch` に渡す。状態は `useLayoutEffect` で `applyPrefState(根, state)`。
  - ポインター：`pointerover`・`pointerout`・`click`・`dblclick`（`pointerType` は直前の `pointerdown` のもの。`MapInteraction` と同じ）。
  - **項目の外（項目と項目の間・見出し）のクリックは無視する（判断 4）**。`toMapEvent` が返す `backgroundClick` は地図の海の操作なので、さくいんでは捨てる（固定が外れない）。
  - **JavaScript があるときは、項目のクリックでリンクの移動を止める（判断 2）**（`preventDefault`）。ハッシュの反映（`history.replaceState`）は T3-07 で行う。移動させると、ページが飛び、ダブルクリックでも2回移動する。
  - **キーボード（判断 3）**：4.11.2 の「フォーカス＝ホバー、Enter／Space＝クリック、Shift + Enter＝ダブルクリック」をさくいんにも当てる。規則は純粋関数 `keyToMapEvent({ key, shiftKey, pref })`（`src/features/map/keyboard.ts`。T2-11 の地図でも使う）。キー操作は DOM の `click` を経由させず、`keydown` で `preventDefault` してから `dispatch` に直接渡す（Shift + Enter はブラウザがリンクを新しいウィンドウで開くので、止める必要がある）。フォーカス＝ホバーは、キーボードでのフォーカス（`:focus-visible`）のときだけ（タップでフォーカスが移ったときにホバーを出さない。4.11.3）。フォーカスが外れたら `hoverEnd`。
  - マウントしたら根に `data-index-ready` を付ける。E2E はさくいんを操作する前にこれを待つ。
- **E2E は T2-05 のテストをそのまま回す**：`tests/e2e/interaction.spec.ts` の県の要素を引く関数を、地図とさくいんの2つで回す。ただし、最大化中の県を押す2か所は、地図では `clickAtCenter`・`dblclickAtCenter`（市区町村の形が上に重なるため）、さくいんでは `locator.click()`・`dblclick()`（さくいんは地図の下にあり、座標で押す関数は自動でスクロールしない）にする必要がある。**`PrefLocator`（関数）を、`locate` と「最大化中の県のクリック・ダブルクリック」を持つオブジェクト `PrefTarget` に変える（判断 5）**。タスクの定義の「関数を足して配列に1行足す」から少し変わる。固定・最大化の状態は、今までどおり地図のパスで確かめ、さくいんの項目の `aria-pressed`・`data-state` も同じであることを足して確かめる。

## 先に書くテスト

### 単体：`tests/unit/features/map/keyboard.test.ts`

- `4.11.2: Enter はクリック`
- `4.11.2: Space はクリック`
- `4.11.2: Shift + Enter はダブルクリック`
- `ほかのキー・県がないときはなし`

### コンポーネント：`tests/unit/components/PrefIndex.test.tsx`

- `F-IDX-01: 8地方の見出し（h3）を地方の順に出す（ja・en・zh）`
- `F-IDX-01: 47県の項目を、地方ごとに県コードの順に出す`
- `6.6 (2): 項目は href="#pref-NN" の a で、role="button"・aria-pressed="false"・data-pref・tabindex="0" を持つ`
- `項目の県名は言語ごとの名前（ja はふりがな付き）`

### コンポーネント：`tests/unit/components/PrefIndexInteraction.test.tsx`（`MapStateProvider` で包み、状態は属性で確かめる）

- `F-IDX-02: マウスで項目にのせると hover（カードの県が変わる）`
- `F-IDX-02: クリックで固定し、項目の aria-pressed が true になる`
- `F-IDX-02: ダブルクリックで最大化＋固定（data-state="maximized"）`
- `4.11.3: タッチでは pointerover でホバーしない`
- `判断 4: 項目の外のクリックでは固定が外れない`
- `判断 2: 項目のクリックでリンクの移動を止める（defaultPrevented）`
- `4.11.2: Enter・Space で固定、Shift + Enter で最大化。いずれも keydown の既定の動作を止める`
- `4.11.2: キーボードのフォーカスでホバー、フォーカスが外れると hoverEnd`
- `マウントすると data-index-ready が付く`

### コンポーネント：`tests/unit/components/IndexArea.test.tsx`（直す）

- 今の見出しのテストに、`PrefIndex` の中身（47の項目）が入ることを足す。`IndexArea` は `prefectures` を受け取る形になる。

### E2E：`tests/e2e/index.spec.ts`（新規）

- `F-IDX-01：8地方の見出しと、47の県名がある`（ja・en・zh）
- `F-IDX-03：Tab キーで47の県名を県コードの順にたどれる`（PC のプロジェクト）
- `6.6 (2)：JavaScript を無効にすると、県名のクリックで URL のハッシュが #pref-NN になる`（`test.use({ javaScriptEnabled: false })`）

### E2E：`tests/e2e/interaction.spec.ts`（直す）

- 判断 5 の形にし、末尾の配列に「さくいん」を足す（T2-05 の PC のマウス操作10本・タッチ操作2本を、さくいんでも回す。F-IDX-02）。

## 作る・変えるファイル（順番）

1. `src/features/map/keyboard.ts` と単体テスト
2. `src/components/PrefIndex.tsx`（サーバー）とテスト
3. `src/components/PrefIndexInteraction.tsx`（クライアント）とテスト
4. `src/components/IndexArea.tsx`（`prefectures` を受け取り、`PrefIndex` を入れる）、`app/[lang]/page.tsx`（`prefectures` を渡す）、テストを直す
5. `tests/e2e/index.spec.ts`、`tests/e2e/interaction.spec.ts`
6. `tests/screenshots/pages.spec.ts` に、長野県を固定してさくいんを見せる場面を足す
7. `AGENTS.md` のアーキテクチャに、さくいんの項目を足す。`docs/tasks/m2-map-core.md`（T2-11）に、`keyToMapEvent` を使えることを書き足す

## 完了条件の確かめ方

- 「さくいんの操作の結果が、地図の操作と同じになる」：`interaction.spec.ts` の T2-05 のテストが、地図とさくいんの両方で全プロジェクト（PC 3・スマホ 2・タブレット 2）で通る。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジの基準以上）・`pnpm build`・`pnpm test:e2e` が通る。レビューで CRITICAL・HIGH がない。

## 判断が必要な点

| # | 項目 | 推奨 | 理由 | ほかの案 |
|---|---|---|---|---|
| 1 | 項目の要素 | `<a href="#pref-NN" role="button" tabIndex={0} aria-pressed>` | 仕様は「県名ボタン」。JS なしでもリンクで動く。`aria-pressed` はリンクには付けられない（axe が違反にする）。`applyPrefState` をそのまま使える | 素のリンク（`aria-pressed` の代わりに `aria-current`）。状態を書く関数を別に作る必要があり、読み上げは「リンク」になる |
| 2 | JS があるときのクリック | リンクの移動を止める | ページが飛ばない。ハッシュの反映は T3-07 で `replaceState` で行う | 移動させる（カードの位置へスクロールし、ダブルクリックで2回移動する） |
| 3 | さくいんのキーボード | このタスクで入れる（Enter・Space＝クリック、Shift + Enter＝ダブルクリック、キーボードのフォーカス＝ホバー） | 4.11.2 は「さくいんもこの表に従う」、F-IDX-03 は「地図の代わりの操作手段」。`role="button"` なら Space で動くのが当然。規則は純粋関数にして T2-11 でも使う | Enter（リンクの既定の `click`）だけにして、残りは T2-11 に回す（T2-11 の定義は地図だけを扱っている） |
| 4 | さくいんの項目の外のクリック | 無視する | 「海・余白のクリックで固定を解除」は地図の操作。さくいんの余白で固定が外れると驚く | 地図と同じく固定を解除する |
| 5 | E2E の県の要素の渡し方 | `PrefLocator`（関数）を `PrefTarget`（`locate` と最大化中のクリック・ダブルクリック）に変える | 最大化中の県は、地図では座標で押す必要があり、さくいんは座標で押すとスクロールしないので押せない | テストの中で「さくいんならこう」と分岐する（テストに条件が入る） |
