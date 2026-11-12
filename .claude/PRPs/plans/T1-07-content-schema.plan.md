# T1-07 コンテンツのスキーマと読み込み：実装計画

- タスクの定義：`docs/tasks/m1-geo-content.md` の T1-07
- 参照仕様：7.1〜7.3、10.2、4.11.4、9.3、12.3（`ci.yml`）、D4
- ブランチ：`feat/T1-07-content-schema`

## 方針

- 検証は2段にする。
  1. **形**（JSON Schema・ajv）：項目・型・列挙・件数（3件か0件）・`https://`・空の文字列。
  2. **内容のルール**（`src/lib/content-rules.ts`）：ファイル名と `code`・`id`、`id` の重複、ふりがな（T1-06 の `checkRuby`）、文字数（7.3）、`sources` が空。形が通った県だけを見る。
- 誤り・警告は同じ形 `{ file, line?, path, message }` にそろえる。`path` は `specialties[0].description.ja.kids` の形。行は YAML のノードの位置から出す（書く人がすぐ場所を探せるように）。
- アプリと検証スクリプトは、どちらも `src/lib/content.ts` の関数を使う。型はスキーマから作った `src/lib/content-schema.generated.ts`。
- `scripts/` は Node.js で直接動かすので、`src/lib/content.ts` からの import は相対パスに `.ts` を付ける（`./ruby.ts`）。スキーマの JSON は `import ... with { type: 'json' }` で読む。

## 入れるライブラリ（判断1）

| パッケージ | 版 | 置き場所 | 用途 |
|---|---|---|---|
| `yaml` | 2.9.1 | dependencies | YAML の読み込み。ノードの位置（行・列）が取れる。YAML 1.2 なので `accessed: 2026-11-11` が文字列のまま、`no` が `false` にならない。キーの重複を誤りにする |
| `ajv` | 8.20.0 | dependencies | JSON Schema（draft-07）での検証 |
| `json-schema-to-typescript` | 16.0.0 | devDependencies | スキーマから型を作る（`pnpm content:types`） |

どれもインストールスクリプトはない（`allowBuilds` は変えない）。

## スキーマ（`content/schema/prefecture.schema.json`、draft-07）

- どのオブジェクトも `additionalProperties: false`。文字列は `minLength: 1`。
- `id`：`^[a-z]+(-[a-z]+)*$`。`code`：`01`〜`47`（文字列）。`region`：8地方の列挙。
- `name`・`capital.name`：`{ ja, en, zh }`。`capital.lat`：20〜46、`capital.lon`：122〜154（日本の範囲。細かい範囲は T1-08 のデータの検査）。
- `access`：**省略できる**（未作成の県）。`emoji`・`mode`・`route`・`durationMin`（1以上の整数）・`sources`・`status`。
- `specialties`・`spots`：**必ず書く**。`minItems`・`maxItems` ではなく「`maxItems: 0` か、`minItems: 3, maxItems: 3`」の `oneOf`。項目は `id`・`emoji`（名所では省略できる）・`name`・`description`（`{ ja: { kids, adult }, en: {...}, zh: {...} }`）・`sources`・`status`。
- `sources[]`：`title`・`url`（`^https://`）・`accessed`（`^\d{4}-\d{2}-\d{2}$`）。
- `status`：`draft`・`verified`・`reviewed`。

## 先に書くテスト

フィクスチャ（`tests/fixtures/content/`）を一時ディレクトリにコピーし、テストごとに1か所だけ書き換えて検証する（`tests/unit/lib/content-helpers.ts` に書き換えの道具を置く）。

### `tests/unit/lib/content.test.ts`（node）

