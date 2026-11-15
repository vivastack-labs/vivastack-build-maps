# T4-01 CSP：実装計画

- タスクの定義：`docs/tasks/m4-pwa-quality.md` の T4-01
- ブランチ：`feat/T4-01-csp`
- 参照仕様：開発概要書 5.5、6.6 (4)、11.4 (4)、D23、R9

## 目的

Next.js のインラインスクリプトと初期化スクリプト（`MODE_INIT_SCRIPT`）だけを許可し、それ以外のスクリプトが動かないようにする。

## 着手時に調べたこと

- 今のビルドの `dist/ja/index.html` には `<script>` が 137 個あり、そのうち `src` のないインラインが **128 個**（RSC のデータ `self.__next_f.push(…)`、`id="_R_"`、初期化スクリプト）。en は 90 個、404 は 5 個。数はコンテンツの量で変わる。
- **Cloudflare の `_headers` は1行 2,000 字まで**（ヘッダー名を含む。100 ルールまで。Workers Static Assets と Pages の公式ドキュメント）。SHA-256 のハッシュは1つ約 54 字なので、1行に入るのは約 35 個まで。**定義どおり `_headers` にページごとのハッシュを書く方法は使えない。**
- 同じパスに合う複数のルールのヘッダーは、カンマでつながる（上書きではない）。`! Header-Name` で外せる。
- サーバーの HTML に出る `style` 属性が6つある（`MapArea` の `aspect-ratio`、`JapanMap` の県境・沖縄の枠の線の太さ、海域名・県名ラベルの文字の大きさ。`calc(… / var(--zoom-k, 1))`）。`style-src` を `'self'` にすると、HTML の `style` 属性は止まる。JavaScript から `element.style.setProperty`（CSSOM）で書く値（`--zoom-k`・ツールチップの位置・`--sheet-h`、React がクライアントで描く `style`、d3 の `selection.style`）は CSP の対象外で止まらない。
- `<style>` 要素とインラインのイベント属性（`onclick=` など）は出力にない。
- Web Analytics の計測用のスクリプトはまだ埋め込んでいない（T6 で埋め込む。定義では、ドメインの許可は T4-01 で入れておく）。

## 方針

### 1. CSP を2つに分ける

| 置き場所 | 中身 | 理由 |
|---|---|---|
| HTML の `<meta http-equiv="Content-Security-Policy">`（`postbuild.ts` が各 HTML の `<meta charset>` の直後に書く） | `default-src 'self'; script-src 'self' <そのページのハッシュ> https://static.cloudflareinsights.com; style-src 'self'; connect-src 'self' https://cloudflareinsights.com; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'` | ハッシュの数に上限がない。ページごとに自分の HTML のハッシュだけを持てる |
| `_headers` の `/*`（全部のパスに付く。HTML でないものにも） | `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'` | `frame-ancestors` は `<meta>` では効かない。ハッシュを含まないので短い |

- ブラウザは、ヘッダーと `<meta>` の両方の CSP を守る（両方を満たすものだけが動く）。ヘッダーには `script-src` を書かないので、スクリプトの許可は `<meta>` だけで決まる。
- `<meta>` の CSP は、それより前の要素には効かないので、`<head>` の最初（`<meta charset>` の直後、どの `<script>`・`<link>` よりも前）に置く。
- `'strict-dynamic'` は使わない（`'self'` が無視され、HTML の `<script src>` が止まるため）。

### 2. `scripts/postbuild.ts` に足す（純粋関数＋境界）

- `inlineScripts(html)`：`src` のない `<script>` の中身を返す。`type` が JavaScript でないもの（`application/json`・`application/ld+json` など。実行されないので CSP の対象外）は除く。`type="module"` は含む。
- `scriptHash(text)`：SHA-256 の base64 を `'sha256-…'` の形で返す。
- `pageCsp(hashes)`：上の `<meta>` の中身を組み立てる（ハッシュは重複を除いて並べる）。
- `injectCsp(html, csp)`：`<meta charset…>` の直後に `<meta http-equiv="Content-Security-Policy" content="…">` を入れる。`<meta charset>` がない・すでに CSP の `<meta>` がある HTML は例外（ビルドを止める）。
- `assembleDist` の後で、`dist/` の中のすべての `*.html`（`ja`・`en`・`zh`・`404.html`・`_not-found` など）に当てる。
- 書き換えた後の HTML から集め直したハッシュが、`<meta>` のハッシュと一致することを確かめる（入れたことで中身が変わっていないか）。

### 3. `style` 属性をクラスにする

- 6つの `style` 属性を、Tailwind の任意の値のクラスに置き換える（例：`[stroke-width:calc(0.8px/var(--zoom-k,1))]`、`aspect-[1000/1130]`）。言語で変わる県名ラベルの文字の大きさは、言語ごとのクラスを定数に書く（Tailwind が組み立てたクラス名を拾えないため）。
- `MuniLayer`（クライアントで描く）の `style` は CSSOM で書かれるので止まらないが、同じ書き方にそろえる。
- これで `style-src 'self'`（`'unsafe-inline'`・`'unsafe-hashes'` なし）にできる。

