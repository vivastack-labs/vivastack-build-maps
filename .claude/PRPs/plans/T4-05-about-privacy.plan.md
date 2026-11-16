# T4-05 「このサイトについて」とプライバシーポリシー：実装計画

- タスクの定義：`docs/tasks/m4-pwa-quality.md` の T4-05
- ブランチ：`feat/T4-05-about-privacy`
- 参照仕様：開発概要書 F-SRC-04、4.11.7（Footer）、5.6、8.1〜8.3、R10、F-I18N-03・D8（hreflang）、D40（オフライン）

## 目的

地図データの出典、AI の利用、プライバシーの扱いを、利用者に説明する2つのページ（`/{lang}/about/`・`/{lang}/privacy/`）を3言語で作り、フッターからたどれるようにする。

## 着手時に調べたこと

- `Header`（サイト名の `<h1>` と、モード・ふりがなの切替、言語の切替）は `app/[lang]/layout.tsx` にある。レイアウトは子のパスを知らないので、今のままでは、言語の切替のリンクが `/{lang}/`（トップ）を指したままになる。また、1ページに h1 は1つ（`Header` の JSDoc）なので、新しいページの見出しを h1 にできない。
- `alternateUrls(lang)`（`src/lib/site.ts`）は `/{lang}/` の URL だけを返す。新しいページの `canonical`・`hreflang` は、そのページの URL にする必要がある。
- `next.config.ts` は `trailingSlash: true`。`out/ja/about/index.html` に出る。CSP の `<meta>`（`writePageCsp`）は `dist/` のすべての HTML に自動で入る。
- プリキャッシュ（`PRECACHE_PATTERNS`）は3言語の `index.html` だけ。新しいページはオフラインでは開けない。
- Cloudflare Web Analytics（T6 で入れる予定）の公式の文書で確かめたこと：Cookie・localStorage を使わない。IP アドレスや User Agent で個人を特定（フィンガープリント）しない。訪問者の個人データを集めない。集計の項目は、ページのパス・リファラー・国・ブラウザ・OS・端末の種類と、表示速度（Core Web Vitals）。スクリプトは `static.cloudflareinsights.com` から読み、送り先は `/cdn-cgi/rum`（Cloudflare で配信しているサイト）。IP アドレスを保存するか・保存期間は書いていない。出典：<https://developers.cloudflare.com/web-analytics/about/>、<https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/>、<https://www.cloudflare.com/web-analytics/>。Cloudflare の一般のプライバシーポリシーは、顧客のサイトの訪問者には当てはまらず、サイトの運営者が説明する責任を負うと書いている。
- 運営者の名前・問い合わせ先は、設計書のどこにも決まっていない。

## 方針

### 1. 画面の枠組み（ヘッダー）

- `Header` をレイアウトから各ページ（`page.tsx`・`about/page.tsx`・`privacy/page.tsx`）に移し、`page`（`'home' | 'about' | 'privacy'`）を渡す。
  - トップ：今と同じ（サイト名が `<h1>`）。
  - 2つのページ：サイト名はトップへのリンク（`<p>` の中の `<a href="/{lang}/">`）にし、ページの題名を `<main>` の中の `<h1>` にする（1ページに h1 は1つのまま）。
- `LangSwitch` も `page` を受け取り、同じページのほかの言語（`/en/about/` など）を指す。`langPath(lang, page)` に広げる（パスは許可リストのページ名から作り、自由な文字列を入れない）。`HashSync` はトップだけにあるので、2つのページのリンクにはハッシュは付かない。
- モード・ふりがなの切替は2つのページにも置く（ふりがなの ON/OFF が効く）。

### 2. 2つのページ

