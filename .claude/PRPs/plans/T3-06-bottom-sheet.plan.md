# T3-06 スマホの下から出るパネル：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-06
- ブランチ：`feat/T3-06-bottom-sheet`
- 参照仕様：開発概要書 F-MAP-05、4.11.3、4.11.6、4.11.7

## 目的

768px 未満では、カードの領域を下から出るパネル（閉じている／一部だけ見える／全部見える）にして、地図を大きく隠さずにカードを読めるようにする。
パネルの開閉は固定の有無に合わせる（4.11.3）。768px 以上は今の配置のまま。

## 方針

### 状態

| 状態 | 条件 | 見た目（768px 未満） |
|---|---|---|
| 閉じている（`closed`） | `pinned === null` | 画面の下に隠れる（`invisible` ＋ `translate-y-full`。読み上げ・Tab からも外れる） |
| 一部だけ見える（`peek`） | 固定がない状態から固定したとき | 画面の下に固定。県の見出し（地方名・県名・県庁所在地・距離）と最大化ボタンだけ（判断 1） |
| 全部見える（`full`） | 「くわしく」を押したとき | 高さ `85dvh`、中でスクロール。カードの全部と「市区町村の一覧」 |

- 開閉は `mapReducer` の `pinned` から決める（パネル自身は開閉の状態を持たない）。`peek`／`full` だけをパネルの局所の状態にし、閉じたら `peek` に戻す。
- 開くのは固定のときだけ。マウスのホバー（`displayed`）では開かない（判断 4）。
- 固定したまま別の県に切り替えたときは、`peek`／`full` をそのままにする。

### 部品

- `CardSheet`（`src/components/`、クライアント。新規）：`CardArea` の `<section data-area="card">` の中身を包む。`CardSwitch` と同じく DOM は描き直さず、属性だけを書く。
  - マウントしたら根に `data-sheet="closed|peek|full"` を書く。768px 未満のパネルの見た目は、**`data-sheet` があるときだけ**効く `max-md:` のクラスで付ける。JavaScript がないときは今の1列の配置のまま、`:target` でカードが読める（判断 6）。
  - パネルの上端のバー（`[data-sheet-bar]`。`md:hidden`）：「くわしく」／「たたむ」のボタン（`aria-expanded`）と「とじる」のボタン。JavaScript がないと動かないので `hidden` で出し、マウントしたら外す（768px 未満の閉じたパネルの中なので、レイアウトはずれない）。
  - `peek` のときに隠す部分（行き方・名物・名所・「準備中」の文・出典・市区町村の一覧）には、`PrefCard` の側で `data-sheet-detail` を付け、`globals.css` の規則（`@media (width < 48rem) { [data-sheet='peek'] [data-sheet-detail] { display: none } }`）で隠す。カードの並びは変えない（隠すだけで、見出しの次が最大化ボタンになる）。
  - 動き：`motion-safe:transition-transform`（開閉）。`prefers-reduced-motion` では付けない。
- 新しい `MapEvent`：`{ type: 'closeCard' }` → `pinned`・`maximized` を `null` にする（判断 3）。「とじる」が送る。
  - 海のタップ（`backgroundClick`）、同じ県のタップ（`click`）、Esc で固定が外れたときも、`pinned` が `null` になるのでパネルは閉じる。最大化中の Esc は今までどおり最大化だけを解く（パネルは開いたまま）。
- 判定の純粋関数 `src/features/map/sheet.ts`：
  - `sheetState({ pinned, expanded })` → `closed`／`peek`／`full`
  - `SHEET_QUERY = '(width < 48rem)'`（Tailwind の `md` と同じ境目）

### フォーカス（4.11.6。判断 5）

- 768px 未満で、閉じている状態から開いたら、表示中のカードの県名の `<h2>`（`tabIndex={-1}`）へ `focus()` する。開く直前にフォーカスがあった県の要素（地図の県のパス、さくいんの項目。`[data-pref]`）を覚えておく。
- 閉じたら、覚えていた要素へ、なければ地図の県のパス（`path[data-pref="NN"]`）へフォーカスを戻す。閉じる前にフォーカスがパネルの中にあった場合だけ戻す（海をタップして閉じたときに、フォーカスを奪わない）。
- パネルはモーダルにしない（`role="dialog"`・`aria-modal`・フォーカスの閉じ込めをしない）。一部だけ見える状態では、地図を操作し続けるため（判断 8）。

### 768〜1023px のずれ（T3-03 で分かったこと。判断 7）

1024px 未満の1列の配置では、カードがさくいんの上にある。そのため、さくいんの項目のホバー（マウス・キーボードのフォーカス）でカードが変わると高さが変わり、さくいんがずれる。
1024px 未満では、**さくいんのホバーではカードを変えない**（クリック・Enter・Space の固定では変わる）。地図のホバーは今のまま（地図はカードより上にあるので、ずれない）。

- 実装：`PrefIndexInteraction` が `hover`・`hoverEnd` を送る前に `matchMedia('(width < 64rem)')` を見て、一致すれば送らない。
- 4.11.2・4.11.7 にこの例外を書く。

### 辞書

