# T5-05 残りの46県：新潟県の実装計画

- タスクの定義：`docs/tasks/m5-content.md` の T5-05
- ブランチ：`feat/T5-05-content-niigata`（`develop` から作成。PR は `develop` 向け）
- PR のタイトル：`feat: add content for Niigata (T5-05)`
- 参照仕様：開発概要書 第9章（9.2 の①〜④、9.3）、`content/guidelines/writing.md`、スキル `gotouchi-content`
- 手順の見本：`.claude/PRPs/plans/T5-05-content-osaka.plan.md`（県ごとに違うのは候補の項目だけ）

## 目的

新潟県（code 15、id `niigata`）の名物3・名所3・行き方を書き、`verified` まで進める（`reviewed` にするのは人のレビューの後）。データ整備の間なので、`develop` 向けの PR にする（CI・E2E は動かさない）。

## 着手時に分かっていること

- `content/prefectures/15-niigata.yaml` は基本情報だけ（`specialties: []`・`spots: []`・`access` なし）。`id`・`code`・`name`・`capital` はそのまま残す。
- 行き方を書かないと、本番では「準備中」のまま。ただし本番には `reviewed` だけが出るので、この PR で画面は変わらない。

## 手順

1. ①下書き：公式の出典（にいがた観光ナビ＝新潟県観光協会、新潟県ホームページ、JR東日本の時刻表）を実際に開いて、おとな向けの日本語と出典を書く。`pnpm content:furigana` でふりがなを付け、要確認の読みを手で直す。
2. ②照合：`gotouchi-source-checker` で出典と照合（2回まで。誤りは必ず直す）。
3. ③派生版：こども向けの日本語・英語・中国語（簡体字）を、新しい事実を足さずに作る。
4. ④検証：`gotouchi-derivative-checker` で検証（2回まで）。
5. 仕上げ：`pnpm content:validate`・yamllint・`pnpm content:furigana --check`・`pnpm typecheck`・`pnpm vitest run --project data`。誤りが0件の項目を `verified` にする。
6. コミット・push・PR（`develop` 向け）。E2E は動かさない。

## 項目の候補

| 種類 | 候補 | 理由 |
|---|---|---|
| 名物 | のっぺ | 県内全域で親しまれる郷土料理。にいがた観光ナビで確かめられる |
| 名物 | 笹団子 | 県を代表する菓子。同上。店の名前は出さない |
| 名物 | へぎそば | 魚沼地方の郷土料理。同上 |
| 名所 | 佐渡島の金山 | 2024年に世界文化遺産。新潟県ホームページで確かめられる |
| 名所 | 彌彦神社 | 越後一宮。にいがた観光ナビで確かめられる |
| 名所 | 清津峡 | 日本三大峡谷の1つ。にいがた観光ナビで確かめられる |

出典を確かめられないものは、ほかの候補に替える（替えたら PR に書く）。

## 行き方

上越新幹線 東京駅 → 新潟駅。所要時間の出典は JR東日本の列車ごとの時刻表（東京始発・毎日運転の、東京を10時台に出る「とき」から1本。`writing.md` 8）。

## 先に書くテスト

コンテンツの追加なので、新しいテストはない。`pnpm content:validate`（スキーマ・ふりがなの記法・文字数）と `tests/data/` が、件数・全言語・全モードを確かめる。

## 作る・変えるファイル

1. `.claude/PRPs/plans/T5-05-content-niigata.plan.md`（この計画）
2. `content/prefectures/15-niigata.yaml`

## 確かめ方

| 条件 | 確かめ方 |
|---|---|
| 誤りが0件 | `pnpm content:validate` |
| YAML の書式 | `yamllint -c content/.yamllint content/prefectures/15-niigata.yaml` |
| 読みが辞書と合う | `pnpm content:furigana --check content/prefectures/15-niigata.yaml`（違いは公式の表記で確かめる） |
| 型・データの検査 | `pnpm typecheck`、`pnpm vitest run --project data` |

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 名物に米（魚沼産コシヒカリなど）を入れるか | 入れない | 品種・産地のブランドは順位や宣伝に結びつきやすい（writing.md 9）。郷土料理で、観光協会の公式の紹介がある3つにした |
| 2 | 新幹線の列車の選び方 | 10:15 発の「とき315号」 | 東京を10時台に出る毎日運転の「とき」のうち、最初の1本。同じ時間帯の317号（10:41発）は111分で、数分〜10分ほどの差は目安の範囲とする |
| 3 | 出典の題名 | `<title>` のまま | 題名にふりがなの記法の括弧が含まれない。にいがた観光ナビは `<title>` を直接取って確かめる |
