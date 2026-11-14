# T2-07 市区町村データの読み込み：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-07
- ブランチ：`feat/T2-07-municipality-loader`
- 参照仕様：開発概要書 F-MUNI-05、4.11.5（市区町村の3行）、5.1、7.4

## 目的

県を最大化したときだけ `/geo/muni/NN.topo.json` を読み込み、遅い・失敗した・オフラインのときでも操作が止まらないようにする。
市区町村の形を描くのは T2-08。この PR は「読み込み」と「状態の表示」まで（判断 1）。

## 方針

- **読み込みは純粋な部品に分ける**：`src/features/map/muniLoader.ts` は DOM・React を使わず、`fetch`・`navigator.onLine`・タイマーを外から受け取る（単体テストで置き換えるため）。ドメインロジックなので 90% 以上を確かめる。
- **最大化は待たない**：最大化は今までどおり `mapReducer` と `MapZoom` がすぐに行う。読み込みは `state.maximized` を見て別に始め、結果は表示（文言・ボタン）にだけ使う。
- **成功だけを覚える**：成功した県はメモリに残し、2回目は fetch しない。失敗は覚えないので、「再試行」で fetch し直せる。自動の再試行はしない（4.11.5）。
- **応答の上限は15秒**（レビューで追加）：`AbortController` で1回の読み込み（本文まで）を15秒（`FETCH_TIMEOUT_MS`）で打ち切り、fetch の失敗と同じく `isOnline()` で `network`・`offline` に分ける。`MuniLoaderDeps.fetchTimeoutMs` で変えられる。開発概要書 4.11.5 の「読み込みに失敗した」の行にも書いた。
- **古い結果は捨てる**：読み込み中に別の県へ切り替えた・最大化を解除したときは、前の県の結果を表示に使わない（読み込み自体は続け、成功すれば覚える。次に開くときに速い）。

## 先に書くテスト

テスト名は実際のもの（レビューで足したものを含む）。

### 単体：`tests/unit/features/map/muniLoader.test.ts`（fetch・タイマー・オンラインの判定を置き換える）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-05: 300ms以内に終わったら slow にならない（4.11.5）` | `vi.useFakeTimers()`。299ms で解決 → 通知は `loading` → `loaded` だけ |
| `F-MUNI-05: 300msを超えたら slow になる（4.11.5）` | 300ms 進めた時点で `slow`、解決後に `loaded` |
| `F-MUNI-05: 成功すると、検証を通った TopoJSON を loaded で返す` | 結果の `data` |
| `F-MUNI-05: 404 は失敗（http）になる` | `ok: false, status: 404` → `failed`（`http`） |
| `F-MUNI-05: 通信エラーは失敗（network）になる` | fetch が reject、`isOnline()` は `true` → `failed`（`network`） |
| `F-MUNI-05: 形が不正なデータは失敗（invalid）になる：%s` | JSON でない本文・`type` 違い・`municipalities` がない など（`test.each`） |
| `F-MUNI-05: geometries の要素の属性が不正なら失敗（invalid）になる：%s` | `code`・`name.ja`・`name.en`・`kana` が文字列でない など（`test.each`） |
| `F-MUNI-05: 別の県のファイルが返ってきたら失敗（invalid）になる` | `code` が県コードで始まらない |
| `F-MUNI-05: オフラインでの失敗はオフラインの状態になる（4.11.5）` | fetch が reject、`isOnline()` は `false` → `offline` |
| `F-MUNI-05: 同じ県の2回目は fetch しない` | fetch は1回、2回目はすぐに `loaded` |
| `F-MUNI-05: 失敗の後の再読み込みは fetch し直す（再試行）` | 1回目 404、2回目 200 → fetch は2回 |
| `F-MUNI-05: 読み込み中の同じ県は fetch を1回にまとめる` | 解決前に2回 `load` → fetch は1回 |
| `F-MUNI-05: 自動では再試行しない` | 失敗の後、タイマーを進めても fetch は1回 |
| `県コードでない値（%s）は fetch せずに例外にする` | `'48'`・`'00'`・`'../x'`・`'constructor'` など |
| `4.11.5: 応答が15秒を超えたら打ち切り、失敗（network）になる` | 14,999ms では打ち切らず、15,000ms で打ち切る |
| `4.11.5: 打ち切りのとき、オフラインならオフラインの状態になる（4.11.5）` | 打ち切り＋`isOnline()` が `false` → `offline` |
| `4.11.5: 本文の読み込み中に15秒を超えても打ち切り、失敗（invalid ではなく network）になる` | `json()` の途中で中断 |
| `4.11.5: 上限は deps で変えられる` | `fetchTimeoutMs` |
| `4.11.5: 時間内に終わったら中断しない（タイマーは止まる）` | `signal.aborted` が `false` のまま |
| `F-MUNI-05: 読み込み中の Promise が reject しても残らず、次の load は fetch し直す` | `inFlight` の掃除 |
| `F-MUNI-05: 読み込み中の Promise を共有した2つ目の呼び出しにも、300ms後に slow が届く` | 2つ目の呼び出しの通知 |
| `URL は /geo/muni/NN.topo.json` | fetch に渡した URL |
| `F-MUNI-05: geometries が空なら不正` ほか `validateMuniTopology` の4件 | 空の `geometries`、数字5桁でない `code`、文字列でない `cityName`、配列・文字列・`undefined` |

