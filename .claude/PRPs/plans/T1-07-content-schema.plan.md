# T1-07 コンテンツのスキーマと読み込み：実装計画

- タスクの定義：`docs/tasks/m1-geo-content.md` の T1-07
- 参照仕様：7.1〜7.3、10.2、4.11.4、9.3、12.3（`ci.yml`）、D4
- ブランチ：`feat/T1-07-content-schema`
- この計画は実際の内容に合わせてある。承認したときの内容は、このファイルの最初のコミットと、末尾の「承認後に変えたこと」にある。

## 方針

- 検証は2段にする。
  1. **形**（JSON Schema・ajv）：項目・型・列挙・件数（3件か0件）・`https://`・空や空白だけの文。
  2. **内容のルール**（`src/lib/content-rules.ts`）：ファイル名と `code`・`id`、名物・名所の `id` の重複、ふりがな（T1-06 の `checkRuby`）、英語・中国語の文の記法、文字数（7.3）、`sources` が空。形が通った県だけを見る。県の `id`・`code` のファイルをまたぐ重複は `src/lib/content.ts` で見る。
- 誤り・警告は同じ形 `{ file, line?, path, message }` にそろえる。`path` は `specialties[0].description.ja.kids` の形。行は、その項目の名前（キー）の行（配列の要素は要素の行）。場所のノードがなければ親をたどる。
- 読めないファイル（ディレクトリ・権限・エイリアス）も、例外ではなく誤りとして返し、ほかのファイルの検証を続ける。YAML のエイリアスは `toJS({ maxAliasCount: 0 })` で使えないようにする。
- アプリと検証スクリプトは、どちらも `src/lib/content.ts` の関数を使う。型はスキーマから作った `src/lib/content-schema.generated.ts`。
- `scripts/` は Node.js で直接動かすので、`src/lib/` の相対の import には `.ts` を付ける（`./ruby.ts`）。スキーマの JSON は `import ... with { type: 'json' }` で読む。Next.js のビルドでも読めることを、ページから一時的に `loadContent` を呼んで確かめた（フィクスチャのふりがなが HTML に出た。確かめた後に戻した）。

## 入れたライブラリ（判断1）

| パッケージ | 版 | 置き場所 | 用途 |
|---|---|---|---|
| `yaml` | 2.9.1 | dependencies | YAML の読み込み。ノードの位置（行）が取れる。YAML 1.2 なので `accessed: 2026-11-11` が文字列のまま、`no` が `false` にならない。キーの重複を誤りにする |
| `ajv` | 8.20.0 | dependencies | JSON Schema（draft-07）での検証 |
| `json-schema-to-typescript` | 16.0.0 | devDependencies | スキーマから型を作る（`pnpm content:types`） |

どれもインストールスクリプトはない（`allowBuilds` は変えない）。

## スキーマ（`content/schema/prefecture.schema.json`、draft-07）

- どのオブジェクトも `additionalProperties: false`。文は `pattern: "\\S"`（空や空白だけを誤りにする）。
- `id`（県・名物・名所）：`^[a-z]+(-[a-z]+)*$`。`code`：`01`〜`47`（文字列）。`region`：8地方の列挙。
- `name`・`capital.name`：`{ ja, en, zh }`。`capital.lat`：20〜46、`capital.lon`：122〜154（日本の範囲。細かい範囲は T1-08 のデータの検査）。
- `access`：**省略できる**（未作成の県）。`emoji`・`mode`・`route`・`durationMin`（1以上の整数）・`sources`・`status`。
- `specialties`・`spots`：**必ず書く**。`type: array`・`maxItems: 3`・`not: { minItems: 1, maxItems: 2 }` で「3件か0件」にする（`oneOf` で書くと、生成した型が `{ [k: string]: unknown } & Specialty[]` になるため）。項目は `id`・`emoji`（名所では省略できる）・`name`・`description`（`{ ja: { kids, adult }, en: {...}, zh: {...} }`）・`sources`・`status`。
- `sources[]`：`title`・`url`（`^https://[^\s]+$`）・`accessed`（`^\d{4}-\d{2}-\d{2}$`）。
- `status`：`draft`・`verified`・`reviewed`。
- 型の生成では `maxItems: -1` を渡し、件数ごとのタプル（`[] | [Specialty] | ...`）ではなく `Specialty[]` にする。