### 4. テスト

- 単体：`tests/unit/scripts/postbuild.test.ts`（既存）に、ハッシュ・集め方・組み立て・差し込み・`dist/` の HTML の書き換えを足す。
- E2E：`tests/e2e/csp.spec.ts`（新規）。`securitypolicyviolation` とコンソールの CSP のエラーを集め、3言語で、ホバー・固定・最大化（市区町村の描画）・カードの JSON・ツールチップ・モードとふりがなの切替・言語の切替・404 の間に1件も出ないことを確かめる。スマホ（パネル）でも動かす。
- 既存の E2E は `wrangler dev` で `dist/` を配信しているので、全部が CSP の下で動く（完了条件）。

### 5. 文書

- 開発概要書 5.5（CSP を `<meta>` と `_headers` に分けた理由、`style-src 'self'` と `style` 属性を使わない決まり）、6.6 (4)、11.4 (4) の `_headers` の例、R9。新しい決定事項 D39。
- `AGENTS.md`：アーキテクチャに CSP の節（サーバーの HTML に `style` 属性を出さない、インラインスクリプトを足すとハッシュは自動で入る、など）。
- `docs/tasks/m4-pwa-quality.md`（T4-02 の Service Worker の登録スクリプトは外部ファイル。`<meta>` 方式でも同じ）、`m6-release.md`（Web Analytics のスニペットは外部の `src` なので、ハッシュは要らない。`data-cf-beacon` の属性だけ）。

## 先に書くテスト

| ファイル | テスト名 |
|---|---|
| `tests/unit/scripts/postbuild.test.ts` | `5.5：scriptHash は既知の文字列から正しい SHA-256（base64）を返す` |
| 同 | `5.5：inlineScripts は src のない script だけを集め、JavaScript でない type（application/json など）を除く` |
| 同 | `D23：MODE_INIT_SCRIPT のハッシュは、HTML から集めたハッシュに入る` |
| 同 | `5.5：pageCsp はハッシュを重複なしで script-src に入れ、frame-ancestors を含まない` |
| 同 | `5.5：injectCsp は <meta charset> の直後（最初の script より前）に CSP の meta を入れる` |
| 同 | `5.5：<meta charset> がない HTML、CSP の meta がすでにある HTML は例外にする` |
| 同 | `5.5：dist/ のすべての HTML に、そのページのハッシュの CSP を書く（ほかのファイルは変えない）` |
| `tests/unit/components/JapanMap.test.tsx` ほか | `5.5：サーバーで描く地図に style 属性がない`（`MapArea` も） |
| `tests/e2e/csp.spec.ts` | `R9：3言語のページで、地図の操作・カード・最大化・切替の間に CSP 違反が出ない`、`R9：404 のページで CSP 違反が出ない`、`5.5：CSP の meta がすべての script より前にあり、_headers の CSP に frame-ancestors 'none' がある` |

実際には、`postbuild.test.ts` に上のテストに加えて、知っている形の全体一致・`<` を含むスクリプト・`htmlProblems`（`style` 属性・`<style>`・`<meta charset>` より前の要素・type）・`assembleDistWithCsp`（失敗したら `dist/` を消す）のテストを足した（計 48 件）。`csp.spec.ts` は、3言語の操作中の CSP 違反 0 件、404、知らないインラインスクリプトが止まること、`<meta>` の位置と `_headers`、クラスが既定値と違う値で効いていることを確かめる（4プロジェクトで 9 件）。

## 作る・変えるファイル（順番）

