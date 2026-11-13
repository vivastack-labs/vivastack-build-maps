# T2-02 UI文言の辞書：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-02
- ブランチ：`feat/T2-02-ui-dictionary`
- 参照仕様：開発概要書 6.2（D27・D28）、F-I18N-04、7.2、4.11.1・4.11.4・4.11.5（文言の出どころ）

## 目的

画面の文言を3言語の型付きの辞書にまとめ、M2 以降の部品（T2-03〜T2-11）が最初から辞書を使えるようにする。
ライブラリは使わない（D28）。あわせて、言語ごとのシステムフォントの並び（D27）を `globals.css` に入れる。

## 作る・変えるファイル（この順番）

1. `tests/unit/i18n/messages.test.ts`（先に書く。Red）
2. `src/i18n/ja.ts`：基準の辞書。`as const` を付けず、`export type Messages = DeepReadonly<typeof ja>` 相当の型を出す（文字列リテラルにしないので、en・zh が `satisfies Messages` で同じ形を持つことだけを型で強制できる）。
   - 地方名は `Record<Region, string>`。`Region` は `src/lib/content-schema.generated.ts` の `region` の型から取る（コンテンツの `region` と辞書のキーがずれたら型で落ちる）。
   - `{ kids, adult }` の値の型は `ModeTextValue`（`src/i18n/ja.ts` か `src/i18n/messages.ts` に置く）。
3. `src/i18n/en.ts`・`src/i18n/zh.ts`：`satisfies Messages`。
4. `src/i18n/messages.ts`：`getMessages(lang: Lang): Messages`。
5. `src/i18n/format.ts`：`formatNumber(lang, value)`。ロケールは `htmlLang(lang)`（`ja`・`en`・`zh-Hans`）を使う。`Intl.NumberFormat` は言語ごとに1つ作って使い回す。
6. `tests/unit/components/ModeText.test.tsx` → `src/components/ModeText.tsx`
   - `<ModeText text={{ kids, adult }} />` は `<span class="kids">…</span><span class="adult">…</span>` を出す。中身は `RubyText` で描く（en・zh は記法がないので、そのまま文字になる）。
   - フックを使わず、フラグメントで返す（サーバー・クライアントのどちらでも使える）。
7. `app/globals.css`：`@theme` の `--font-sans` に en の並びを置き、`:root:lang(ja)`・`:root:lang(zh)` で `--font-sans` を上書きする（`zh` は `zh-Hans` にも一致する）。Tailwind の preflight は `html` に `--default-font-family`（= `--font-sans`）を使うので、ページ全体に効く。
8. 仮の文言を辞書に移す（判断が必要な点 3）：
   - `app/[lang]/page.tsx`：`SITE_NAME` を消し、`<h1><RubyText text={getMessages(lang).siteName} /></h1>`。
   - `app/global-not-found.tsx`：見出し・リンク・`metadata.title` を辞書の `notFound` から取る。`title` は `plainText()` で読みを除く。
9. `tests/e2e/lang.spec.ts`：`<body>` の計算後の `font-family` が、言語ごとの並びの先頭のフォントで始まることを確かめる（D27）。
10. ドキュメント：`docs/tasks/m2-map-core.md` の T2-03（サイト名の移動はこのタスクで済んだ、と直す）、`AGENTS.md`（アーキテクチャに辞書の場所と使い方を1項目）、`tests/screenshots/pages.spec.ts`（404 の画面を足す）。

## 先に書くテスト

`tests/unit/i18n/messages.test.ts`（node）：

| テスト名 | 確かめること |
|---|---|
| `F-I18N-04：ja・en・zh の辞書のキーの集合が、入れ子まで含めて一致する` | 葉までのキーのパス（例：`regions.kanto`、`card.guide.kids`）を再帰で集め、3言語で一致する |
| `F-I18N-04：どの言語の文言も空でない` | すべての葉が、前後の空白を除いて空でない文字列 |
| `F-I18N-04：{ kids, adult } の文言は、どの言語でも両方がある` | ja で `kids`・`adult` の2つのキーだけを持つオブジェクトの位置で、en・zh も両方が空でない文字列 |
| `7.2：日本語の文言が、すべて checkRuby() を誤りなしで通る` | 誤り0件 |
| `7.2：日本語の文言に、ふりがなの付いていない漢字がない` | 警告0件（判断が必要な点 1） |
| `7.2：英語・中国語の文言に、ふりがなの記法がない` | `parseRuby` の結果に `ruby` の部分がない（T1-07 のコンテンツの規則と同じ） |
| `D28：getMessages は言語ごとの辞書を返す` | `getMessages('en').siteName` が英語の名前、など |
| `D28：地方名が、コンテンツの region の8つすべてにある` | 3言語の `regions` のキーが、スキーマの `region` の enum と一致する（`content/schema/prefecture.schema.json` を読む） |
| `D28：formatNumber は言語の書式で数を区切る` | `formatNumber('ja', 1234)` が `1,234`、`zh` も `1,234` |