## 書いたテスト

フィクスチャ（`tests/fixtures/content/`）を一時ディレクトリにコピーし、テストごとに1か所だけ書き換えて検証する（`tests/unit/lib/content-helpers.ts`。`yaml` の `Document` で書き換えるので、コメントや書き方は残る）。

### `tests/unit/lib/content.test.ts`（node）

| テスト条件 | テスト名 |
|---|---|
| 正しいYAMLは通る | `7.1：フィクスチャ（全項目の県・reviewed と verified が混ざった県・未作成の県）は誤りなく通る` |
| 未作成のYAMLも通る | `7.1：名物・名所が空で、行き方がない県は通る` |
| 名物が2件 → 誤り | `7.1：名物が2件なら誤りにする（3件か0件だけ）`、`7.1：名物が4件なら誤りにする` |
| 英語のこども向けがない → 誤り | `7.1：英語のこども向けの文がなければ誤りにする（場所 specialties[0].description.en）` |
| `status: done` → 誤り | `7.1：status が draft・verified・reviewed 以外なら誤りにする` |
| `http://` → 誤り | `7.1：出典の URL が https:// でなければ誤りにする` |
| （加えた）形の誤り | `7.1：スキーマにない項目は誤りにする`（項目の場所と行）、`7.1：空の文字列は誤りにする`、`7.1：空白だけの文は誤りにする`、`7.1：型が違えば誤りにする（緯度が文字列）`、`7.1：範囲外の数は誤りにする（緯度・経度・所要時間）`、`7.1：id・code の形が違えば誤りにする`、`7.1：形の誤りは、項目ごとの言葉で出す（code・id・確認した日）` |
| （加えた）行 | `7.1：誤りには、YAML の行が入る`、`7.1：誤りの行は、その項目の名前（キー）の行にする`、`7.1：空のファイルは、行のない誤りにする` |
| （加えた）YAML の構文・読めないファイル | `7.1：YAML の構文の誤りとキーの重複は、行を含む誤りにする`、`7.1：エイリアス（&・*）は誤りにし、ほかのファイルの検証を続ける（大きく展開されるファイルで止まらない）`、`7.1：読めないファイル（NN-id.yaml という名前のディレクトリ）は誤りにする` |
| ふりがなの誤り → 場所が入る | `7.2：ふりがなの誤りは、ファイル名と場所（specialties[0].description.ja.kids）と行を含む誤りにする` |
| （加えた）ふりがな | `7.2：ふりがなの付いていない漢字は警告にする`、`7.2：ふりがなは日本語の文だけを見る（中国語の漢字・出典のタイトルは警告にしない）`、`7.2：英語・中国語の文にふりがなの記法があれば誤りにする`、`7.2：行き方・名前など、解説文のほかの日本語の文も見る` |
| 文字数が範囲外 → 警告だけ | `7.3：解説文の文字数が範囲外なら警告にし、誤りにはしない（上限）`、同（下限） |
| 英語は語数 | `7.3：英語は語数で数える` |
| （加えた）読みを除く | `7.3：日本語の文字数は、読みを除いて数える` |
| `sources: []` → 警告 | `9.3：出典が空なら警告にする`、`7.1：フィクスチャには、出典が空のほかの警告がない` |
| （加えた）ファイル名・重複 | `7.1：ファイル名（NN-id.yaml）と code・id が合わなければ誤りにする`、`7.1：NN-id.yaml の形でないファイルは誤りにする`（`.` で始まるファイルは無視）、`7.1：県の id・code が重複したら誤りにする`（行も見る）、`7.1：県の中で名物・名所の id が重複したら誤りにする` |
| `CONTENT_DIR` | `7.1：CONTENT_DIR で読み込むディレクトリが変わる`、`7.1：CONTENT_DIR がなければ content/prefectures/ を読む`、`7.1：validateContent・loadContent は、ディレクトリを省くと CONTENT_DIR を読む` |
| （加えた）ディレクトリ | `7.1：ディレクトリがなければ誤りにする`、`7.1：ディレクトリではなくファイルを指したら誤りにする`、`7.1：YAML が1つもなければ、誤りなく0件を返す` |
| （加えた）アプリ用の読み込み | `7.1：loadContent は県を code の順に返す`、`7.1：loadContent は誤りがあれば、すべての誤りを含むエラーを投げる`、`7.1：行のない誤りは「ファイル名 場所 メッセージ」の形で出す` |