1. `scripts/postbuild.ts` と単体テスト
2. `src/components/MapArea.tsx`・`JapanMap.tsx`・`MuniLayer.tsx`（`style` 属性 → クラス）と単体テスト
3. `public/_headers`（`/*` に短い CSP）
4. `tests/e2e/csp.spec.ts`
5. 測る（メイン）：`pnpm size`（`<meta>` のハッシュでどれだけ増えるか。上限のコンテンツでも）
6. 文書

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| CSP を有効にした `wrangler dev` で、これまでの E2E がすべて通る | `pnpm test:e2e`（7プロジェクト）・`pnpm test:e2e:preview` |
| テスト条件 | 上の単体テストと `csp.spec.ts` |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`・`build` が通り、レビューで CRITICAL・HIGH がない |
| 5.1 のサイズ | 上限のコンテンツのビルドで `pnpm size` が 0 で終わる（ハッシュの分が増える） |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | CSP の置き場所（定義は `_headers` にページごと） | ハッシュを含む CSP は HTML の `<meta>`、`frame-ancestors` などは `_headers` に分ける | `_headers` は1行 2,000 字までで、ja のハッシュ 128 個（約 7,000 字）が入らない。Worker のコードでヘッダーを付ける方法は、静的配信だけの構成（5.5）を変え、`_headers` も効かなくなる |
| 2 | `style-src` | `'self'` だけにし、サーバーの HTML の `style` 属性 6つをクラスに置き換える | `'unsafe-inline'` は CSS の注入を許す。`'unsafe-hashes'` は値が変わるたびにハッシュが要る。JavaScript から書く値（CSSOM）は `'self'` でも止まらない |
| 3 | Web Analytics のドメイン | 定義どおり今入れる（`script-src` に `https://static.cloudflareinsights.com`、`connect-src` に `https://cloudflareinsights.com`） | T6 の定義が「T4-01 で許可済み」を前提にしている。Cloudflare 自身のドメインで、ほかの外部は許可しない |
| 4 | 足す指令 | 定義の指令に `img-src 'self'`・`form-action 'self'` を足す（`default-src` と同じ値だが明示） | フォームはないが、注入されたフォームの送信先を縛れる。`upgrade-insecure-requests` は HSTS があるので足さない |
| 5 | CSP 違反を確かめる E2E の範囲 | 新しい `csp.spec.ts` で主な操作をまとめて確かめる（既存の全テストに監視を足すのはしない） | 既存の spec すべての `import` を変える大きな変更になる。主な操作（市区町村・カード・パネル・切替）を1つにまとめれば、スクリプトとスタイルの出どころはほぼ網羅できる |
| 6 | サイズへの影響 | 受け入れる（`<meta>` で ja 約 7KB、gzip 後 約 5KB 増える見込み。T3-09 の余裕は ja 30KB） | ハッシュはランダムな文字列で圧縮が効かない。上限のコンテンツで測って PR に書く |

## 承認後に変えたこと

オーナーの判断が要らない、細かな違いと、レビューの指摘で足したもの。

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| 許可するインラインスクリプト | HTML にあるものを全部ハッシュに入れる | 知っている形だけを許可し、合わないものがあればファイル名つきでビルドを止める。`MODE_INIT_SCRIPT` と `(self.__next_f=self.__next_f\|\|[]).push([0])` は完全一致（`KNOWN_EXACT_INLINE_SCRIPTS`）、`self.__next_f.push([数字(,JSON の文字列\|null)?])` は全体一致の正規表現＋`JSON.parse`、Turbopack は先頭と末尾の間が JSON のオブジェクト。`<` を含むものは止める | セキュリティレビュー（M1・L1・L3）。将来 `dangerouslySetInnerHTML` などで紛れ込んだスクリプトを自動で許可しないため。接頭辞だけだと `push([1,"x"]);alert(1)` も通るため |
| HTML の形の検査 | なし（E2E だけ） | `htmlProblems`：`<script>` の中身を除いた HTML に `style` 属性・`<style>` がない、`<meta charset>` より前に `<script>`・`<link>` がない、script の `type` が JavaScript か JSON だけ（importmap・speculationrules などは止める）。合わなければビルドを止める | コードレビュー MEDIUM-2。E2E は PR ごとに動かない（D30）ので、PR ごとの `pnpm build` で止めるため |
| ハッシュの前の改行 | なし | `\r\n`・`\r` を `\n` に直してから取る | HTML のパーサーと同じ（セキュリティレビュー L3） |
| CSP の文字列の検査 | なし | `"`・`&`・`<`・`>` があれば例外 | 属性の値を壊さないため（セキュリティレビュー L7） |
| 失敗したときの `dist/` | 決めていない | `assembleDistWithCsp`：組み立てか CSP の書き込みで失敗したら `dist/` を消して、元の例外を投げ直す（`out/` と重なるときは消さない） | CSP のない `dist/` を `wrangler dev`・`pnpm size` で使わないため（コードレビュー LOW-3、セキュリティレビュー L2） |
| `zoomInvariant` | 残す | 削除（`style` 属性をクラスにして使い道がなくなった）。`LABEL_FONT_SIZE` は `JapanMap` のクラスの基準値として残し、JSDoc に両方を直すことを書いた | なし |
| `MuniLayer` の `style` | クラスにそろえる | 同じ（3つ） | なし |
| Tailwind の読み込み | なし | `globals.css` の `@source not` に `AGENTS.md`・`CLAUDE.md`・`docs` を足した | 文書の中のクラスの例から、無効な CSS の規則ができていた（コードレビュー LOW-5） |
| E2E の `addStyleTag` | なし | `sheet.spec.ts` は CSSOM（`style.overflowAnchor`）で書く | `style-src 'self'` で `<style>` の追加が止まるため |
| `csp.spec.ts` の確かめ方 | CSP 違反が 0 件 | それに加えて、クラスが効いていることを既定値と違う値で確かめる（海域名 24px・県境 0.8px・沖縄の枠 1.5px・en の県名 13px、最大化後は基準 ÷ 倍率）。ツールチップは札幌市中央区の内側の点で出ることを確かめる | コードレビュー MEDIUM-1・LOW-4 |
