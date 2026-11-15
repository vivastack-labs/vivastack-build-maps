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
