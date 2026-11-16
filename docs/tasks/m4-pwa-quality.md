# M4 PWA・品質：タスクの定義

項目の意味と進め方は [development-plan.md](../development-plan.md) の第1章、進み具合は第3章にある。参照仕様の章番号は [開発概要書](../development-overview.md) のもの。

マイルストーンの完了条件：axe の違反0件、Lighthouse が基準値以内。

---

## T4-01 CSP

- **種別**：feat
- **依存関係**：T3-05
- **目的**：Next.js のインラインスクリプトと初期化スクリプトだけを許可し、それ以外のスクリプトが動かないようにする。
- **参照仕様**：5.5、6.6 (4)、D23、R9

### 実装内容

- `scripts/postbuild.ts` に加える：
  - 出力したHTMLから、インラインスクリプト（`src` のない `<script>`）をすべて集め、SHA-256（base64）を計算する。
  - T3-05 で分かったこと：`<head>` の初期化スクリプト（D23）の文字列は `src/features/mode/initScript.ts` の `MODE_INIT_SCRIPT`（定数。利用者の入力が入らない固定の文字列）。出力した HTML には `<script>try{var s=localStorage,…</script>` として入る。HTML から集めるハッシュに入る（Next.js のインラインスクリプトと同じ仕組み）。ハッシュを定数から直接計算した値と、HTML から集めた値が一致することも確かめるとよい。
  - 各 HTML の `<meta http-equiv="Content-Security-Policy">`（`<meta charset>` の直後）に、ページごとの CSP を書き込む。`_headers` の1行は 2,000 字までで、ハッシュが入らないため（5.5、D39）。`_headers` の `/*` には `frame-ancestors 'none'` などの短いものだけを書く。
  - 知っている形（`MODE_INIT_SCRIPT` と完全一致、Next.js・Turbopack の書き出し）に合わないインラインスクリプトがあれば、ビルドを止める。
- CSP の内容：`default-src 'self'`、`script-src 'self'` と集めたハッシュと Web Analytics のドメイン、`connect-src 'self'` と Web Analytics のドメイン（市区町村データ `/geo/muni/` とカードの JSON `/cards/`〔T3-09、D38〕を同じオリジンの `fetch` で読み込むので、`'self'` が要る）、`object-src 'none'`、`base-uri 'self'`、`frame-ancestors 'none'`。`style-src` は `'self'` だけ（`'unsafe-inline'` なし）。サーバーの HTML の `style` 属性（6つ）はクラスに置き換え、今後出さない決まりにした（開発概要書 5.5）。`img-src 'self'`・`form-action 'self'` も足した。
- 開発概要書 11.4 (4) の `_headers` の例を、実際の内容に合わせる。

### 完了条件

- CSP を有効にした `wrangler dev` で、これまでの E2E がすべて通る。

### テスト条件

- 単体（`postbuild.ts`）：
  - 既知の文字列から、正しい SHA-256（base64）を計算する。
  - HTMLから、インラインスクリプトだけを集める（`src` のある `<script>`、`type="application/json"` などは、扱いを決めてテストする）。
  - 各 HTML の `<meta>` に、ページごとの CSP を書き込む。HTML 以外のファイルと `_headers` は変えない。
- E2E：3言語のページを開いて地図を操作する間に、CSP 違反（`securitypolicyviolation` イベント、コンソールのエラー）が1件も出ない（R9）。

---

## T4-02 PWA

- **種別**：feat
- **依存関係**：T2-07、T4-01
- **目的**：ホーム画面に追加でき、一度開けば電波がないところでも地図とカードを見られるようにする。
- **参照仕様**：5.4、U3、U13、4.11.5

### 実装内容