`tests/unit/components/ModeText.test.tsx`（jsdom）：

| テスト名 | 確かめること |
|---|---|
| `F-MODE-04：こども向けとおとな向けの両方を、kids・adult のクラスを付けて出力する` | `.kids` と `.adult` が1つずつあり、それぞれの文 |
| `7.2：ふりがなの記法を <ruby> で描く` | `{県\|けん}` が `<ruby>県<rt>けん</rt></ruby>` になる |

E2E（`tests/e2e/lang.spec.ts`。手動で実行）：

| テスト名 | 確かめること |
|---|---|
| `D27：/{lang}/ の本文のフォントの並びが、その言語のものである` | ja は `"Hiragino Sans"`、en は `system-ui`、zh は `"PingFang SC"` で始まる |

## 入れる文言（案）

日本語は記法つきで書く。`{ kids, adult }` は「こ／お」と書く。

| キー | ja | en | zh |
|---|---|---|---|
| `siteName` | ご{当地\|とうち}めいぶつ{日本地図\|にほんちず} | Japan Local Specialties Map | 日本各地名产地图 |
| `map.label`（`aria-label`） | {日本地図\|にほんちず} | Map of Japan | 日本地图 |
| `zoom.in` / `zoom.inLabel` | ＋ / {拡大\|かくだい} | + / Zoom in | ＋ / 放大 |
| `zoom.out` / `zoom.outLabel` | − / {縮小\|しゅくしょう} | − / Zoom out | − / 缩小 |
| `zoom.reset` | {全体\|ぜんたい} | Reset | 全图 |
| `regions.*` | {北海道\|ほっかいどう}{地方\|ちほう} 〜 {九州\|きゅうしゅう}{地方\|ちほう}（8つ） | Hokkaido, Tohoku, Kanto, Chubu, Kinki, Chugoku, Shikoku, Kyushu | 北海道地方 〜 九州地方 |
| `seas.japanSea` / `seas.pacific` | {日本海\|にほんかい} / {太平洋\|たいへいよう} | Sea of Japan / Pacific Ocean | 日本海 / 太平洋 |
| `card.guide`（こ／お） | {県\|けん}にマウスをのせるか、タップしてね ／ {県\|けん}にマウスをのせるか、タップしてください | Hover over or tap a prefecture! ／ Hover over or tap a prefecture. | 把鼠标移到都道府县上，或点一下吧 ／ 请将鼠标移到都道府县上，或点击该地区 |
| `card.maximize` / `card.restore` | {大\|おお}きくして{市区町村\|しくちょうそん}を{見\|み}る / {元\|もと}の{大\|おお}きさにもどす | Enlarge to see municipalities / Back to original size | 放大查看市区町村 / 恢复原来大小 |
| `comingSoon.label` | {準備中\|じゅんびちゅう} | Coming soon | 准备中 |
| `comingSoon.card`（こ／お） | {名物\|めいぶつ}・{名所\|めいしょ}は{準備中\|じゅんびちゅう}だよ ／ …{準備中\|じゅんびちゅう}です | Specialties and sights are coming soon! ／ …coming soon. | 名产和名胜正在准备中哦 ／ 名产和名胜正在准备中 |
| `muni.loading` | {読\|よ}み{込\|こ}み{中\|ちゅう} | Loading… | 加载中… |
| `muni.loadFailed`（こ／お） | {市区町村\|しくちょうそん}を{読\|よ}み{込\|こ}めなかったよ ／ {市区町村\|しくちょうそん}を{読\|よ}み{込\|こ}めませんでした | Couldn't load the municipalities. ／ Failed to load municipalities. | 没能加载市区町村 ／ 市区町村加载失败 |
| `muni.offline`（こ／お） | インターネットにつながっていないので、{表示\|ひょうじ}できないよ ／ オフラインのため{表示\|ひょうじ}できません | You're offline, so this can't be shown. ／ Unavailable while offline. | 没有联网，所以无法显示 ／ 离线状态下无法显示 |
| `muni.retry`（こ／お） | もう{一度\|いちど} ／ {再試行\|さいしこう} | Try again ／ Retry | 再试一次 ／ 重试 |
| `muni.listSummary` | {市区町村\|しくちょうそん}の{一覧\|いちらん} | List of municipalities | 市区町村一览 |
| `index.heading` | {県名\|けんめい}さくいん | Prefecture index | 都道府县索引 |
| `notFound.title` / `notFound.backToTop` | ページが{見\|み}つかりません / トップページへ | Page not found / Go to top page | 找不到页面 / 返回首页 |

