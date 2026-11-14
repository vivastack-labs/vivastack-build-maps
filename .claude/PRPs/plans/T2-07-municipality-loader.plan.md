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

### 単体：`tests/unit/features/map/muniLoader.test.ts`（fetch・タイマー・オンラインの判定を置き換える）

| テスト名（要件ID入り） | 確かめること |
|---|---|
| `F-MUNI-05: 300ms以内に終わったら slow にならない（4.11.5）` | `vi.useFakeTimers()`。299ms で解決 → 状態の通知は `loading` → `loaded` だけ |
| `F-MUNI-05: 300msを超えたら slow になる（4.11.5）` | 300ms 進めた時点で `slow` が通知され、解決後に `loaded` |
| `F-MUNI-05: 404 は失敗（http）になる` | `ok: false, status: 404` → `failed`（`reason: 'http'`） |
| `F-MUNI-05: 通信エラーは失敗（network）になる` | fetch が `TypeError` で reject、`isOnline()` は `true` → `failed`（`reason: 'network'`） |
| `F-MUNI-05: 形が不正なデータは失敗（invalid）になる` | JSON でない本文、`type` が `Topology` でない、`objects.municipalities` がない、`geometries` の要素の `code`・`name.ja`・`name.en`・`kana` が文字列でない、`code` が県コードで始まらない → いずれも `failed`（`reason: 'invalid'`）（`test.each`） |
| `F-MUNI-05: オフラインでの失敗はオフラインの状態になる（4.11.5）` | fetch が reject、`isOnline()` は `false` → `offline` |
| `F-MUNI-05: 同じ県の2回目は fetch しない` | 成功の後にもう一度 `load` → fetch は1回、すぐに `loaded`（`slow` にならない） |
| `F-MUNI-05: 失敗の後の再読み込みは fetch し直す（再試行）` | 1回目 404、2回目 200 → fetch は2回、2回目は `loaded` |
| `F-MUNI-05: 読み込み中の同じ県は fetch を1回にまとめる` | 解決前に2回 `load` → fetch は1回、両方 `loaded` |
| `F-MUNI-05: 自動では再試行しない` | 失敗の後、タイマーを進めても fetch は1回のまま |
| `県コードでない値は fetch せずに例外にする` | `'48'`・`'../x'` → 例外（境界の検証。`PREF_CODE_PATTERN`） |
| `URL は /geo/muni/NN.topo.json` | fetch に渡した URL |

### コンポーネント：`tests/unit/components/MuniStatus.test.tsx`（jsdom。ローダーを置き換える）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-05: 最大化していなければ読み込まない` | 初期表示で `load` が呼ばれない。live 領域は空 |
| `F-MUNI-05: 最大化すると、その県を読み込む` | `doubleClick` を dispatch → `load('20')` |
| `4.11.5: slow になると「読み込み中」を aria-live="polite" の領域に出す` | `role="status"`・`aria-live="polite"` の要素の中に文言。live 領域は最初から DOM にある |
| `4.11.5: 失敗すると文言と「再試行」ボタンを出し、押すと読み込み直す` | `failed` → 「市区町村を読み込めませんでした」とボタン。押すと `load` がもう一度呼ばれる |
| `4.11.5: オフラインなら「オフラインのため表示できません」と「再試行」` | `offline` の文言 |
| `成功したら何も出さない（data-muni-status="loaded"）` | 文言なし。状態の属性だけ |
| `最大化を解除すると表示を消し、古い結果は使わない` | 読み込み中に解除 → 後から失敗しても文言は出ない |
| `別の県に切り替えると、前の県の結果は使わない` | `20` の読み込み中に `21` へ → `20` の失敗は表示しない |

### E2E：`tests/e2e/muni.spec.ts`（`page.route('**/geo/muni/*.topo.json', …)` で応答を変える）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-05: 最大化するまで市区町村データを読み込まない` | ページを開いてもリクエストがない。最大化すると `20.topo.json` が1回 |
| `F-MUNI-05: 最大化は読み込みの完了を待たない（4.11.5）` | 応答を止めたまま、県の `data-state="maximized"` と `data-zoom-scale` > 1 になる |
| `4.11.5: 応答が遅いと「読み込み中」が aria-live の領域に出る` | 応答を1.5秒遅らせる → `role=status` の中に「読み込み中」。応答の後に消える |
| `4.11.5: 404 のとき最大化したまま失敗の文言と「再試行」が出て、再試行で成功する` | 1回目 404、2回目は本物を返す → 文言・ボタン → 押すと `data-muni-status="loaded"`、文言が消える。最大化のまま |
| `4.11.5: オフラインで最大化すると「オフラインのため表示できません」` | `context.setOffline(true)` の後に最大化（判断 5） |
| `F-MUNI-05: 同じ県をもう一度最大化しても読み込み直さない` | 最大化 → 解除 → 最大化で、リクエストは1回 |

最大化は既存の E2E（`zoom.spec.ts`）と同じ方法（ダブルクリック）で行う。タッチの端末のプロジェクトでは、`zoom.spec.ts` と同じ扱い（スキップするか、同じ代わりの操作）にそろえる。

## 作る・変えるファイル（この順番）

