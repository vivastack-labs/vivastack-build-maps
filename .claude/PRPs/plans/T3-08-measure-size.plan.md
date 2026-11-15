# T3-08 最初の読み込みのサイズの実測：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-08
- ブランチ：`perf/T3-08-measure-size`
- 参照仕様：開発概要書 5.1、6.6 (2)、D24、7.3

## 目的

全コンテンツを HTML に埋め込む方式（D24）が、5.1 の基準値（最初に読み込む HTML＋JavaScript＋CSS が圧縮後 300KB 以下、Lighthouse スマホ 90 以上）に収まるかを、本番に近い量のコンテンツで確かめる。
結果を開発概要書 6.6 (2) に書き、超えたら言語ごとの JSON に切り替えるタスクを開発計画に加える。

参考：今のフィクスチャ（内容のある県は北海道だけ）のビルドで、`dist/ja/index.html` は圧縮前で約 600KB、`en`・`zh` は約 440KB ある（ふりがなの `<ruby>` と、RSC のデータの2回目のぶん）。

## 方針

### 1. `scripts/measure-size.ts`（T4-04 で CI にも使う）

```text
node scripts/measure-size.ts [--dist dist] [--budget 300] [--json]
```

- 言語ごと（`dist/{ja,en,zh}/index.html`）に、HTML と、その HTML が最初に読み込むファイルを数える。
  - 数えるファイル：`<script src>`、`<link rel="stylesheet" href>`、`<link rel="preload" as="script"|"style">`、`<link rel="modulepreload">`。同じファイルは1回だけ数える。
  - 数えないファイル：`__next.*.txt`（ソフトナビゲーション用の RSC データ）、市区町村の TopoJSON（最大化したとき）、動的に読む chunk、画像・アイコン。
- 圧縮後のサイズは gzip（Node の `zlib`、既定のレベル 6）を基準値と比べる。brotli（品質 11）も参考に出す（判断 1）。
- HTML の内訳も出す：HTML 全体、HTML の本体（`<script>self.__next_f.push` を除いた部分）、RSC のデータ（`self.__next_f.push` の中身）。それぞれ圧縮前・gzip 後。2回目が圧縮でどれだけ縮むかを見るため（T3-03 で分かったこと）。
- 出力は言語ごとの表（Markdown）。`--json` で JSON。
- 基準値（`--budget` KB。既定 300）を、どれか1言語でも超えたら終了コード 1。
- 純粋関数に分けて単体テストする：`assetPaths(html)`（HTML から数えるファイルのパスを取る）、`splitHtml(html)`（本体と RSC のデータに分ける）、`measure(files)`（圧縮前・gzip・brotli の合計）。ファイルの読み込みは境界（`main`）だけ。
- `dist/` の外を指すパス（`../` など）や、`/_next/` 以外の外部 URL は数えずに警告する（境界での入力検証）。

### 2. 上限まで埋めたダミーのコンテンツ：`scripts/make-max-content.ts`

```text
node scripts/make-max-content.ts --out <ディレクトリ>
```

- `content/prefectures/` の47県の基本情報（県名・県庁など）を読み、各県に次を足して、`--out` に YAML で書く（コミットしない。スクラッチ・`.gitignore` 済みの場所に出す。判断 2）。
  - 行き方1件、名物3件、名所3件（4.11.7 の「名物3つ・名所3つ」）。すべて `reviewed`。
  - 解説文は 7.3 の上限の長さ（ja こども 35字・おとな 50字、名所 25字・40字、en 20・25語／15・18語、zh 30・40字／22・30字）。
  - 日本語の文は、漢字の語の約半分に `{漢字|よみ}` のふりがなを付ける（プロトタイプの文に近い割合。判断 3）。県名・項目名・県庁所在地にもふりがな。
  - 出典は各項目に2件（タイトル約 30字、URL 約 80字。T3-04 の出典欄の大きさも入れる）。
  - 文は、同じ文の繰り返しにしない（gzip が実際より縮みすぎないよう、県ごと・項目ごとに語を入れ替える。乱数は固定のシードで、毎回同じものを作る）。
- 作ったコンテンツが `CONTENT_DIR=<out> pnpm content:validate` を通ること（文字数の警告が出ないこと）を確かめる。

### 3. 測る

1. `node scripts/make-max-content.ts --out <tmp>` → `CONTENT_DIR=<tmp> pnpm build` → `node scripts/measure-size.ts`
2. 比べるために、今の本物のコンテンツ（47県とも「準備中」）とフィクスチャでも測る。
3. Lighthouse（スマホ。既定のエミュレーション）を、上限のビルドを `wrangler dev` で配信して、3言語のトップで手元で実行する（判断 4）。Performance・LCP・CLS・TBT と、転送サイズを記録する。

### 4. 結果を書く

- 開発概要書 6.6 (2)：試算の段落の後に「実測（T3-08）」として、3通りのコンテンツの言語ごとの表（HTML 本体・RSC のデータ・JS・CSS の圧縮前／gzip 後、合計、brotli 後）と、Lighthouse の結果、結論を書く。
- 基準値を超えたら：開発計画の第3章（M3 か M4）に「言語ごとの JSON を後から読み込む方式に切り替える」タスクを足し、`docs/tasks/` に定義を書く（判断 5）。同時に、HTML を小さくするほかの手（RSC のデータからカードの内容を外す方法の調査など）があれば、候補として書く。
- 超えなかったら：その旨と余裕（何 KB）を書く。

