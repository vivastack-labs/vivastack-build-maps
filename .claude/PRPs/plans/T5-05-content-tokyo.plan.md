# T5-05 東京都（13）の制作計画

- タスクの定義：`docs/tasks/m5-content.md` の T5-05
- ブランチ：`feat/T5-05-content-tokyo`（`develop` 向けの PR）
- PR のタイトル：`feat: add content for Tokyo (T5-05)`
- 参照仕様：開発概要書 第9章・7.1・7.3、`content/guidelines/writing.md`、`content/schema/prefecture.schema.json`、スキル `gotouchi-content`

## 目的

`content/prefectures/13-tokyo.yaml` に、名物3・名所3・行き方を書き、`verified` まで進める（`reviewed` にするのは人のレビューの後）。`id`・`code`・`name`・`capital` は変えない。

## 着手時に分かっていること

- 東京都は、「東京からの行き方」の起点そのもの。カードには東京からの距離の行を出さない（`docs/architecture/card.md`）。
- 一方、本番で内容を出す条件（`isComplete`：`access` があり、名物・名所が1件以上で、すべて `reviewed`）には `access` が要る。**`access` を書かないと、東京都は本番で永遠に「準備中」のまま**になる。スキーマ（`access` は任意）と執筆ルール（`writing.md` 8）に、東京都の特例は書かれていない。
- フィクスチャ（`tests/fixtures/content/13-tokyo.yaml`）の東京都は、`access` が「東京駅 → 新宿駅」の電車（15分）。テスト用のダミーで、事実ではない。

## 進め方

1. スキル `gotouchi-content` を引数 `13` で動かす。①下書き（公式の出典のページを実際に開く）→ ②照合（`gotouchi-source-checker`）→ ③派生版 → ④検証（`gotouchi-derivative-checker`）。照合・検証は2回まで（誤りが0件になるまで）。
2. 確かめる：`pnpm content:validate`、`yamllint -c content/.yamllint content/prefectures/13-tokyo.yaml`、`pnpm content:furigana --check content/prefectures/13-tokyo.yaml`、`pnpm typecheck`、`pnpm vitest run --project data`。E2E は動かさない（データ整備の間は動かさない決まり）。
3. 通った項目の `status` を `verified` にする。
4. コミット（計画 → コンテンツ）→ push → `develop` 向けの PR。

## 選ぶ項目（候補。①で開いて確かめられたものだけ）

| 種類 | 候補 | 出典 |
|---|---|---|
| 名物 | もんじゃ焼き | 農林水産省「うちの郷土料理」東京都 |
| 名物 | にぎりずし（江戸前の屋台から） | 同上 |
| 名物 | 江戸切子 | 東京都産業労働局「東京の伝統工芸品」 |
| 名所 | 浅草寺（雷門） | 浅草寺の公式サイト |
| 名所 | 東京スカイツリー | 公式サイト |
| 名所 | 明治神宮 | 公式サイト |

食べ物の名物は、農林水産省の東京都のページにある3品（深川めし・にぎりずし・もんじゃ焼き）のうち2品にし、3つ目は工芸品（江戸切子）にして、種類をばらけさせる。

## 行き方

東京駅 → 新宿駅（JR 中央線快速）。出典は JR 東日本の列車ごとの時刻表（`timetables.jreast.co.jp`）。東京を10時台に出る平日の快速（1041T）の、東京の発時刻と新宿の着時刻の差を `durationMin` にする。

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 東京都の `access` | 書く。「東京駅 → 新宿駅」の電車。起点（東京駅）から県庁所在地（新宿区）の代表駅へ | 書かないと本番で「準備中」のまま（`isComplete`）。スキーマを変えずに済み、フィクスチャの形とも合う。カードには「東京からの距離」の行が出ないので、行き方だけが東京の「着き方」になる |
| 2 | 所要時間の選び方 | 東京10時台発の平日の快速（`writing.md` 8 の新幹線の選び方に合わせる） | 県ごとに選び方がずれないようにする。中央特快（10:05発、新宿10:19着）も同じ14分 |
| 3 | 名物の種類 | 食べ物2・工芸品1 | 3つとも食べ物だと、名所との重なりはないが、カードが単調になる |