- 属性に入れる文言（`aria-label` など）は CSS で切り替えられないので、`{ kids, adult }` にしない。
- en・zh の `{ kids, adult }` は、同じ文でもよい（両方があることだけを確かめる）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| M2 の部品で使う文言が、3言語ともそろっている | T2-03〜T2-11 の定義に出てくる文言（「＋」「−」「全体」、地方名、海域名、カード の案内、「準備中」、「読み込み中」、失敗、オフライン、「再試行」、「市区町村の一覧」、県名さくいん、最大化のボタン）が辞書にあることを、定義と突き合わせて確かめる。そろっていることは単体テストが保証する |
| 共通：lint・typecheck・test・build が通り、カバレッジが基準以上 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |
| `en.ts` でキーが足りなければ型チェックで落ちる（D28） | 一時的にキーを1つ消して `pnpm typecheck` が失敗することを確かめ、戻す。結果をPRに書く |
| フォント（D27） | `pnpm test:e2e --project=chromium` の `lang.spec.ts` と、`dist/` の CSS に `:lang(` の規則が残っていること |
| 画面の変更 | `pnpm screenshots`（ja のサイト名にふりがなが付く、フォントの並び、404 の画面） |

## 判断が必要な点

1. **日本語の文言は、ふりがなの付いていない漢字を0にするか**（テスト条件は「`checkRuby()` を誤りなしで通る」だけ）
   - 推奨：警告も0にする。理由：UI の文言はこども向け・おとな向けの両方で表示され、ふりがなON（F-MODE-02）のときに読みのない漢字が混ざると、こどもが読めない。文言は数十件なので負担は小さい。
2. **`{ kids, adult }` にする文言**
   - 推奨：文として読ませるもの（カードの案内、「準備中です」、読み込みの失敗、オフライン、「再試行」）だけ。ボタンや見出しの短い語（「＋」、地方名、海域名、「全体」など）と属性の文言は1つにする。理由：言い方の違いが出るのは文で、短い語を分けても違いがない。属性は CSS で切り替えられない。
3. **仮の文言（トップの `SITE_NAME`、404 のページ）を、このタスクで辞書に移すか**（T2-03 の定義では、サイト名の移動は T2-03）
   - 推奨：このタスクで移す。理由：辞書を作った時点で同じ文言が2か所にあると、片方だけ直す誤りが起きる。404 のコメントにも「T2-02 ができたら移す」とある。移すと日本語のサイト名にふりがなが付き、画面が変わるので、スクリーンショットを撮る。T2-03 の定義は「済み」に直す。`<title>`（`generateMetadata`）は T2-03 のまま。
4. **辞書の型の作り方**
   - 推奨：`ja.ts` は `as const` を付けずに書き、`Messages` を `typeof ja` から読み取り専用の型にして作る。理由：`as const` だと文字列リテラルの型になり、en・zh の `satisfies Messages` が「同じ文」を求めてしまう。型を別に手で書くと、キーを2か所で管理することになる。
5. **数値の書式のロケール**
   - 推奨：`htmlLang(lang)`（`ja`・`en`・`zh-Hans`）を `Intl.NumberFormat` に渡す。理由：`<html lang>` と同じ値にそろい、言語の一覧を `lang.ts` だけに保てる。距離の単位（km）の付け方は、使う T3 のタスクで決める。
6. **フォントの確かめ方**（テスト条件にはない）
   - 推奨：E2E に1つ足す。理由：Tailwind の `@theme` は使われない変数を出力から省くことがあり、`:lang()` の上書きが消えても単体テストでは気付けない。E2E は開発中は手動（D30）なので、PR の前に chromium だけで動かす。
7. **文言の案**（上の表）
   - 推奨：この案で実装し、PR でオーナーが文を直す。理由：文の良し悪しは画面で見たほうが判断しやすく、直すのは辞書の1か所で済む。

## 承認後に変えたこと

- 文言の表の `|`：ふりがなの記法の `|` が Markdown の表の列の区切りと読まれ、markdownlint（MD056）が落ちたので、表の中だけ `\|` にエスケープした（内容は変えていない）。
- `Messages` の型：`ja.ts` の `typeof ja` を `messages.ts` の `DeepReadonly` で読み取り専用にした。`ModeTextValue` は `messages.ts` に置いた。
- `docs/development-plan.md`：T2-02 の状態を「完了」にした。
