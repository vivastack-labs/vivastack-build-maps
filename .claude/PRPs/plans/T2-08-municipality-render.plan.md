# T2-08 市区町村の描画：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-08
- ブランチ：`feat/T2-08-municipality-render`
- 参照仕様：開発概要書 F-MUNI-01〜04、4.11.2（最大化中の列）、4.11.6、F-I18N-05、6.6 (1)、7.4、D16・D34・D36

## 目的

最大化した県の市区町村（政令指定都市は区）を、T2-07 で読み込んだ TopoJSON から地図に描き、名前を地図のラベルとカードの「市区町村の一覧」で確かめられるようにする。

## 方針

- **形の計算は純粋な部品に分ける**：`src/features/map/muniShapes.ts` が、検証済みの `MuniTopology` と県コードから、描くもの（市区町村ごとのパス・濃淡の段階・ラベルの位置と入る大きさ、県の外周の線）を作る。`createProjection(県コード)` だけを使う（沖縄県は点線枠に移る。小笠原村は実際の位置。D36）。`topojson-client` の `feature`・`mesh`・`neighbors` は `try` で包み、例外なら `null`（＝`invalid` の失敗）を返す。`data` は読むだけ（キャッシュと共有）。結果は `WeakMap`（キーは `MuniTopology`）に覚え、地図・カード・状態の表示の3か所で使っても計算は1回にする。
- **読み込みの状態に「描けるか」を足す**：`src/components/useMuniShapes.ts`（`useMuniData` を包む）が、`loaded` のときに `muniShapes` を呼び、`{ kind: 'loaded', data, shapes }` を返す。変換が失敗したら `{ kind: 'failed', reason: 'invalid' }` にする。`MuniStatus`・`MuniLayer`・`MuniList` はこのフックを使う（各自のインスタンス。読み込みは既定の `muniLoader` のキャッシュ・同時の読み込みのまとめで1回になる。判断 3）。
- **地図の描画**：`MuniLayer`（クライアントコンポーネント）を `JapanMap` の `<g data-map-layer>` の最後（県名ラベルの上）に置く。サーバーの出力（県のパス）は描き直さない。
  - `<g data-muni-layer data-muni-pref="NN" aria-hidden="true">` の中に、市区町村の形（`<path data-muni="01101" data-shade="0〜4">`）、県の外周の線（`<path data-muni-outline>`。`mesh` の `a === b`）、ラベル（`<g data-muni-labels>` の `<text data-muni-label>`）。
  - 最大化した県の形（1km）はそのまま下に残す（所属未定地が穴にならない）。市区町村は周りの県の上に重なるので、境界のずれ（最大約1km）は外周の線で目立たなくする。
  - 市区町村にフォーカスは当てない（4.11.6）。スクリーンリーダー向けにはカードの一覧を使うので、層は `aria-hidden`。
- **操作**：`pointer.ts` の `prefFromTarget` が `[data-muni-pref]` の祖先からも県コードを引く。市区町村の上のダブルクリックは「同じ県なら元に戻す」（4.11.2）、クリックは今までどおり何もしない。ホバーの強調は CSS の `hover:`（タッチでは効かない）。
- **ほかの県を薄くする**：`applyPrefState` が `MapInteraction` の要素に `data-map-maximized` を書き、県のパスは「最大化中で、自分が最大化した県でない」ときに不透明度 0.4（Tailwind の group の data バリアント）。最大化した県の県名ラベルは隠す（市区町村のラベルと重なるため。`[data-pref-label]` にも `data-state` を書く）。
- **ラベル**（`src/features/map/labels.ts`、純粋関数）：文字の大きさは画面の上で一定（`--zoom-k` で割る。県名ラベルと同じ）なので、倍率 `k` での「viewBox の単位の大きさ」は `文字の幅 ÷ k`。
  - 入る：ラベルの箱（推定の幅×高さ ÷ k）が、市区町村のいちばん大きなポリゴンの外接矩形に入る。
  - 重なり：優先（面積の大きい順）にとり、すでに選んだラベルの箱と重なるものは選ばない。
  - 倍率の段（1 から上限まで、約 1.19 倍ずつ）を下から順にたどり、前の段で選んだラベルは残したまま足していく。各ラベルに「出はじめる倍率」（`minScale`）を付け、表示は `minScale ≤ k` のものだけ。段を上げると箱は小さくなるので、前の段の選択は重ならないまま残り、**倍率を上げても数は減らない**（F-MUNI-02）。
  - 文字の幅は DOM を使わずに推定する（日本語・中国語は1字＝文字の大きさ、英語は1字＝0.6倍）。
  - 倍率の変化への追従：`MuniLayer` が `[data-map-layer]` の `data-zoom-scale` を `MutationObserver` で見て、ラベルの `visibility` の属性だけを書き換える（`MapZoom` は変えない。動きの途中の毎フレームで React を描き直さない）。
  - ラベルの文言：区は区名だけ（ja「中央区」＝`name.ja` から `cityName` を除く、en「Chuo-ku」＝`name.en` の「, 」より前）。中国語のページは日本語の漢字表記（F-I18N-05）。
  - 幅820px以下では隠す（県名ラベルと同じ `max-map-label:hidden`。判断 2）。