### `tests/unit/scripts/validate-content.test.ts`（node）

`7.1：誤りがあれば、誤りを出して終了コード1`、`7.3：警告だけなら、警告を出して終了コード0`、`7.1：1行に1件、「ファイル:行 場所 メッセージ」の形で出す`、`7.1：ディレクトリがなければ誤りにし、警告の見出しは出さない`

### `tests/unit/scripts/content-types.test.ts`（node）

`7.1：コミットした型（src/lib/content-schema.generated.ts）が、スキーマから作った型と一致する`、`7.1：名物・名所は配列の型にし、件数ごとのタプルにしない`

Red の確かめ方：どのテストファイルも、実装の前にモジュールがないことで失敗するのを見た。レビュー後に足したテスト（8件）も、直す前に失敗するのを見た。

## 作った・変えたファイル

1. `package.json`・`pnpm-lock.yaml`：上の3つの依存、`content:types`・`content:validate` のスクリプト
2. `content/schema/prefecture.schema.json`
3. `scripts/content-types.ts`（Prettier の設定で整えて書く）と、生成した `src/lib/content-schema.generated.ts`
4. `tests/fixtures/content/01-hokkaido.yaml`（全項目 `reviewed`）、`13-tokyo.yaml`（`reviewed`・`verified`・`draft` が混ざる）、`47-okinawa.yaml`（名物・名所が空、行き方なし）
5. `src/lib/content.ts`（読み込み・スキーマ・行・ファイルをまたぐ重複）、`src/lib/content-rules.ts`（内容のルール）、`src/lib/ruby.ts`（`characterNumber` を export）
6. `scripts/validate-content.ts`（`pnpm content:validate`）
7. `content/prefectures/.gitkeep`
8. `.github/workflows/ci.yml`：「Unit test」の後に「Validate content」（文書だけのPRでは飛ばす）
9. 文書：開発概要書 7.1（検証・未作成・`id`・書式の行）・7.2（英語・中国語の記法）・7.3（範囲外で警告、数え方）・12.3、`AGENTS.md`（状況・技術スタック・コマンド・ディレクトリ・アーキテクチャ）、T1-08 の定義（未作成の書き方、yamllint の書式）

## 完了条件の確かめ方

| 完了条件 | 結果 |
|---|---|
| 生成した型で `pnpm typecheck` が通る | `content.ts`・`content-rules.ts` が生成した型を使い、`pnpm typecheck` が通った。型が古ければ `content-types.test.ts` が失敗する |
| CIで `pnpm content:validate` が実行される | `ci.yml` に手順を加えた。PR の CI のログで確かめる。手元では、`content/prefectures/`（0件）で終了コード0、フィクスチャで誤り0・警告14（どれも出典が空）・終了コード0 |
| 共通（lint・typecheck・test・build、カバレッジ、レビュー） | すべて通った（テスト469件）。`src/lib/` 全体は文98.2%・分岐90.9%。code-reviewer：CRITICAL なし、HIGH 1件を直した |

画面は変わらないので、スクリーンショットは撮らない。

## 判断が必要な点（承認済み）