- `app/[lang]/about/page.tsx`・`app/[lang]/privacy/page.tsx`（サーバーコンポーネント。`params` は `await` して `isLang` で確かめ、合わなければ `notFound()`。`generateStaticParams` はレイアウトのものを使う）。
- `generateMetadata`：`title` は「ページの題名 | サイト名」、`alternates` は `alternateUrls(lang, page)`（canonical はそのページ、hreflang は ja・en・zh-Hans・x-default → ja の同じページ）。プレビューの `noindex`・manifest・アイコンはレイアウトのものがそのまま効く。
- 文は辞書（`src/i18n/ja.ts`・`en.ts`・`zh.ts`）の `about`・`privacy` に書く（`satisfies Messages` で、3言語の項目の欠けを typecheck で止める）。日本語はふりがなの記法つきで `RubyText` で描く。こども向け・おとな向けの言い分けはしない（`ModeText` を使わない。説明・方針の文は1つの言い方で正確に書き、訳の量を増やさない）。
- 出典などの URL は辞書に入れず、定数（`src/lib/sources.ts` に `N03_SOURCE_URL`〔`Footer.tsx` から移す〕・`SOUMU_CODE_URL`・`GSI_MAPS_URL`・Cloudflare の文書の URL）にして、文は「前の文 + リンク + 後の文」（今の `footer.mapSource` と同じ形）。外部のリンクは `rel="noopener noreferrer"`。
- 「このサイトについて」の内容（見出しは `<h2>`）：
  1. このサイトについて：47都道府県の名物・名所を地図から探せる。こども・おとなのモード、ふりがな、3言語。
  2. 名物・名所の文：AI で作成し、人が確認している。項目ごとの出典はカードの「出典」に載せる（確認できなかったものは「出典なし」）。
  3. 地図データ：8.3 の出典の文（国土数値情報）と、加工したこと（形を簡略化した、市区町村の形を合わせて都道府県の形を作った、地図の中に収まらない島は全体の地図から除いた）。加工したデータを国が作ったものとして示していないこと。
  4. 境界が確定していない地域：元のデータで境界線が暫定で引かれている所があり、この地図もそのまま使っている（R10）。
  5. 読みがな・県庁の位置：8.3 の2つの出典の文（総務省「全国地方公共団体コード」、地理院地図）。東京からの距離は、都庁から各県庁までの直線の距離を10km 単位にしたもの。
- 「プライバシーポリシー」の内容：
  1. アクセス解析：Cloudflare Web Analytics を使う。Cookie を使わない。集めるのはページのパス・リファラー・国・ブラウザ・OS・端末の種類・表示速度などの集計で、個人を特定しない（Cloudflare の説明へのリンク）。
  2. Cookie：このサイトは Cookie を使わない（同意のバナーを出さない理由）。
  3. 端末に保存するもの：モード・ふりがなの設定（localStorage。ボタンを押したときだけ）と、オフラインで使うためのページ・地図・カードのデータ（Service Worker のキャッシュ）。どちらも端末の中だけで、サーバーには送らない。ブラウザの設定で消せる。
  4. 配信：Cloudflare を使って配信している。
  5. 外部のサイト：出典などのリンク先は、それぞれのサイトの方針による。
  6. 改定日。運営者・問い合わせ先は載せない（T6-01 の前に決める）。

### 3. フッター

- `Footer` の `data-footer-ai` の後に、2つのページへのリンク（`<a data-footer-link="about|privacy" href="/{lang}/about/">`）。今いるページのリンクには `aria-current="page"`。文言は辞書の `footer` に足す。ふつうの `<a>`（静的なページなので全体の読み込みでよい。`LangSwitch` と同じ）。

### 4. オフライン

- `PRECACHE_PATTERNS` に3言語の `about/index.html`・`privacy/index.html` を足す（オフラインのトップのフッターから押しても開けるように。1ページは小さい）。

## 先に書くテスト

| テスト | ファイル | テスト名（要件ID） |
|---|---|---|
| ページの URL | `tests/unit/i18n/lang.test.ts` | `F-I18N-03：langPath(lang, page) は /{lang}/・/{lang}/about/・/{lang}/privacy/ を返す` |
| canonical・hreflang | `tests/unit/lib/site.test.ts` | `F-I18N-03・D8：alternateUrls(lang, page) の canonical はそのページ、hreflang は同じページの3言語と x-default（ja）` |
| ヘッダー | `tests/unit/components/Header.test.tsx` | `4.11.7：トップではサイト名が h1、ほかのページではサイト名がトップへのリンクで h1 ではない` |
| 言語の切替 | `tests/unit/components/LangSwitch.test.tsx` | `F-I18N-03：ほかのページでは、同じページのほかの言語を指す` |
| フッター | `tests/unit/components/Footer.test.tsx` | `F-SRC-04：「このサイトについて」・プライバシーポリシーへのリンクがあり、今のページに aria-current="page"` |
| 「このサイトについて」の文 | `tests/unit/components/AboutContent.test.tsx` | `F-SRC-04・8.3：3つの出典の文と URL のリンク、AI の明記、境界が暫定の旨（R10）を3言語で出す` |
| プライバシーポリシーの文 | `tests/unit/components/PrivacyContent.test.tsx` | `5.6：Cloudflare Web Analytics・Cookie を使わないこと・localStorage の保存を3言語で出す` |
| プリキャッシュ | `tests/unit/scripts/service-worker.test.ts` | `D40：3言語の about・privacy の HTML をプリキャッシュする` |
| E2E：フッターから開ける | `tests/e2e/pages.spec.ts`（新規） | `F-SRC-04：{lang} のトップのフッターから「このサイトについて」・プライバシーポリシーを開ける`（3言語） |
| E2E：出典の文 | 同上 | `F-SRC-04・8.3：「このサイトについて」に8.3 の出典の文がある` |
| E2E：hreflang・言語の切替 | 同上 | `F-I18N-03：2つのページに canonical と hreflang があり、言語の切替は同じページを指す` |
| E2E：axe | `tests/e2e/a11y.spec.ts` | 2つのページ × 3言語 × ライト・ダーク（chromium）で違反が0件 |
| E2E：CSP・オフライン | `tests/e2e/csp.spec.ts`・`tests/e2e/pwa.spec.ts` | 2つのページで CSP 違反0件、オフラインで「このサイトについて」が開ける |