### 単体：`tests/unit/features/map/muniLoader-default.test.ts`（既定のインスタンス。`vi.stubGlobal`）

- `F-MUNI-05: ブラウザの fetch で /geo/muni/NN.topo.json を読み、signal を渡す`
- `4.11.5: navigator.onLine が false のときの fetch の失敗はオフラインになる`
- `navigator がない環境での fetch の失敗は通信エラーになる`

### データ：`tests/data/muni-validate.test.ts`

- `F-MUNI-05: %s.topo.json は検証を通る`（コミットされた47県）、`別の県のファイルは検証を通らない`

### コンポーネント：`tests/unit/components/MuniStatus.test.tsx`（jsdom。ローダーを置き換える）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-05: 最大化していなければ読み込まない。live 領域は最初から DOM にあり、空である` | `load` が呼ばれない |
| `F-MUNI-05: 最大化すると、その県を読み込む` | `load('20')` |
| `4.11.5: slow になると「読み込み中」を aria-live="polite" の領域に出す` | `role="status"`・`aria-live="polite"` |
| `4.11.5: 失敗すると文言と「再試行」ボタンを出し、押すと読み込み直す` | 押すと `load` がもう一度 |
| `4.11.5: 再試行の読み込み中は、ボタンを消さずに aria-disabled にし、クリックを無視する（フォーカスを保つ）` | 同じ要素にフォーカスが残る |
| `4.11.5: 再試行でないふつうの読み込み中は、ボタンを出さない` | |
| `4.11.5: 失敗した県を解除して再び最大化したとき、最初の描画で前回の失敗を出さない` | |
| `4.11.5: slow のまま解除して再び最大化したとき、前回の「読み込み中」を出さない` | |
| `4.11.5: オフラインなら「オフラインのため表示できません」と「再試行」` | |
| `成功したら何も出さない（data-muni-status="loaded"）` | |
| `最大化を解除すると表示を消し、古い結果は使わない` | |
| `別の県に切り替えると、前の県の結果は使わない` | |
| `読み込み部品が例外を返したら、失敗として表示する（握りつぶさない）` | |

`tests/unit/components/MapArea.test.tsx` にも、`MuniStatus` が地図の箱の中（`MapInteraction` の外）にあることを確かめる1件を足した。

### E2E：`tests/e2e/muni.spec.ts`（`page.route('**/geo/muni/*.topo.json', …)` で応答を変える）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-05：最大化するまで市区町村データを読み込まない。最大化すると、その県の分を1回読み込む` | リクエストの数 |
| `F-MUNI-05：最大化は読み込みの完了を待たない（4.11.5）` | 応答を止めたまま `data-state="maximized"`・倍率 > 1 |
| `4.11.5：応答が遅いと「読み込み中」が aria-live の領域に出て、応答の後に消える` | 1.5秒遅らせる |
| `4.11.5：404 のとき最大化したまま失敗の文言と「再試行」が出て、再試行で成功する` | 2回目は本物 → `data-muni-status="loaded"` |
| `4.11.5：オフラインで最大化すると「オフラインのため表示できません」と「再試行」が出る` | `context.setOffline(true)` |
| `F-MUNI-05：同じ県をもう一度最大化しても読み込み直さない` | 最大化 → 解除 → 最大化でリクエストは1回 |

最大化はダブルクリックで行うので、`zoom.spec.ts` と同じく、タッチの端末のプロジェクトではスキップする（最大化のボタンはカード（T3-03）で入る）。

## 作る・変えるファイル（この順番）