| # | 項目 | 判断 | 理由 |
|---|---|---|---|
| 1 | ライブラリ | `yaml`・`ajv`・`json-schema-to-typescript`。`ajv-formats` は入れず、日付は正規表現で見る | `yaml` は位置が取れ、YAML 1.2 なので日付や `no` が勝手に変わらない（js-yaml は日付を `Date` にする）。`ajv-formats` は日付の形のためだけに依存を増やすことになる |
| 2 | JSON Schema の版 | draft-07 | ajv の既定で、json-schema-to-typescript が最もよく対応している |
| 3 | 生成した型の扱い | コミットし、スキーマから作った型と一致するかをテストで確かめる | ビルド・typecheck の前に生成の手順が要らない。作り直し忘れは CI で止まる |
| 4 | 「空」の書き方 | `access` は省略する。`specialties`・`spots` は `[]` を必ず書く | 行き方は1件のオブジェクトなので省略が自然。名物・名所は書き忘れと区別する |
| 5 | ふりがなを見る項目 | 日本語の文すべて。出典の `title` は見ない | D2：ふりがなはこども・おとなの両方に効く。出典のタイトルは出典の表記のまま |
| 6 | 文字数の警告 | 上限超え・下限不足の両方。日本語・中国語は空白を除いた字数（読みを除く）、英語は語数。7.3 を直した | タスクの定義と 7.3 の食い違いを、範囲外に合わせた。警告なのでコンテンツは止まらない |
| 7 | `id` の重複 | 県の `id`・`code` は全体で、名物・名所の `id` は県の中で重複しない | 名物・名所の `id` は県の中での識別子 |
| 8 | ファイルとディレクトリ | `*.yaml` だけを読み（`.` で始まるファイルは無視）、ほかの名前は誤り。ディレクトリがなければ誤り。0件は誤りにしない。`.gitkeep` を置いた | `CONTENT_DIR` の打ち間違いをすぐ見つける。47件そろっているかは T1-08 |
| 9 | 誤りの出し方 | `ファイル名:行 場所 メッセージ`。誤りと警告を分けて、すべて出す | 直す往復を減らす。行があればエディタですぐ開ける |
| 10 | アプリ用の関数 | `validateContent`（すべて返す）と `loadContent`（誤りで例外、`code` の順）。`reviewed` の絞り込みは T3-02 | ビルドは止め、検証は全部を報告する |
| 11 | フィクスチャ | 北海道（全部 `reviewed`）・東京都（混在）・沖縄県（未作成）。出典は空、緯度経度はフィクスチャ用の値とコメントに書いた | 4.11.4 の3つの場合を E2E で試せる。確かめていない URL を出典に書かない |
| 12 | CI での実行 | 「Unit test」の後に `pnpm content:validate`。文書だけのPRでは飛ばす | 12.3 の概略のとおり |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| 「3件か0件」の書き方 | `oneOf`（`maxItems: 0` か `minItems: 3, maxItems: 3`） | `maxItems: 3` ＋ `not: { minItems: 1, maxItems: 2 }`、型の生成に `maxItems: -1` | `oneOf` だと生成した型が配列にならなかった |
| 空の文の判定 | `minLength: 1` | `pattern: "\\S"`（空白だけも誤り） | レビューの指摘。空白だけの県名は地図のラベルが空になる |
| 英語・中国語の文の記法 | 見ない | `{…\|…}` があれば誤り | レビューの指摘。英語・中国語の画面に記法がそのまま出るため |
| 読めないファイル・エイリアス | （決めていなかった） | 例外ではなく誤りとして返す。エイリアスは使えない | レビューの指摘（HIGH）。1ファイルの例外で、ほかのファイルの誤りが出なくなるため |
| 誤りの行 | ノードの位置 | 項目の名前（キー）の行。余分な項目はその項目の場所。ファイルをまたぐ重複にも行 | レビューの指摘。値のノードの行だと、ブロックのマップでは次の行を指すため |
| 形の誤りのメッセージ | 正規表現をそのまま出す | `code`・`id`・URL・確認した日・空の文は、項目ごとの言葉 | レビューの指摘。書く人が直し方を分かるように |
| フィクスチャの書式 | （決めていなかった） | 先頭に `---`、1行のマップの括弧の内側に空白を入れない | yamllint の既定の規則（`document-start`・`braces`）。開発概要書 7.1 の例は空白が入っていて、そのままでは誤りになる |
| 文書 | 7.1・7.3・12.3、`AGENTS.md` | 加えて 7.2（英語・中国語の記法）、T1-08 の定義（未作成の書き方・yamllint の書式） | 後のタスクの材料 |