| テスト条件 | テスト名 |
|---|---|
| 正しいYAMLは通る | `7.1：フィクスチャ（全項目の県・reviewed と verified が混ざった県・未作成の県）は誤りなく通る` |
| 未作成のYAMLも通る | `7.1：名物・名所が空で、行き方がない県は通る` |
| 名物が2件 → 誤り | `7.1：名物が2件なら誤りにする（3件か0件だけ）` |
| 英語のこども向けがない → 誤り | `7.1：英語のこども向けの文がなければ誤りにする（場所 specialties[0].description.en）` |
| `status: done` → 誤り | `7.1：status が draft・verified・reviewed 以外なら誤りにする` |
| `http://` → 誤り | `7.1：出典の URL が https:// でなければ誤りにする` |
| （加えた）知らない項目・空の文字列 | `7.1：スキーマにない項目は誤りにする`、`7.1：空の文字列は誤りにする` |
| （加えた）YAML の構文・キーの重複 | `7.1：YAML の構文の誤りとキーの重複は、行を含む誤りにする` |
| ふりがなの誤り → 場所が入る | `7.2：ふりがなの誤りは、ファイル名と場所（specialties[0].description.ja.kids）と行を含む誤りにする` |
| （加えた）ふりがなを見る項目 | `7.2：ふりがなは日本語の文だけを見る（中国語の漢字・出典のタイトルは警告にしない）` |
| （加えた）ふりがなのない漢字 → 警告 | `7.2：ふりがなの付いていない漢字は警告にする` |
| 文字数が範囲外 → 警告だけ | `7.3：解説文の文字数が範囲外なら警告にし、誤りにはしない`（上限・下限の両方） |
| 英語は語数 | `7.3：英語は語数で数える` |
| （加えた）ふりがなを除いて数える | `7.3：日本語の文字数は、読みを除いて数える` |
| `sources: []` → 警告 | `9.3：出典が空なら警告にする` |
| （加えた）ファイル名 | `7.1：ファイル名（NN-id.yaml）と code・id が合わなければ誤りにする`、`7.1：NN-id.yaml の形でないファイルは誤りにする` |
| （加えた）`id` の重複 | `7.1：県の id・code が重複したら誤りにする`、`7.1：県の中で名物・名所の id が重複したら誤りにする` |
| `CONTENT_DIR` | `7.1：CONTENT_DIR で読み込むディレクトリが変わる`、`7.1：CONTENT_DIR がなければ content/prefectures/ を読む` |
| （加えた）ディレクトリ | `7.1：ディレクトリがなければ誤りにする`、`7.1：YAML が1つもなければ、誤りなく0件を返す` |
| （加えた）アプリ用の読み込み | `7.1：loadContent は誤りがあれば、すべての誤りを含むエラーを投げる`、`7.1：loadContent は県を code の順に返す` |

### `tests/unit/scripts/validate-content.test.ts`（node）

| テスト条件 | テスト名 |
|---|---|
| 誤り → 終了コード1 | `7.1：誤りがあれば、誤りを出して終了コード1` |
| 警告だけ → 終了コード0 | `7.3：警告だけなら、警告を出して終了コード0` |
| （加えた）出力の形 | `7.1：1行に1件、「ファイル:行 場所 メッセージ」の形で出す` |

### `tests/unit/scripts/content-types.test.ts`（node）

| テスト条件 | テスト名 |
|---|---|
| 型が最新 | `7.1：コミットした型（src/lib/content-schema.generated.ts）が、スキーマから作った型と一致する` |

## 作る・変えるファイル（順番）

1. 依存を入れる（`pnpm add yaml@2.9.1 ajv@8.20.0`、`pnpm add -D json-schema-to-typescript@16.0.0`）
2. `content/schema/prefecture.schema.json`
3. `scripts/content-types.ts`（`pnpm content:types`）と、生成した `src/lib/content-schema.generated.ts`（Prettier で整えてから書く）
4. `tests/fixtures/content/01-hokkaido.yaml`（全項目 `reviewed`）、`13-tokyo.yaml`（`reviewed` と `verified` が混ざる）、`47-okinawa.yaml`（名物・名所が空、行き方なし）
5. テスト（Red）→ `src/lib/content.ts`（読み込み・スキーマ・位置）、`src/lib/content-rules.ts`（内容のルール）→ `scripts/validate-content.ts`（`pnpm content:validate`）
6. `content/prefectures/.gitkeep`（T1-08 までは0件で通る）
7. `.github/workflows/ci.yml`：「Unit test」の後に `pnpm content:validate`（文書だけのPRでは飛ばす）
8. 文書：開発概要書 7.1（スキーマの補足）・7.3（範囲外を警告、数え方）・12.3（`（後で）` を外す）、`AGENTS.md`（コマンド・技術スタック・ディレクトリ）、T1-08・T5 のタスクの定義（分かったことがあれば）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 生成した型で `pnpm typecheck` が通る | `content.ts` が生成した型を使い、`pnpm typecheck` が通る。型が古ければ `content-types.test.ts` が失敗する |
| CIで `pnpm content:validate` が実行される | `ci.yml` の手順を加え、PR の CI のログで実行されたことを見る |
| 共通（lint・typecheck・test・build、カバレッジ、レビュー） | コマンドを実行。`src/lib/` は 90% 以上 |

画面は変わらないので、スクリーンショットは撮らない。

## 判断が必要な点