## 作る・変えるファイル（順番）

1. `src/i18n/lang.ts`（`langPath` を広げる、ページ名の型）・`src/lib/site.ts`（`alternateUrls`）＋テスト
2. `src/lib/sources.ts`（URL の定数）、`src/i18n/ja.ts`・`en.ts`・`zh.ts`（`about`・`privacy`・`footer` の文言）
3. `src/components/LangSwitch.tsx`・`Header.tsx`・`Footer.tsx` ＋テスト
4. `src/components/AboutContent.tsx`・`PrivacyContent.tsx`（文の描画。サーバー）＋テスト
5. `app/[lang]/layout.tsx`（`Header` を外す）、`app/[lang]/page.tsx`（`Header` を置く）、`app/[lang]/about/page.tsx`・`app/[lang]/privacy/page.tsx`
6. `scripts/service-worker.ts`（プリキャッシュ）＋テスト
7. E2E（`pages.spec.ts`・`a11y.spec.ts`・`csp.spec.ts`・`pwa.spec.ts`）、スクリーンショットの画面（`ja-about`・`ja-privacy`・`en-about`）
8. 文書：開発概要書（4.11.7・5.6・F-SRC-04 の周り、決定事項）、`AGENTS.md`（アーキテクチャの「画面の枠組み」・ページの追加）、タスクの定義

## 完了条件の確かめ方

- 3言語で、2つのページがフッターからたどれる：E2E（`pages.spec.ts`）。
- オフラインでも開くか（T4-02 で分かったこと）：開く。プリキャッシュに足し、`pwa.spec.ts` で確かめる。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm build`、`pnpm test:e2e`（手元、全プロジェクト）、`pnpm size`（トップのサイズが変わらないこと）、レビューで CRITICAL・HIGH なし。
- 画面が変わるので、`pnpm screenshots` で after を撮る。

## 判断が必要な点

| 項目 | 推奨 | 理由 |
|---|---|---|
| 運営者の名前・問い合わせ先 | このPRでは載せない（オーナーが決定）。T6-01（公開）の前に決める項目として、T6-01 のタスクの定義と開発計画 5章に書く | プライバシーポリシーには運営者と問い合わせ先を書くのがふつうだが、個人の名前・メールアドレスを推測で書けない。リポジトリは private なので、GitHub の Issue も問い合わせ先にできない |
| ヘッダーの置き場所 | レイアウトから各ページに移し、`page` を渡す | レイアウトは子のパスを知らないので、言語の切替を同じページに向けられない。h1 もページごとに変える必要がある。クライアントで `usePathname` を使うと、サーバーの HTML と JavaScript がないときに正しくならない |
| 2つのページの h1 | ページの題名を h1 にし、サイト名はトップへのリンクにする | 1ページに h1 は1つ。ページの主題が最初の見出しになり、トップへ戻る道もできる |
| こども向け・おとな向けの言い分け | しない（1つの言い方。日本語はふりがなつき） | 説明・方針の文は正確さを優先する。言い分けると訳の量が倍になり、内容のずれも起きやすい |
| 文の置き場所 | 辞書（`about`・`privacy`）。URL は定数 | `satisfies Messages` で3言語の欠けを typecheck で止められる。今のフッターと同じ形 |
| オフライン | 開く（プリキャッシュに足す） | オフラインのトップのフッターから押したときに失敗しない。HTML は小さい |
| ページへのリンク | ふつうの `<a>`（`next/link` を使わない） | 静的なページで、`LangSwitch` と同じ扱い。ソフトナビゲーションでの `<html>` の属性の書き戻し（T3-05）を気にしなくてよい |
| Web Analytics の記述 | 「使う」と書く（入れるのは T6） | 公開の時点で正しい内容にする。T6 で入れなかったら、そのときに直す（T6 のタスクの定義に書き足す） |
| Lighthouse の対象 | 足さない | 5.1 の基準はトップの表示。2つのページは文だけで軽い |

## 承認後に変えたこと

（実装後に書く）