1. テストを先に書く（Red）。上の3つ。
2. `src/features/map/muniLoader.ts`：
   - 型（コンポーネント `MuniStatus` と区別するため、実装では `MuniLoadStatus`）：`MuniLoadStatus = { kind: 'loading' } | { kind: 'slow' } | { kind: 'loaded'; data: MuniTopology } | { kind: 'failed'; reason: 'network' | 'http' | 'invalid' } | { kind: 'offline' }`。`MuniTopology` は検証を通った TopoJSON（`@types/topojson-specification` の `Topology` に、`municipalities` の属性の型を付けたもの）。
   - 定数：`SLOW_THRESHOLD_MS = 300`（4.11.5）、`MUNI_BASE_PATH = '/geo/muni/'`。
   - `createMuniLoader({ fetch, fetchTimeoutMs?, isOnline, setTimeout, clearTimeout })` → `{ load(code, onStatus): Promise<結果> }`。fetch には `AbortController` の `signal` を渡し、`FETCH_TIMEOUT_MS`（15秒）で打ち切る。成功のキャッシュ（`Map`）と読み込み中の Promise をこのクロージャーの中に持つ。`onStatus` は `loading`→（300ms を超えたら `slow`）→ 結果、の順に呼ぶ。キャッシュにあれば `loaded` だけ。
   - `validateMuniTopology(json, code)`：判断 3 の範囲だけを確かめる。合わなければ `null`。
   - 失敗の分け方：fetch の reject → `isOnline()` が `false` なら `offline`、それ以外は `network`。`!response.ok` → `http`。JSON の解析の失敗・検証の失敗 → `invalid`。
   - `muniLoader`：ブラウザの `fetch`・`navigator.onLine` を使う既定のインスタンス（モジュールで1つ。T2-08 で地図とカードの一覧が同じキャッシュを使う）。
3. `src/components/useMuniData.ts`（`'use client'` のフック）：`useMuniData(pref: PrefCode | null, loader = muniLoader)` → `{ status: MuniLoadStatus | null, isRetrying: boolean, retry: () => void }`（型 `MuniData`）。`pref` が変わったら読み込み、古い呼び出しの通知は捨てる（effect ごとの `isCurrent`）。後始末で状態を消す（同じ県を再び最大化した最初の描画に、前回の状態を出さない）。T2-08 はこのフックから `data` を受け取って描く。
4. `src/components/MuniStatus.tsx`（`'use client'`）：`useMapState()` の `maximized` で `useMuniData` を呼び、地図の箱の左上に重ねて表示する（判断 4）。
   - `<p role="status" aria-live="polite">` は常に出し、中身だけを変える（最初から DOM にないと読み上げられないことがあるため）。`slow` → `muni.loading`、`failed` → `muni.loadFailed`、`offline` → `muni.offline`（`ModeText`）。
   - `failed`・`offline` のときと、再試行の読み込み中は、live 領域の外に「再試行」ボタン（`muni.retry`、`type="button"`、`data-muni-retry`）。再試行の読み込み中は `aria-disabled="true"` にしてクリックを無視する（フォーカスを保つ）。
   - テスト用に、読み込み部品を省略できる `loader` prop で受け取る。
   - 外側の要素に `data-muni-status`（`loading`／`slow`／`loaded`／`failed`／`offline`。最大化していなければ属性なし）を書く（E2E と T2-08 が読む）。
   - 文言は props で受け取る（`MapZoom` の `labels` と同じ。辞書は `muni` に T2-02 で用意済み）。
5. `src/components/MapArea.tsx`：`[data-map-box]` に `relative` を足し、`MapZoom` の隣に `MuniStatus` を置く（`MapInteraction` の外。ボタンのクリックが地図のクリックにならないように）。
6. `tests/screenshots/pages.spec.ts`：「読み込みに失敗した状態」の場面を足す（`page.route` で 404 を返して最大化）。
7. ドキュメント：`AGENTS.md` のアーキテクチャに市区町村データの読み込みの項目を足す。`docs/tasks/m2-map-core.md` の T2-08 に「`useMuniData` の `data` から描く。`data-muni-status`」を書き足す。T4-02 に「`muniLoader` はふつうの `fetch` を使うので、Service Worker のキャッシュから返れば、オフラインでも成功になる」を書き足す。レビューの後、T2-08 に「GeoJSON に変えるところを try で包む・`data` は読むだけ・名前は React のテキストで出す」、T2-11 に「再試行に成功したらフォーカスを最大化した県に戻す」、T3-05 に「片方は `display: none` で隠す」を書き足し、開発概要書 4.11.5 に15秒の上限を書き足した。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 4.11.5 の「読み込み中」の行 | E2E（遅延）・単体（300ms の境目）・コンポーネント（`aria-live`） |
| 4.11.5 の「失敗した」の行 | E2E（404 → 再試行）・単体（404・通信エラー・形が不正、自動の再試行なし） |
| 4.11.5 の「オフライン」の行 | E2E（`setOffline`）・単体 |
| 共通（lint・typecheck・test・build、カバレッジ、レビュー） | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、E2E は `pnpm test:e2e`、Opus の code-reviewer |

## 判断が必要な点

