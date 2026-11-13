# T2-03 画面の枠組み：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-03
- ブランチ：`feat/T2-03-page-layout`
- 参照仕様：開発概要書 4.11.7、F-MAP-05、5.2、5.3

## 目的

4.11.7 の画面構成（Header・Map・Card・Index・Footer）を先に作り、T2-04 以降の部品（地図、カード、さくいん、パネル）を正しい場所に置けるようにする。
中身はまだないので、各領域は仮の表示にする。あわせて、言語ごとの `<title>` を出す。

## 作る・変えるファイル（この順番）

1. テストを先に書く（Red）：
   - `tests/unit/components/Header.test.tsx`・`CardArea.test.tsx`・`IndexArea.test.tsx`・`MapArea.test.tsx`・`Footer.test.tsx`（jsdom）
   - `tests/e2e/layout.spec.ts`（新規）
2. `src/components/Header.tsx`：`<header>` の中に `<h1>`（サイト名。`RubyText`）。切替のボタンは T3-05・T3-07 で足す。
3. `src/components/MapArea.tsx`：地図の領域。T2-04 の `JapanMap` が入るまでの仮の箱で、`aspect-ratio` を `VIEWBOX`（`src/features/map/projection.ts`。1000×1130）から取る（判断 7）。
4. `src/components/CardArea.tsx`：カードの領域（仮）。案内文 `card.guide.adult` を `RubyText` で出す（判断 3）。1024px以上では `sticky`。
5. `src/components/IndexArea.tsx`：県名さくいんの領域（仮）。見出し `index.heading`（`<h2>`）だけ。中身は T2-10。
6. `src/components/Footer.tsx`：`<footer>` だけ（判断 5）。
7. `app/[lang]/layout.tsx`：
   - `<body>` の中を `Header` → `children` → `Footer` にする（判断 1）。
   - `generateMetadata` で `title: plainText(getMessages(lang).siteName)` を出す（判断 9）。書く前に `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` を読む。
8. `app/[lang]/page.tsx`：`<main>` の中を、2列のグリッド（地図・カード）＋ その下にさくいん、にする。今の `<h1>` は Header に移す（判断 2）。
9. ドキュメント：
   - `docs/tasks/m2-map-core.md`：T2-04（`JapanMap` は `MapArea` の仮の箱を置き換える。箱の縦横比は `VIEWBOX`）、T2-05（カードの仮の表示は `CardArea` の中身を置き換える）、T2-10（`IndexArea` に入れる）。
   - `docs/tasks/m3-card-i18n-mode.md`：T3-04（`Footer` に出典を入れる）、T3-05（`CardArea` の案内文を `ModeText` に戻す）、T3-06（768px未満で `CardArea` をパネルにする）。
   - `AGENTS.md`：アーキテクチャに「画面の枠組み」の1項目（Header・Footer はレイアウト、地図・カード・さくいんはページ）。
   - `tests/screenshots/pages.spec.ts`：トップは既にあるので変えない。

## レイアウト

Tailwind の既定のブレークポイント `md`（768px）・`lg`（1024px）が 4.11.7 の区切りと同じなので、そのまま使う（判断 8）。

| 幅 | `<main>` の配置 |
|---|---|
| 1024px以上（`lg:`） | `grid-cols-3`。地図 `col-span-2`、カード `col-span-1` で `sticky top-4 self-start`。さくいんは2列をまたいで下 |
| 768〜1023px | 1列。地図 → カード → さくいん |
| 768px未満 | 同上（パネルは T3-06）。地図は全幅 |

- 横スクロールを出さないため、グリッドの子に `min-w-0` を付ける。左右の余白は 16px（`px-4`）。
- ランドマークは `header`・`main`・`footer` の3つだけにする（各領域は `section`。`aria-label` を付けると region のランドマークになり、数が増えるので付けない）。

## 先に書くテスト

### コンポーネント（jsdom）

| ファイル | テスト名 | 確かめること |
|---|---|---|
| `Header.test.tsx` | `4.11.7：Header はサイト名を h1 に出す（ja はふりがなつき）` | `banner` の中に level 1 の見出しがあり、ja では `<ruby>` を含む。en・zh はそれぞれの言語のサイト名 |
| `MapArea.test.tsx` | `4.11.7：MapArea の縦横比が地図の viewBox と同じである` | `style.aspectRatio` が `1000 / 1130` |
| `CardArea.test.tsx` | `4.11.1：CardArea は県を選ぶ前の案内文を出す` | ja・en・zh の `card.guide.adult` の文（読みを除いた文）が表示される |
| `IndexArea.test.tsx` | `F-IDX：IndexArea は県名さくいんの見出しを出す` | level 2 の見出しが `index.heading` |
| `Footer.test.tsx` | `4.11.7：Footer は contentinfo のランドマークである` | `contentinfo` が1つ |