- **濃淡**（F-MUNI-01）：`neighbors` で隣を求め、隣の多い順の貪欲法（Welsh–Powell）で5段階の `data-shade` を付ける。色は `app/globals.css` の `--color-muni-0`〜`--color-muni-4`（選択中の暖色の系統。ライト・ダーク）と `--color-muni-hover`・`--color-muni-border`。クラス名は全体を書く（Tailwind が組み立てたクラス名を拾えない）。
- **カードの一覧**（4.11.6、F-I18N-05）：`MuniList`（クライアントコンポーネント）を `CardArea` の県名の下に置く。最大化中で読み込めたときだけ `<details data-muni-list>` を出す。見出しは「市区町村の一覧（194）」。項目は `code` の順で、ja・zh は `name.ja`（zh は `lang="ja"`）、en は `name.en`。名前は React のテキストとして出す。
- **中国語のページの日本語の字形**（T2-02 で分かったこと）：日本語のフォントの並びを `--font-ja` にし、`:root:lang(ja)` の `--font-sans` はそれを使う。`:root:not(:lang(ja)) [lang='ja']` に `font-family: var(--font-ja)` を宣言する（地図のラベル・一覧の項目に `lang="ja"` を付ける）。

## 先に書くテスト

### 単体：`tests/unit/features/map/labels.test.ts`

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-02: 画面上の大きさが小さい市区町村のラベルは選ばない` | 外接矩形がラベルの箱より小さい候補は、倍率1で選ばれない |
| `F-MUNI-02: 重なる2つのラベルは、片方（面積の大きいほう）だけを選ぶ` | 近い2つの候補 |
| `F-MUNI-02: 倍率を上げると、選ばれるラベルの数は減らない` | 乱数で作った多数の候補で、倍率の段ごとの数が単調に増える。前の段の選択を含む |
| `F-MUNI-02: 倍率を上げると、小さい市区町村のラベルが出る` | 倍率1で選ばれない候補が、大きな倍率で選ばれる |
| `F-MUNI-02: 上限の倍率でも入らないラベルは出ない` | `minScale` がない |
| `ラベルの幅の推定：日本語は1字＝文字の大きさ、英語は0.6倍` | `estimateLabelWidth` |
| `区は区名だけにする（ja・en）、市町村はそのまま` | `muniLabelText` |

### 単体：`tests/unit/features/map/muniShapes.test.ts`（小さな TopoJSON を手で作る）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-01: 市区町村ごとに1つのパスを作り、code・名前を持つ` | 件数・順番（`code` の順） |
| `F-MUNI-01: 隣り合う市区町村は同じ濃淡にならない` | 4つが接する格子のデータ |
| `F-MUNI-01: 県の外周の線を作る` | `outline` が空でない |
| `沖縄県（47）は点線枠の中に投影する` | ラベルの位置が `OKINAWA_FRAME` の中 |
| `ラベルの位置と外接矩形は、いちばん大きなポリゴンのもの` | 島を含む MultiPolygon |
| `T2-07：geometry が壊れていたら例外にせず null を返す` | 存在しない arc を指すなど |
| `同じ TopoJSON は1回だけ計算する` | 同じ参照を返す |