| # | 項目 | 推奨案 | 理由 |
|---|---|---|---|
| 1 | ライブラリ | 上の表のとおり `yaml`・`ajv`・`json-schema-to-typescript`。`ajv-formats` は入れず、日付は正規表現で見る | `yaml` は位置が取れ、YAML 1.2 なので日付や `no` が勝手に変わらない（js-yaml は日付を `Date` にする）。`ajv-formats` は日付の形のためだけに依存を増やすことになる（2024年から更新がない） |
| 2 | JSON Schema の版 | draft-07 | ajv の既定で、json-schema-to-typescript が最もよく対応している。2020-12 の機能は要らない |
| 3 | 生成した型の扱い | **コミットする**。スキーマから作った型と一致するかをテストで確かめる | ビルド・typecheck の前に生成の手順が要らない。スキーマを変えて型を作り直し忘れると CI で止まる |
| 4 | 行き方・名物・名所が「空」の書き方 | `access` は省略する。`specialties`・`spots` は `[]` を必ず書く | T1-08 で「行き方は空」とあり、行き方は1件のオブジェクトなので省略が自然。名物・名所は書き忘れと区別するため、空でもキーを書かせる |
| 5 | ふりがなを見る項目 | 日本語の文すべて（`name.ja`・`capital.name.ja`・`access.mode.ja`・`access.route.ja`・名物・名所の `name.ja`・`description.ja.*`）。出典の `title` は見ない | D2：ふりがなはこども・おとなの両方に効く。出典のタイトルは出典のページの表記のまま書くので、記法を入れない |
| 6 | 文字数の警告 | 上限を超えたときと、下限に足りないときの両方で警告。日本語・中国語は空白を除いた字数（読みを除く。𩸽 などは1字）、英語は空白で区切った語数。7.3 を「範囲外なら警告」に直す | タスクの定義は「範囲外」、7.3 は「上限を超えたら」と食い違う。短すぎる文もカードの見た目が崩れる（7.3 の根拠）ので、両方を知らせる。警告なのでコンテンツは止まらない |
| 7 | `id` の重複 | 県の `id`・`code` は全ファイルで重複しない。名物・名所の `id` は、その県の中（名物と名所を合わせて）で重複しない | 名物・名所の `id` は県の中での識別子（HTML の id は県と組み合わせて作れる）。県をまたいで同じ `id`（例：`ramen`）を禁じる理由はない |
| 8 | ファイルとディレクトリ | 読むのは `*.yaml`（`.` で始まるファイルは無視）。名前が `NN-id.yaml` でない `.yaml`・`.yml` は誤り。ディレクトリがなければ誤り。0件なら誤りにしない。`content/prefectures/.gitkeep` を置く | `CONTENT_DIR` の打ち間違いをすぐ見つける。0件は T1-08 までの状態で、47件そろっているかは T1-08 のデータの検査で見る |
| 9 | 誤りの出し方 | `ファイル名:行 場所 メッセージ`（例：`01-hokkaido.yaml:23 specialties[0].description.ja.kids 2文字目：読みが空です`）。誤りと警告を分けて、すべて出してから終了する | 1件ずつ止まると直す往復が増える。行があればエディタですぐ開ける |
| 10 | アプリ用の関数 | `validateContent(dir)`（誤り・警告・県の一覧を返す）と、`loadContent(dir)`（誤りがあれば例外、県を `code` の順に返す）。どちらも `dir` を省くと `CONTENT_DIR`、なければ `content/prefectures/` | ビルドは誤りがあれば止め、検証スクリプトは全部を報告する。本番の `reviewed` だけの絞り込みは T3-02（`publish.ts`）の役目なので、ここでは入れない |
| 11 | フィクスチャ | 北海道（全項目 `reviewed`）、東京都（`reviewed` と `verified` が混ざる）、沖縄県（名物・名所が空、行き方なし）。文はテスト用に短く書き、`sources` は空にする。緯度経度はフィクスチャ用の値（T1-08 で調べたものではない、とコメントに書く） | 4.11.4 の3つの場合（全部出す・準備中・未作成）を E2E で試せる。確かめていない URL を出典に書かない（9.3）ため、出典は空にする（警告は出るが誤りではない） |
| 12 | CI での実行 | `check` job の「Unit test」の後に `pnpm content:validate` を足す。文書だけのPRでは飛ばす（ほかの手順と同じ） | 12.3 の概略のとおり。YAML の変更は文書だけのPRに入らないので、コンテンツのPRでは必ず動く |

## 承認後に変えたこと

（実装の後に書く）