### E2E（`tests/e2e/layout.spec.ts`。手動で実行）

| テスト名 | 確かめること |
|---|---|
| `4.11.7：幅1280pxで、地図とカードが横に並ぶ` | カードの左端 ≧ 地図の右端 |
| `F-MAP-05：幅900pxで、地図の下にカードがある` | カードの上端 ≧ 地図の下端 |
| `5.3：幅360pxで、横スクロールが出ない` | `document.documentElement.scrollWidth <= clientWidth` |
| `5.3：端末の幅で、横スクロールが出ない` | 同上を各プロジェクトの既定の幅で（スマホ・タブレットを含む） |
| `5.2：header・main・footer がそれぞれ1つある` | `banner`・`main`・`contentinfo` のロールが1つずつ |
| `5.2：/{lang}/ の <title> が、その言語のサイト名である` | `toHaveTitle(plainText(getMessages(lang).siteName))` を ja・en・zh で |

- 幅を指定するテスト（1280・900・360）は `setViewportSize` で幅を変え、スマホのエミュレーション（`isMobile`）のプロジェクトでは飛ばす（判断 6）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 3つの画面幅で、4.11.7 の図のとおりに並ぶ | `layout.spec.ts` の幅1280・900・360のテスト（全7プロジェクト）と、スクリーンショット（PC・スマホ・タブレット） |
| 共通（lint・typecheck・test・build、カバレッジ、レビュー） | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、`pnpm test:e2e`、code-reviewer |

## 判断が必要な点

| # | 項目 | 推奨案 | 理由 |
|---|---|---|---|
| 1 | Header・Footer を置く場所 | `app/[lang]/layout.tsx` に置く。地図・カード・さくいんは `page.tsx` | T4-05 の「このサイトについて」・プライバシーポリシーでも同じ Header・Footer を使う。ページごとに書かずに済む |
| 2 | `<h1>` | Header のサイト名を `<h1>` にする（今の `page.tsx` の `<h1>` を移す） | 1ページに1つの見出し1。T4-05 のページでは、Header を `<p>` にするなどを、そのときに決める（今は1ページなので YAGNI） |
| 3 | カードの案内文の、こども向け・おとな向け | T3-05 まではおとな向け（`card.guide.adult`）だけを `RubyText` で出す。T3-05 で `ModeText` に替える | T2-02 で分かったとおり、`ModeText` を今使うと両方が表示され、スクリーンリーダーも両方を読む。タスクの定義の例のとおり |
| 4 | axe の `document-title` | axe は入れず、`<title>` がその言語のサイト名と一致することを Playwright で直接確かめる。axe は T4-03 で入れる | axe の `document-title` は空でないかだけを見るので、こちらのほうが厳しい。T0-03 と同じ判断（`T0-03-dist-workers.plan.md` の 11） |
| 5 | Footer の中身 | 今は空の `<footer>` だけ。出典と「AIで作成し…」は T3-04、リンクは T4-05 | タスクの定義で、フッターの文言は T3-04 の担当。前倒しすると3言語の文言とテストを先に決めることになる |
| 6 | 幅を指定する E2E を動かすプロジェクト | `isMobile` のプロジェクト（iPhone・Pixel・iPad）では幅の指定を飛ばし、端末の既定の幅での横スクロールの検査だけを動かす | スマホのエミュレーションは meta viewport の扱いがPCと違い、幅1280px にしても PC の配置を確かめたことにならない。端末の幅での検査で、スマホ・タブレットの配置も確かめられる |
| 7 | 地図の仮の領域の大きさ | `aspect-ratio` を `VIEWBOX` から取った箱にする（中身は空。背景色だけ） | T2-04 で地図が入っても大きさが変わらない（CLS）。E2E の位置の比較に、高さのある箱が要る |
| 8 | ブレークポイント | Tailwind の既定の `md`（768px）・`lg`（1024px）をそのまま使う | 4.11.7 の区切りと同じ。`@theme` に足す必要がない |
| 9 | `<title>` の形 | サイト名だけの文字列。`title.template` は付けない | 今はページが1つ。T4-05 でページが増えるときに template を足せばよい（YAGNI） |