`sheet: { expand, collapse, close }` を3言語に足す。ja は `くわしく`／`たたむ`／`{閉|と}じる`、en は `More`／`Less`／`Close`、zh は `展开`／`收起`／`关闭`。

## 先に書くテスト

### 単体（Vitest）

| ファイル | テスト名 |
|---|---|
| `tests/unit/features/map/state.test.ts`（追加） | `4.11.3：closeCard は固定と最大化を解除する` / `closeCard は何も固定していなければ同じ状態を返す` |
| `tests/unit/features/map/sheet.test.ts` | `F-MAP-05：固定がなければ closed、固定があれば peek、広げていれば full` |
| `tests/unit/components/CardSheet.test.tsx` | `マウントすると data-sheet が付き、バーのボタンの hidden が外れる` / `4.11.3：固定するとパネルが peek で開き、固定を外すと closed になる` / `「くわしく」で full、「たたむ」で peek（aria-expanded）` / `4.11.3：「とじる」で closeCard を送る` / `4.11.6：開くと県名の見出しにフォーカスし、閉じると元の県の要素に戻す`（`matchMedia` を差し替える）/ `768px 以上ではフォーカスを動かさない` |
| `tests/unit/components/PrefIndexInteraction.test.tsx`（追加） | `1024px 未満では、さくいんのホバーでカードを変えない（クリックは固定する）` |
| `tests/unit/components/PrefCard.test.tsx`（追加） | 行き方・名物・名所・「準備中」・出典に `data-sheet-detail`、県名の `h2` に `tabIndex=-1` |

### E2E（`tests/e2e/sheet.spec.ts`。新規）

| テスト名 | プロジェクト | 確かめ方 |
|---|---|---|
| `4.11.7：県をタップすると、パネルが一部だけ見える状態で開き、見出しと最大化ボタンが見える` | iphone・pixel | 長野県（20）をタップ → `[data-sheet="peek"]`、県名の `h2` と最大化ボタンが `toBeVisible`、名物は見えない |
| `4.11.7：全部見える状態にすると、パネルの高さが画面の約85%（±5%）` | iphone・pixel | 「くわしく」→ パネルの `boundingBox().height / viewport.height` が 0.80〜0.90 |
| `4.11.3：パネルを閉じると、固定も解除される` | iphone・pixel | 「とじる」→ `[data-sheet="closed"]`、県のパスの `aria-pressed="false"`。最大化中に閉じても、最大化と固定が解ける |
| `4.11.3：海をタップすると、パネルが閉じる` | iphone・pixel | |
| `4.11.6：開くとフォーカスがパネルの見出しに移り、閉じると元の県に戻る` | iphone・pixel | さくいんの項目と地図の県の両方から |
| `幅360pxで横スクロールが出ない`（パネルを開いた状態・閉じた状態） | iphone・pixel（`setViewportSize` で幅360） | `document.documentElement.scrollWidth <= clientWidth` |
| `F-MAP-05：幅800pxではパネルにならない` | chromium（幅800） | カードが `position: static`、`[data-sheet-bar]` が見えない、固定してもカードは流れの中 |
| `F-MAP-05：JavaScript がないときは、768px 未満でもパネルにならず、:target でカードが読める` | chromium（幅375・JavaScript 無効） | |
| `動きを減らす設定では、パネルの transition がない` | iphone | `getComputedStyle(...).transitionDuration` が `0s` |
| `1024px 未満では、さくいんのホバーでカードが変わらない` | chromium（幅900） | さくいんの項目にマウスをのせてもカードの案内文のまま、クリックで固定される |

- 既存の E2E でスマホのプロジェクトがカードの中身を `toBeVisible` で確かめているものは、パネルの `full` を開いてから確かめるよう直す（必要なものだけ）。

### スクリーンショット

`ja-sheet-peek`・`ja-sheet-full`（スマホだけ。`pcOnly` の逆の「SP だけ」の印が要れば足す）。

## 作る・変えるファイル（順番）