- オフラインで使える範囲（開発計画 5章 U3 の推奨案）と、Service Worker のツール（U13 の推奨案）を決める。結果を開発概要書 5.4 と第16章に書く。
- Web App Manifest：言語ごとに用意し（`start_url` は `/{lang}/`、名前はその言語）、HTMLからリンクする。アイコンを用意する。
- Service Worker（`dist/sw.js`）：
  - `sw.js` を作るのは、`writePageCsp`（T4-01。CSP の `<meta>` を HTML に書く）の後にする（プリキャッシュする HTML と配信する HTML を合わせるため）。オフライン用の HTML を `dist/` に足すときも、`<meta charset>` つきの HTML として置けば、`writePageCsp` が CSP を入れる（知らない形のインラインスクリプトがあるとビルドが止まる）。
  - アプリの枠組み（HTML・JavaScript・CSS）を、インストールのときにキャッシュする。
  - カードの JSON（`/cards/{lang}/NN.json`。T3-09、D38）も、市区町村データと同じく、一度読み込んだ県だけキャッシュする（`createCardLoader` もふつうの `fetch` を使うので、Service Worker のキャッシュから返れば、オフラインでも成功になる。アプリの枠組みのキャッシュだけだと、オフラインでカードの内容が出ない）。
  - 市区町村データは、一度読み込んだ県だけキャッシュする。T2-07 の `muniLoader` はふつうの `fetch` を使うので、Service Worker のキャッシュから返れば、オフラインでも成功になる（`navigator.onLine` が `false` でも先には止めない）。
- Service Worker を登録するスクリプトは外部ファイルにする（CSP のハッシュを増やさないため。T4-01 で、知らない形のインラインスクリプトがあるとビルドが止まるので、インラインにすると気付く）。`manifest` へのリンク・アイコンは `default-src 'self'`・`img-src 'self'` の範囲に収める。

### T4-02 で決めたこと・分かったこと

- U3 は D40、U13 は D41（開発概要書 5.4）。manifest は言語ごとの `/{lang}/app.webmanifest`、`sw.js` は `scripts/service-worker.ts` の `writeServiceWorker`（`workbox-build` の `generateSW`）が `postbuild.ts` の最後に作る。アイコンは仮（`node scripts/make-icons.ts` で `public/icons/` に作り直せる）。
- Playwright の設定は `serviceWorkers: 'block'` を既定にした。Service Worker が通信を横取りすると、`page.route` で失敗・遅延を作る既存のテストの結果が変わるため。`tests/e2e/pwa.spec.ts` だけ `serviceWorkers: 'allow'`（Chromium のデスクトップだけ）。
- プリキャッシュするのは、3言語の `index.html`・`app.webmanifest`・`_next/static/` の JS・CSS・`icons/`。後から HTML のページ（T4-05 の `/about/`・`/privacy/` など）を足しても、`generateSW` の対象（`scripts/service-worker.ts` の `PRECACHE_PATTERNS`）に足さない限り、オフラインでは開けない。T4-05 で決める。
- プリキャッシュの対象に合わないファイル（パターンに1つも合わない・大きさの上限を超える）があると、`writeServiceWorker` が例外にしてビルドを止める。

### 完了条件

- 開発概要書の U3・U13 が決定になっている。

### テスト条件

- E2E（Chromium）：
  - Service Worker が登録される。
  - 一度ページを開いた後、オフラインにして再読み込みしても、地図とカードが表示される（5.4）。
  - オフラインで、一度見た県を最大化すると市区町村が表示され、見ていない県では「オフラインのため表示できません」が出る（4.11.5）。
  - 3言語の manifest に `name`・`icons`・`start_url`・`display` があり、`start_url` がその言語のページである。

---

## T4-03 アクセシビリティ

- **種別**：test
- **依存関係**：T3-06、T3-07
- **目的**：WCAG 2.2 AA を満たしていることを、自動の検査と人の確認で確かめる。
- **参照仕様**：5.2、F-ZOOM-05

### 実装内容