## 先に書くテスト

| ファイル | テスト名 |
|---|---|
| `tests/unit/scripts/measure-size.test.ts` | `5.1：assetPaths は script の src・stylesheet・preload・modulepreload を重複なしで返す` |
| 同 | `5.1：assetPaths は外部の URL と dist の外を指すパスを数えない` |
| 同 | `6.6 (2)：splitHtml は HTML を本体と RSC のデータ（self.__next_f.push）に分ける` |
| 同 | `5.1：フィクスチャの dist で、HTML と、それが読み込む JS・CSS だけを数え、gzip 後のサイズを合計する`（`tests/fixtures/measure-size/dist/` に小さな HTML・JS・CSS と、数えないファイル〔`__next.*.txt`・読まれない chunk〕を置く） |
| 同 | `5.1：基準値を超えた言語があれば終了コード 1、なければ 0` |
| `tests/unit/scripts/make-max-content.test.ts` | `7.3：作った解説文は、言語・モード・種類ごとの上限の字数・語数ちょうど`（ふりがなを除いて数える。`content-rules.ts` の数え方を使う） |
| 同 | `7.1：作ったコンテンツは validateContent で誤り・警告がない` |
| 同 | `同じシードなら同じ内容になる` |

## 作る・変えるファイル（順番）

1. `scripts/measure-size.ts`、フィクスチャ `tests/fixtures/measure-size/`、単体テスト
2. `scripts/make-max-content.ts`、単体テスト
3. `package.json` に `"size": "node scripts/measure-size.ts"`（T4-04 で CI から呼ぶ）
4. 測る（メイン。上の 3）
5. 開発概要書 6.6 (2)、必要なら開発計画とタスクの定義、`AGENTS.md`（コマンドとディレクトリの表）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 測った結果を開発概要書 6.6 (2) に書いた | 6.6 (2) に「実測（T3-08）」の表と結論 |
| 基準値を超えた場合は、対応するタスクを開発計画に加えた | 超えたら第3章の表と `docs/tasks/` に新しいタスク |
| テスト条件 | 上の単体テストが通る |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`・`build`・`test:e2e` が通り、レビューで CRITICAL・HIGH がない |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 基準値と比べる圧縮の方式 | gzip（レベル 6）。brotli は参考に出す | gzip のほうが大きく出るので、どちらで配信されても基準値に収まる側に倒せる。Cloudflare が使う brotli のレベルは決められないので、数字が安定しない |
| 2 | ダミーのコンテンツの置き場所 | コミットせず、スクリプトで毎回作る（作るスクリプトとそのテストだけをコミット） | 47県×7項目×3言語の YAML は数千行になり、本物のコンテンツと紛らわしい。固定のシードで毎回同じものができる |
| 3 | ダミーのふりがなの量 | 漢字の語の約半分にふりがな | `<ruby>`・`<rt>` は HTML を大きくする主な原因。プロトタイプの文に近い量にしないと、実際より小さく出る |
| 4 | Lighthouse の実行 | 依存を足さず、`pnpm dlx lighthouse@<固定の版>` を Playwright の Chromium（`CHROME_PATH`）で手元で動かす。結果は文書にだけ書く | CI での Lighthouse（Lighthouse CI）は T4-04 で入れる。ここで依存を足すと、T4-04 の選び方を先に決めてしまう |
| 5 | 超えたときの対応 | このPRでは方式を変えず、切り替えのタスクを足すだけ | タスクの定義のとおり。方式の切り替えは JavaScript がないときの `:target` を失う大きな変更なので、別のタスクで計画と承認を取る |

## 承認後に変えたこと

オーナーの判断が要らない、細かな違い。

| 項目 | 計画 | 実際（理由） |
|---|---|---|
| 単体テストのフィクスチャの場所 | `tests/fixtures/measure-size/dist/` | `tests/fixtures/measure-size/site/`（`.gitignore` の `dist/` に当たり、コミットできないため） |
| 数えない script | `__next.*.txt`・動的 chunk・画像など | `noModule` の script も数えない（今のブラウザは読まず、Lighthouse の転送サイズにも入らないため） |
| ダミーのふりがなの量 | 漢字の語の約半分にふりがな | 漢字はすべてふりがなつきにし、文字の約半分を漢字にする（ふりがなのない漢字は `content:validate` の警告になるため。完了条件の「誤り・警告なし」を優先） |
| 語彙 | `make-max-content.ts` に含める | `scripts/max-content-words.ts` に分けた（ファイルを小さく保つため） |
| 基準値の KB | 記載なし | 1KB＝1000 バイト（DevTools・Lighthouse と同じ。小さく見積もる側） |
| 終了コード | 0・1 | 引数・ファイルの誤りは 2（超過の 1 と区別するため） |
| RSC のデータの区切り | `self.__next_f.push` の中身 | `<script>self.__next_f.push(…)</script>` の要素ごと。本体と合わせると HTML 全体の長さに一致する |
| ダミーの出力先 | `--out` | `--out` は必須。リポジトリの中なら `git check-ignore` で無視される場所だけ許す（コミットを防ぐため） |