1. テストを先に書く（Red）。上の3つ。
2. `src/features/map/muniLoader.ts`：
   - 型（コンポーネント `MuniStatus` と区別するため、実装では `MuniLoadStatus`）：`MuniLoadStatus = { kind: 'loading' } | { kind: 'slow' } | { kind: 'loaded'; data: MuniTopology } | { kind: 'failed'; reason: 'network' | 'http' | 'invalid' } | { kind: 'offline' }`。`MuniTopology` は検証を通った TopoJSON（`@types/topojson-specification` の `Topology` に、`municipalities` の属性の型を付けたもの）。
   - 定数：`SLOW_THRESHOLD_MS = 300`（4.11.5）、`MUNI_BASE_PATH = '/geo/muni/'`。
   - `createMuniLoader({ fetch, isOnline, setTimeout, clearTimeout })` → `{ load(code, onStatus): Promise<MuniStatus> }`。成功のキャッシュ（`Map`）と読み込み中の Promise をこのクロージャーの中に持つ。`onStatus` は `loading`→（300ms を超えたら `slow`）→ 結果、の順に呼ぶ。キャッシュにあれば `loaded` だけ。
   - `validateMuniTopology(json, code)`：判断 3 の範囲だけを確かめる。合わなければ `null`。
   - 失敗の分け方：fetch の reject → `isOnline()` が `false` なら `offline`、それ以外は `network`。`!response.ok` → `http`。JSON の解析の失敗・検証の失敗 → `invalid`。
   - `muniLoader`：ブラウザの `fetch`・`navigator.onLine` を使う既定のインスタンス（モジュールで1つ。T2-08 で地図とカードの一覧が同じキャッシュを使う）。
3. `src/components/useMuniData.ts`（`'use client'` のフック）：`useMuniData(pref: PrefCode | null, loader = muniLoader)` → `{ status: MuniStatus | null, retry: () => void }`。`pref` が変わったら読み込み、古い呼び出しの通知は捨てる（呼び出しごとの番号で比べる）。T2-08 はこのフックから `data` を受け取って描く。
4. `src/components/MuniStatus.tsx`（`'use client'`）：`useMapState()` の `maximized` で `useMuniData` を呼び、地図の箱の左上に重ねて表示する（判断 4）。
   - `<p role="status" aria-live="polite">` は常に出し、中身だけを変える（最初から DOM にないと読み上げられないことがあるため）。`slow` → `muni.loading`、`failed` → `muni.loadFailed`、`offline` → `muni.offline`（`ModeText`）。
   - `failed`・`offline` のときだけ、live 領域の外に「再試行」ボタン（`muni.retry`、`type="button"`、`data-muni-retry`）。
   - 外側の要素に `data-muni-status`（`loading`／`slow`／`loaded`／`failed`／`offline`。最大化していなければ属性なし）を書く（E2E と T2-08 が読む）。
   - 文言は props で受け取る（`MapZoom` の `labels` と同じ。辞書は `muni` に T2-02 で用意済み）。
5. `src/components/MapArea.tsx`：`[data-map-box]` に `relative` を足し、`MapZoom` の隣に `MuniStatus` を置く（`MapInteraction` の外。ボタンのクリックが地図のクリックにならないように）。
6. `tests/screenshots/pages.spec.ts`：「読み込みに失敗した状態」の場面を足す（`page.route` で 404 を返して最大化）。
7. ドキュメント：`AGENTS.md` のアーキテクチャに市区町村データの読み込みの項目を足す。`docs/tasks/m2-map-core.md` の T2-08 に「`useMuniData` の `data` から描く。`data-muni-status`」を書き足す。T4-02 に「`muniLoader` はふつうの `fetch` を使うので、Service Worker のキャッシュから返れば、オフラインでも成功になる」を書き足す。

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
   - 推奨：止めない（結果は表示に使わず、成功ならキャッシュに入れる）。
   - 理由：`AbortController` を足すと分岐とテストが増える。最大のファイル（北海道）でも gzip 後 約85KB で、続けて読んでも無駄が小さく、もう一度開いたときにすぐ出せる。
3. **データの形の検証の範囲**（4.11.5「簡単に検証する」）
   - 推奨：`type === 'Topology'`、`arcs` が配列、`objects.municipalities` が `GeometryCollection` で `geometries` が配列、各要素の `properties` の `code`（5桁で、県コードで始まる）・`name.ja`・`name.en`・`kana` が文字列。`arcs` の中身・座標は見ない。
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

## レビュー後の変更

- 同じ県を解除して再び最大化したとき、最初の描画に前回の状態（失敗・読み込み中）を出さない（`useMuniData` の effect の後始末で捨てる）。
- 「再試行」の読み込み中は、ボタンを消さずに `aria-disabled="true"` にしてクリックを無視する（フォーカスを保つ）。成功して消えるときのフォーカスの戻し先は T2-11 に申し送った。`useMuniData` は `isRetrying` を返す。
- fetch に15秒の上限（上の方針）。
- 検証を厳しくした：`geometries` が空なら不正、`code` は数字5桁、`cityName` は文字列かなし。47県の本物のデータが通ることを `tests/data/muni-validate.test.ts` で確かめる。T2-08 への申し送りは T2-08 の定義に書いた。
- `inFlight` の掃除を `.finally` にし、`load` の `slow` タイマーも例外のときに止める。既定の `muniLoader` の単体テスト（`muniLoader-default.test.ts`）を足した。
- E2E の「応答が速ければ『読み込み中』は出ない」は、壊れていても通るので消した（300ms の境目は単体テストで確かめる）。
- T3-05 の定義に「片方は `display: none` で隠す」を書き足した。