- @axe-core/playwright の E2E：3言語 × 2モード × ライト・ダーク。状態は、最初の表示・固定中・最大化中・パネルを開いたとき（スマホ）。
- 見つかった違反を直す。色は `@theme` の変数を直す（D26）。
- 人の確認：VoiceOver（iOS・macOS）と NVDA（Windows）で、ふりがな（`<ruby>`）が二重に読み上げられないかを確かめる。問題があれば対処を決め、開発概要書 5.2 に書く。
- 実装したこと（着手時の確認で、Chrome のアクセシビリティツリーでは `<rt>` の読みが名前に入ると分かった）：`RubyText` の `<rt>` に `aria-hidden="true"` を付け、ja の「全体」ボタンの `aria-label`（WCAG 2.5.3 の違反）を外した。ダークの固定中の県名ラベルのコントラスト（3.04:1）は、固定中だけ暗い色に、塗りと同じ色の縁取りを付けて直した。`a11y.spec.ts` は PC の状態を chromium、パネルを pixel だけで動かす（72件）。県境・市区町村の境の線の色は、隣り合う塗りと 3:1 以上に直した。

### 完了条件

- axe の違反が0件。
- スクリーンリーダーでの確認の結果をPRに書いた。

### テスト条件

- E2E：上の組み合わせのすべてで、axe の違反が0件（5.2）。
- E2E：ライト・ダークのそれぞれで、地図の県名ラベルと地方の色のコントラストが 4.5:1 以上（5.2）。axe で検査できない部分（SVG の中の文字など）は、色の変数から計算する単体テストで確かめる。

---

## T4-04 Lighthouse CI

- **種別**：ci
- **依存関係**：T3-08
- **目的**：表示速度の基準値を下回る変更を、CIで止める。
- **参照仕様**：5.1、12.2

### 実装内容

T4-04 で作った（開発概要書 5.1、D42）。

- `lighthouserc.yml`：`/ja/`・`/en/`・`/zh/` をスマホの既定の設定で3回ずつ測り、指標ごとの中央値で、Performance 0.9 以上・LCP 2.5秒以下・CLS 0.1 以下・TBT 200ms 以下を確かめる。結果は `.lighthouseci/`（`upload.target: filesystem`。`.gitignore`）に出し、CI では Artifact（14日）に残す。
- INP は Lighthouse（実験室の計測）では測れないので、代わりに TBT を基準にした（200ms 以下。Lighthouse のスマホの採点で「良好」になる境目。上限のコンテンツで手元 48〜109ms）。
- `lighthouserc.tablet.yml`：幅 800px（1列の配置）の `/ja/#pref-01` を3回測り、CLS だけを確かめる（`lighthouserc.yml` の `assertMatrix`）。ハッシュつきで開いたときのずれ（CLS 0.6〜0.9）を、`<head>` の初期化スクリプトが書く `<html data-hash-pref>` で直した（開発計画 5章）ので、戻ったら止める。ハッシュつきの LCP（約 2.9秒）は基準にしない（開発計画 5章に課題として足した）。
- 最初に読み込むサイズ（300KB以下）は、`pnpm size` を上限のコンテンツで CI に加えて確かめる（PR #60）。Lighthouse も同じ上限のコンテンツの `dist/` を測る（`ci.yml` の「Size budget」の直後。本物の Build の前）。
- `package.json` の `pnpm lhci`（`@lhci/cli` 0.16.1）が、2つの設定で測り（2回目は `--additive`）、`.lighthouseci/` に保存して、基準値を確かめる。`ci.yml` に加えた。`deploy.yml` は T0-06 で作るので、そのとき `pnpm lhci` を加える。

### 完了条件

- CIで Lighthouse が実行され、基準値を下回ると失敗する。

### テスト条件

- 自動テストはない（CIの設定のため）。
- 確認の方法：作業用のブランチで基準値を実際の値より厳しくし、CIが失敗することを確かめる。結果をPRに書く。

---

## T4-05 「このサイトについて」とプライバシーポリシー

- **種別**：feat
- **依存関係**：T3-07
- **目的**：地図データの出典、AIの利用、プライバシーの扱いを、利用者に説明する。
- **参照仕様**：F-SRC-04、8.2、8.3、5.6、R10

### 実装内容