### データ：`tests/data/muni-shapes.test.ts`

- `F-MUNI-01: %s.topo.json は全件を描け、隣り合う市区町村が同じ濃淡にならない`（コミットされた47県）
- `F-MUNI-01、D16：政令指定都市は区に分かれている`（札幌市など20市で、市のコード（`01100` など）がなく区がある）

### 単体：`tests/unit/features/map/pointer.test.ts`（足す）

- `F-MUNI-04: 市区町村の形（[data-muni-pref] の中）からも県コードを引く`

### 単体：`tests/unit/features/map/mapDom.test.ts`（足す）

- `F-MUNI-04: 最大化中は根の要素に data-map-maximized を書き、解除で消す`
- `最大化した県の県名ラベルに data-state を書く`

### コンポーネント：`tests/unit/components/MuniLayer.test.tsx`・`MuniList.test.tsx`・`useMuniShapes.test.tsx`（読み込み部品は置き換える）

- `F-MUNI-01: 読み込めたら、市区町村の形を件数ぶん描く`／`最大化していなければ何も描かない`
- `F-MUNI-02: data-zoom-scale が変わると、表示するラベルが変わる`
- `F-I18N-05: 中国語のページのラベルは日本語の漢字表記で、lang="ja" が付く`
- `4.11.6: 最大化中で読み込めたときだけ「市区町村の一覧」を出し、すべての市区町村がある`
- `F-I18N-05: 英語のページの一覧はローマ字`
- `T2-07：変換に失敗したら failed（invalid）になり、MuniStatus が失敗の文言を出す`

### E2E：`tests/e2e/muni-render.spec.ts`（PC。タッチの端末はダブルクリックがないのでスキップ）

| テスト名 | 確かめること |
|---|---|
| `F-MUNI-01：最大化すると、市区町村の形の数がデータの件数と同じになる` | `data-muni-status="loaded"` を待ち、`[data-muni]` の数と `public/geo/muni/20.topo.json` の件数 |
| `F-MUNI-01、D16：北海道を最大化すると、札幌市が区に分かれている` | `[data-muni="01101"]` があり、`01100` がない |
| `F-MUNI-03：市区町村にマウスをのせると強調される` | 計算された `fill` が変わる |
| `F-MUNI-04：ほかの県が薄く表示され、別の県をダブルクリックするとその県の表示に切り替わる` | 岐阜県の不透明度 0.4 → 岐阜県をダブルクリック → `data-muni-pref="21"` |
| `F-MUNI-04：市区町村の上でダブルクリックすると元に戻る` | 4.11.2 |
| `F-MUNI-02：拡大するとラベルが増える` | 「＋」を2回押す前後で、見えるラベルの数（幅821px以上） |
| `4.11.6、F-I18N-05：「市区町村の一覧」にすべての市区町村があり、英語のページではローマ字` | ja・en |

## 作る・変えるファイル（順番）

1. `package.json`：`polylabel`（2.1.0。依存は `tinyqueue` だけ。インストールスクリプトなし）を足す（判断 1）。
2. `src/features/map/labels.ts`（テスト → 実装）
3. `src/features/map/muniShapes.ts`（テスト → 実装）、`tests/data/muni-shapes.test.ts`
4. `src/features/map/pointer.ts`・`mapDom.ts`（テストを足す → 直す）
5. `src/components/useMuniShapes.ts`、`MuniStatus.tsx`（フックを差し替える）
6. `src/components/MuniLayer.tsx`、`JapanMap.tsx`（層を置く・県のパスとラベルのクラス）、`MapInteraction.tsx`（`group/map`）
7. `src/components/MuniList.tsx`、`CardArea.tsx`、`src/i18n/ja.ts`・`en.ts`・`zh.ts`（`muni.listTitle`）
8. `app/globals.css`：`--font-ja`、`--color-muni-*`（ライト・ダーク）
9. E2E：`tests/e2e/muni-render.spec.ts`。既存の `interaction.spec.ts`・`zoom.spec.ts` で、最大化中の県をダブルクリックして元に戻す操作は、県の外接矩形の中心の座標で `page.mouse.dblclick` にする（市区町村の形が県のパスの上に重なり、`locator.dblclick()` は「ほかの要素がクリックを受ける」で止まるため。判断 6）
10. スクリーンショット：`ja-maximized`・`ja-maximized-tokyo` は `loaded` を待つ。`ja-maximized-hokkaido`、`en-maximized-list`（一覧を開く）、`zh-maximized` を足す
11. 文書：`AGENTS.md`（アーキテクチャ）、`docs/tasks/m2-map-core.md`（T2-09 に分かったこと）、`docs/tasks/m3-card-i18n-mode.md`（T3-03：`MuniList` の位置）