1. **T2-07 の E2E「再試行で成功すると市区町村が表示される」の確かめ方**
   - 推奨：成功を `data-muni-status="loaded"` と文言が消えることで確かめ、形が描かれることの確認は T2-08 の E2E（「最大化すると、市区町村の形の数がデータの件数と同じになる」）に任せる。タスクの定義の文をそのように直す。
   - 理由：描くのは T2-08 の範囲（投影・濃淡・ラベル）。ここで仮に描くと T2-08 で作り直しになる。
2. **最大化の解除・別の県への切り替えのとき、読み込み中の fetch を止めるか**
   - 推奨・採用：止めない（結果は表示に使わず、成功ならキャッシュに入れる）。`AbortController` は15秒の上限（レビューで追加）にだけ使う。
   - 理由：切り替えでも止めると、分岐とテストが増える。最大のファイル（北海道）でも gzip 後 約85KB で、続けて読んでも無駄が小さく、もう一度開いたときにすぐ出せる。
3. **データの形の検証の範囲**（4.11.5「簡単に検証する」）
   - 推奨：`type === 'Topology'`、`arcs` が配列、`objects.municipalities` が `GeometryCollection` で `geometries` が配列、各要素の `properties` の `code`（5桁で、県コードで始まる）・`name.ja`・`name.en`・`kana` が文字列。`arcs` の中身・座標は見ない。レビューで、`geometries` が空なら不正、`code` は数字5桁、`cityName` は文字列かなし、を足した。
   - 理由：T2-08 が使う属性と、別の県のファイルを取り違えたことは見つけられる。座標まで調べると大きなファイルで時間がかかる。ファイル自体は CI（`tests/data/geo.test.ts`）で検査済み。
4. **「読み込み中」・失敗の表示の場所**
   - 推奨：地図の箱の左上に重ねる（右下の「＋」「−」「全体」と重ならない）。
   - 理由：最大化した県のすぐ上に出るので、何が読み込めないのかが分かる。カードはスマホでは下から出るパネル（T3-04）で隠れることがある。
5. **オフラインの判定**
   - 推奨：fetch を試し、失敗したときに `navigator.onLine === false` なら「オフライン」。最初から fetch を止めない。E2E は Playwright の `context.setOffline(true)` で確かめる。
   - 理由：T4-02 の Service Worker がキャッシュから返せば、オフラインでも見られる。先に止めると、それができなくなる。
6. **表示の文言**：T2-02 で辞書に用意した `muni.loading`・`muni.loadFailed`・`muni.offline`・`muni.retry` をそのまま使う（こども向けは「もう一度」）。新しい文言は足さない。
7. **5.1 の目安（1県分 圧縮後 100KB 以下）**：調べたところ、最大の北海道は gzip で約85KB、2番目の熊本県は約45KB で、基準内。この PR では何もしない（PR の「分かったこと」に書く）。
8. **新しい依存は足さない**：検証は手で書く（数行で済み、ajv をクライアントに入れると重い）。`topojson-client` はすでに `dependencies` にあり、この PR では使わない（GeoJSON に変えるのは T2-08）。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| 応答の上限 | なし（4.11.5 にない） | 15秒（`FETCH_TIMEOUT_MS`）で打ち切り、`network`／`offline` にする。開発概要書 4.11.5 に書き足した | コードレビューの指摘。応答が止まると「読み込み中」のまま再試行もできない。オーナーが承認 |
| 再試行の読み込み中のボタン | 失敗・オフラインのときだけ出す | 再試行の読み込み中も残し、`aria-disabled="true"` にする（`useMuniData` が `isRetrying` を返す） | 押すとボタンが消え、フォーカスが body に落ちる（WCAG 2.4.3）。`disabled` もフォーカスが外れる |
| 前回の状態の扱い | 県が違えば使わない | effect の後始末で状態を消す | 同じ県を再び最大化した最初の描画に、前回の失敗が一瞬出て、読み上げられることがあった |
| 形の検証 | 判断 3 の範囲 | 空の `geometries`、数字5桁でない `code`、文字列でない `cityName` も不正。47県の本物が通ることを `tests/data/muni-validate.test.ts` で確かめる | コードレビューの指摘。成功なのに何も描かれない、型と中身がずれる、を防ぐ |
| 型の名前 | `MuniStatus` | `MuniLoadStatus` | コンポーネント `MuniStatus` とぶつかる |
| E2E「応答が速ければ『読み込み中』は出ない」 | （実装のときに足した） | 消した | 300ms の判定が壊れても通る。境目は単体テストで確かめる |
| `MuniStatus` の props | `labels` だけ | 省略できる `loader` を足した | コンポーネントテストで読み込み部品を置き換えるため |