- `app/[lang]/about/page.tsx`：このサイトの目的、地図データの出典（8.3 の文）と加工したこと、境界が暫定の地域がある旨（8.2、R10）、AIで作成し人が確認していること。
  - T3-04 で分かったこと：フッターには、地図データ（国土数値情報）の出典と AI の明記だけを載せた。8.3 の2つ目の段落の、読みがな（総務省「全国地方公共団体コード」）と県庁の位置（地理院地図）の出典は、ここ（「このサイトについて」）に載せる。
- `app/[lang]/privacy/page.tsx`：Cloudflare Web Analytics を使うこと、Cookie を使わないこと、設定を端末（localStorage）にだけ保存すること。
- 3言語で書く。フッターから2つのページにリンクする。
  - T3-04 で分かったこと：`Footer`（`src/components/Footer.tsx`）は `lang` を受け取り、出典の文は辞書の `footer`（`mapSource.before`・`after`・`ai`）にある。リンクは `data-footer-ai` の後に足す（文言は辞書の `footer` に足す）。

### 完了条件

- 3言語で、2つのページがフッターからたどれる。
- T4-02 で分かったこと：オフラインでも開くかを決める。開くなら `scripts/service-worker.ts` の `PRECACHE_PATTERNS` に足す（今は3言語の `index.html` だけ）。

### テスト条件

- E2E：
  - 3言語のそれぞれで、フッターから2つのページを開ける。
  - 「このサイトについて」に、8.3 の出典の文がある（F-SRC-04）。
  - 2つのページにも `hreflang` があり、axe の違反が0件。

---

## T4-06 対応環境の確認

- **種別**：test
- **依存関係**：T4-03
- **目的**：対応環境（5.3）をCIで漏れなく確かめる。公開前の実機確認の手順をそろえる。
- **参照仕様**：5.3、D25

### 実装内容

- Playwright のプロジェクトを 5.3 に合わせて整える：PC（Chromium・Firefox・WebKit）、スマホ（iPhone・Pixel）、タブレット（iPad の縦・横、Android タブレット）、画面幅（360px・768px・1024px・1366px）。
- PC だけ・タッチだけのテストを、タグで分ける。
- `docs/device-checklist.md`：公開前の実機確認のチェックリスト（端末、OSの版、確認する操作。ピンチ、パネル、オフラインなど CI で確かめられないものを含む）。
  - T2-06 から引き継ぐ項目：Apple Pencil（`pointerType` が `pen`）のダブルタップで、最大化と Safari のダブルタップ拡大が重ならないこと（`touch-action: none` で解消する想定）。iPhone（WebKit は CDP が使えない）でのピンチ・スワイプによる拡大・移動。ピンチ（pixel の CDP）とスワイプは T2-06 の E2E で確かめている。
  - T4-02 から引き継ぐ項目：ホーム画面への追加（iPhone の Safari・Android の Chrome。アイコン・名前・`standalone` の表示）、一度開いた後の機内モードでの起動（地図・見たことのある県のカード・市区町村が出て、見ていない県は「オフラインのため表示できません」）、デプロイの後の更新（1〜2回の再読み込みで新しい内容になること）。Chrome の DevTools の Application で、Manifest にエラーがなく、インストールできるかも確かめる。
  - T4-02 から引き継ぐ項目：2言語以上をホーム画面に追加したとき、それぞれが自分の言語（`start_url`）で開くこと。リンクを受けるアプリ（Android の WebAPK。`scope` がどの言語も `/` で重なるため、外のリンクを押したときにどのアプリで開くか）。
  - スマホで地図の上を縦にスワイプしても、ページがスクロールしない（`touch-action: none`）。地図の上で指を置くとスクロールできなくなるので、使いにくくないか（地図の外側に余白があるか）を確かめる。

### 完了条件

- 全プロジェクトで E2E が通る。
- 実機確認のチェックリストができている。

### テスト条件

- E2E：すべてのプロジェクトで、これまでの E2E が通る（5.3）。
- E2E：すべてのページで、幅360pxのとき横スクロールが出ない（5.3）。