1. `src/features/map/state.ts`（`closeCard`）、`src/features/map/sheet.ts` と単体テスト
2. 辞書 `ja.ts`・`en.ts`・`zh.ts` に `sheet`
3. `PrefCard.tsx`（`data-sheet-detail`、`h2` の `tabIndex={-1}`）、`MuniList`（`data-sheet-detail`）
4. `CardSheet.tsx` と単体テスト、`CardArea.tsx`（`CardSheet` で包む、バーを置く）、`app/globals.css`（`peek` の規則）
5. `PrefIndexInteraction`・`usePrefInteraction`（1024px 未満のさくいんのホバー）と単体テスト
6. E2E `tests/e2e/sheet.spec.ts`、既存の E2E の直し、スクリーンショットの SCENES
7. ドキュメント：開発概要書 4.11.2・4.11.3・4.11.6・4.11.7（パネルの状態・閉じるボタン・さくいんのホバーの例外）、`AGENTS.md`（アーキテクチャに「下から出るパネル」の項）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 768px 未満でだけパネルになり、768px 以上では T2-03 の配置のまま | E2E：iphone・pixel でパネル、幅800px・ipad-portrait（768px）でパネルにならない |
| テスト条件 | 上の表のテストが通る |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`・`build`・`test:e2e` が通り、レビューで CRITICAL・HIGH がない |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 一部だけ見える状態の中身 | 見出し（地方名・県名・県庁所在地・距離）と最大化ボタンだけを残し、ほかは CSS で隠す（並びは変えない） | 4.11.7 の「見出しと最大化ボタン」。最大化ボタンはカードの下のほうにあるので、高さで切ると見えない。ボタンを複製すると、同じボタンが2つになる |
| 2 | 開く・閉じるの操作 | バーのボタン（「くわしく／たたむ」と「とじる」）だけ。ドラッグでの開閉は作らない | キーボード・読み上げで使えて、E2E が安定する。ドラッグは地図のパン（d3-zoom）とタッチの扱いがぶつかりやすい。要望が出たら足す |
| 3 | 最大化中に「とじる」を押したとき | 最大化と固定の両方を解く（新しい `closeCard`） | 「閉じたら固定も解除」（4.11.3）で、最大化は固定している県だけ（4.11.1）なので、固定を外すなら最大化も解く |
| 4 | ホバーでパネルを開くか | 開かない（固定のときだけ） | 768px 未満はおもにタッチ。マウスで狭い窓のときも、のせるだけで画面の下が覆われるのは邪魔 |
| 5 | 閉じたときのフォーカスの戻り先 | 開く前にフォーカスがあった県の要素（地図の県・さくいんの項目）。なければ地図の県。パネルの中にフォーカスがあったときだけ戻す | さくいんから開いた人はさくいんに戻るのが自然。海のタップで閉じたときに、フォーカスを奪わない |
| 6 | JavaScript がないとき | 768px 未満でもパネルにせず、今の1列の配置（`:target` でカードが出る） | パネルの開閉は JavaScript で動くので、閉じたままカードが読めなくなるのを防ぐ（F-MODE-04・5.3） |
| 7 | 768〜1023px のさくいんのずれ | 1024px 未満では、さくいんのホバー（マウス・フォーカス）でカードを変えない | カードの高さを固定すると、「準備中」の県では空白が大きく、内容の多い県では中でスクロールになる。ずれの原因はさくいんのホバーだけ（地図はカードより上） |
| 8 | パネルの意味づけ | モーダルにしない（`role="dialog"` を付けない。`<section>` のまま） | 一部だけ見える状態では地図を操作し続ける。モーダルにすると、地図にフォーカスを戻せない |
| 9 | 全部見える状態の高さ | `85dvh`（中でスクロール） | 4.11.7 の「約85%」。`dvh` で、スマホのアドレスバーの出入りに合わせる |

## 承認後に変えたこと

承認した判断 1〜9 は、そのまま実装した。次の点は、実装のなかで細部を決めた（オーナーの判断が要らない範囲）。

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| `CardSheet` が出す要素 | `CardArea` の `<section>` の中身を包む | `CardSheet` が `<section data-area="card">` 自体を出し、`CardArea` は中身を `children` で渡す | `data-sheet` とパネルの見た目を `<section>` 自身に付けるため。DOM の構造は変わらない |
| 動き（`motion-safe:` のクラス） | `motion-safe:transition-transform` | `globals.css` の `[data-sheet-motion]` の規則（`translate` ＋閉じるときだけ `visibility`）。`CardSheet` がマウントの2フレーム後に `data-sheet-motion` を付ける | Tailwind v4 の `translate-y-full` は `translate` プロパティなので `transform` の遷移では動かない。`data-sheet` を最初に書いたときの「流れの中 → 画面の下」の切り替えで、パネルが滑って見えるのを防ぐ。開くときに `visibility` を遷移させると、フォーカスを移せないため、閉じるときだけにした |
| 1列の配置の幅の定数 | `matchMedia('(width < 64rem)')` を `PrefIndexInteraction` に直接 | `sheet.ts` に `ONE_COLUMN_QUERY`、`usePrefInteraction` に `isHoverSuppressed` を足して渡す | 条件の定数を1か所に置き、地図とさくいんで共通のフックのままにするため |
| 既存の E2E の直し | 「カードの中身を `toBeVisible` で確かめているものは、全部見える状態を開いてから確かめる」 | `helpers.ts` に `isSheetWidth`・`expandSheet`・`expectShown` を足し、`card.spec.ts`・`mode.spec.ts`・`interaction.spec.ts`・`layout.spec.ts` を直した。さくいんのホバーを先にして待つ手順（T3-03 の回避策）は、さくいんのホバーでカードを変えなくなったので外した | スマホでは閉じたパネルの中の案内文が見えない（`invisible`）ため、案内文は `display` で確かめる |
| 海のタップで閉じたときのフォーカスの E2E | 「フォーカスを奪わない」 | 「フォーカスを地図の県に戻さない」（海のタップでフォーカスがパネルの外へ出るので、戻らないことを確かめる）。フォーカスがパネルの外にあるときに戻さないことは、単体テストで確かめる | タップするとフォーカスがページの本体に移り、別の要素にフォーカスを置いたままタップする状況を作れないため |