## 完了条件の確かめ方

- 政令指定都市のある県で、区に分かれて表示される → データの検査（20市すべて）と E2E（札幌市）、スクリーンショット（北海道）。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジ）・`pnpm build`・`pnpm test:e2e`、Opus のレビューで CRITICAL・HIGH なし。

## 判断が必要な点

| # | 項目 | 推奨 | 理由 | ほかの案 |
|---|---|---|---|---|
| 1 | ラベルの位置（形の内側の点） | `polylabel` を依存に足し、実行時に投影した座標で求める | 実績のある小さなライブラリ（mapshaper の `innerX` と同じ考え方）。データの作り直し（3.1MB の差分）と検証の変更が要らない | geo-build で `innerX`・`innerY` を付けて作り直す（実行時の計算はなくなるが、PR が大きくなる）。重心（`geoPath.centroid`）は凹んだ形で外に出る |
| 2 | 幅820px以下の市区町村のラベル | 県名ラベルと同じく隠す | 文字の大きさは viewBox の単位で一定なので、スマホでは約5pxになり読めない。名前はカードの一覧で確かめられる | 画面の幅に合わせて大きさを変える（`--map-scale` のような変数と、幅の監視が要る） |
| 3 | 3つの部品（地図・一覧・状態の表示）への配り方 | 各自が `useMuniShapes` を呼ぶ。読み込みは既定の `muniLoader` のキャッシュで1回、変換は `WeakMap` で1回 | T2-07 の想定（「地図とカードの一覧は既定の `muniLoader` のキャッシュを共有する」）のまま。`MuniStatus` のテストの作り直しが要らない | Context の Provider で1回だけ読む（部品は軽くなるが、T2-07 のテストとページの組み立てを変える） |
| 4 | 濃淡の色 | 選択中の暖色（`--color-map-selected`）の系統で5段階 | ほかの県（地方の色、薄い）と見分けやすい。地方ごとに5段階を持つと 40 色になる | 地方の色の濃淡 |
| 5 | 地図のラベルの文言 | 区は区名だけ（「中央区」「Chuo-ku」）。一覧は全体の名前（「札幌市中央区」） | 地図の上の場所を節約する。どの市の区かは地図の位置と一覧で分かる。T2-09 のツールチップは「市名＋区名」 | 地図も全体の名前 |
| 6 | 既存の E2E の「元に戻す」ダブルクリック | 座標でのダブルクリック（`page.mouse.dblclick`）に変える | 市区町村が県のパスの上に重なるので、`locator.dblclick()` は止まる。座標なら、読み込みの前後どちらでも県（または市区町村）に当たる | `force: true`（重なりの確認を飛ばすので、実際の操作と違う） |
| 7 | 最大化中のほかの県・県名ラベル | ほかの県の形は不透明度 0.4、県名ラベルはそのまま。最大化した県の県名ラベルだけ隠す | 位置の手がかりとしてほかの県の名前は残す。ラベルを薄くすると文字の対比（T4-03）が下がる | ほかの県名ラベルも隠す |
| 8 | 変換に失敗したときの「再試行」 | 同じデータで再び失敗する（読み込みのキャッシュには成功として残る） | データはCIで検査しているので、まず起きない。キャッシュから消す仕組みは YAGNI | 失敗したらキャッシュから消す |
| 9 | 倍率の変化への追従 | `MuniLayer` が `data-zoom-scale` を `MutationObserver` で見て、ラベルの属性だけを書く | `MapZoom` を変えない。動きの途中の毎フレームで React を描き直さない | `MapZoom` から倍率を Context で配る |

## 承認後に変えたこと

（実装の後に書く）
