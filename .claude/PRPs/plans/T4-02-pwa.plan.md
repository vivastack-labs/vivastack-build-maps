# T4-02 PWA：実装計画

- タスクの定義：`docs/tasks/m4-pwa-quality.md` の T4-02
- ブランチ：`feat/T4-02-pwa`
- 参照仕様：開発概要書 5.4、4.11.5、U3、U13、D3、D38、D39（CSP）

## 目的

ホーム画面に追加でき、一度開けば電波がないところでも地図とカード（一度見た県の内容）・市区町村（一度見た県）を見られるようにする。

## 着手時に調べたこと

- `dist/` の構成（`trailingSlash: true`）：`ja/index.html`・`en/index.html`・`zh/index.html`・`404.html`・`404/index.html`・`_not-found/index.html`、各言語に RSC の `*.txt`（言語の切替は `<a>` の全体の読み込みなので使わない）、`_next/static/chunks/*.js|css`、`cards/{lang}/NN.json`（141）、`geo/muni/NN.topo.json`（47。合計 3.0MB）。
- 大きさ（E2E のフィクスチャのビルド、gzip 後）：JS 合計 約 225KB、HTML は ja 83KB・en 75KB・zh 76KB。本番の上限のコンテンツでは各言語の最初の読み込みが 260〜270KB（T3-09）なので、3言語の HTML ＋ JS・CSS をすべて先にキャッシュすると、およそ 0.5〜0.6MB をインストールのときに裏で読む。
- 候補のツール（npm、2026-11-16 時点）：
  - `workbox-build` 7.4.1（2026-05。Google）。`generateSW` が設定だけから `sw.js` を作る（自分で SW のコードを書かない）。依存が多い（rollup・babel・terser など。ビルドのときだけ使う devDependency）。インストールスクリプトはない見込み（入れるときに確かめる）。
  - `@serwist/build` 9.5.13（2026-10）。`injectManifest` で、自分で書いた SW のソースにプリキャッシュの一覧を入れる方式。SW のソースを別に esbuild などで組み立てる工程が要る（`@serwist/next` は webpack／Next.js のバンドラー向けで、静的出力の後の工程には合わない）。
- `muniLoader`・カードの読み込み（`createResourceLoader`）は、`fetch` の前に `navigator.onLine` を見ない。fetch が失敗したときだけ `onLine` で `offline` と `network` を分ける。Service Worker がキャッシュから返せば成功、キャッシュがなければ fetch が失敗して `offline` になる（今のコードを変えずに 4.11.5 のとおりになる）。
- Playwright は、Service Worker が出した通信を `page.route` で受けられない（公式ドキュメントは `serviceWorkers: 'block'` を勧めている）。既存の E2E（`muni.spec.ts`・`card.spec.ts` など）は `page.route` で失敗を作っているので、SW が動くと結果が変わる。

## 方針

### 1. 決めること（U3・U13 → D40・D41）

- **U3（オフラインで使える範囲）→ D40**：5.4 の案のとおり。
  - アプリの枠組み：3言語の HTML（`ja/` `en/` `zh/` の `index.html`）と `_next/static/` の JS・CSS、manifest、アイコン。インストールのときにプリキャッシュする。都道府県の地図・カードの見出し・さくいんは HTML にあるので、これだけで使える。言語の切替もオフラインで動く。
  - 市区町村（`/geo/muni/NN.topo.json`）とカードの内容（`/cards/{lang}/NN.json`）：一度読み込んだものだけ。**NetworkFirst**（オンラインでは今までどおりネットワークから読み、成功した 200 の応答をキャッシュに入れる。ネットワークが失敗したときだけキャッシュから返す）。CacheFirst だと、デプロイでカードの内容を直しても古いままになるため。StaleWhileRevalidate だと、オンラインでも1回古い内容を見せるため。
  - プリキャッシュしないもの：RSC の `*.txt`、`404.html`・`404/`・`_not-found/`、`_headers`・`_redirects`。
  - `/`（`/ja/` への 301）はオフラインでは開けない（`start_url` は `/{lang}/` なので、ホーム画面から開くときは困らない）。
- **U13（ツール）→ D41**：`workbox-build` の `generateSW` を `scripts/postbuild.ts` から呼ぶ（5.4・U13 の推奨案）。
  - 理由：SW のコードを自分で書かずに、プリキャッシュの版の管理（ファイルの内容のハッシュ）・古いキャッシュの削除・NetworkFirst を使える。Next.js のバンドラーに依存せず、`writePageCsp` の後の工程にそのまま入る。Serwist は SW のソースを組み立てる工程が1つ増え、この用途では得るものがない。
  - `inlineWorkboxRuntime: true`・`sourcemap: false`・`mode: 'production'` で、`dist/sw.js` の1ファイルにする（`workbox-*.js` を別に置かない）。
  - `skipWaiting: true`・`clientsClaim: true`：最初に開いたページも、SW のインストールが終わった時点から SW を通るようにする（そうしないと、最初に開いたページで見た県の市区町村・カードがキャッシュに入らず、「一度見た県」が2回目の読み込みからになる）。新しいデプロイは、SW の更新の後の次の読み込みで反映される（更新を知らせる UI は作らない）。
  - 市区町村・カードの実行時キャッシュは `ExpirationPlugin`（`maxEntries`：市区町村 47、カード 141）と `CacheableResponsePlugin`（`statuses: [200]`）。
- **順番**：`assembleDist` → `writePageCsp` → `writeServiceWorker`（タスクの定義のとおり。プリキャッシュする HTML のハッシュを、CSP を書いた後の HTML から求める）。失敗したら今と同じく `dist/` を消す。`generateSW` は Promise を返すので、`assembleDistWithCsp` を async にする。

### 2. Web App Manifest（言語ごと）

- `src/features/pwa/manifest.ts`（純粋関数）の `webManifest(lang)`：
  - `name`：辞書の `siteName`（`plainText()` で読みを除く）。`short_name`：辞書に `pwa.shortName` を足す（ja「めいぶつ{地図|ちず}」→ 読みを除く、en「Meibutsu Map」、zh「名产地图」）。
  - `id`・`start_url`：`/{lang}/`（3言語を別のアプリとして追加できる）。`scope`：`/`（言語の切替でアプリの外に出ないように）。`display`：`standalone`。`lang`：`htmlLang(lang)`。
  - `background_color`・`theme_color`：`#ffffff`（`--color-page-bg`）。
  - `icons`：`/icons/icon-192.png`・`/icons/icon-512.png`（`purpose: any`）・`/icons/icon-maskable-512.png`（`purpose: maskable`）。
- 出力：`app/[lang]/app.webmanifest/route.ts`（`force-static`・`dynamicParams = false`・`generateStaticParams` は `langStaticParams()`。カードの JSON〔T3-09〕と同じ形）で `/ja/app.webmanifest` などを出す。名前を `manifest.webmanifest` にしないのは、Next.js のメタデータのファイル（`app/manifest.ts`。ルートに1つだけ）と紛れないため。拡張子が `.webmanifest` なので、Workers の静的配信は `application/manifest+json` で返す（E2E で確かめる）。
- リンク：`app/[lang]/layout.tsx` の `generateMetadata` に `manifest: '/{lang}/app.webmanifest'` と `icons`（`apple`：`/icons/apple-touch-icon.png`〔180px。iOS のホーム画面〕、`icon`：`/icons/icon.svg`〔ファビコン。今は `/favicon.ico` が 404〕）。どれも同じオリジンなので、CSP の `default-src 'self'`・`img-src 'self'` の範囲に入る。

### 3. アイコン（仮）

- `geo/data/prefs.topo.json` から日本の形（47県をまとめた1色の形）を、色のついた角丸の正方形の上に描いた SVG を作り、Playwright の chromium で PNG（180・192・512・maskable 512〔セーフゾーン 80% の内側に収める〕）にする。スクリプトは `scripts/make-icons.ts`（一度だけ手で実行。出力の `public/icons/` をコミットする。毎回のビルドでは動かさない）。
- デザインは仮。オーナーが差し替えられるように、`public/icons/icon.svg` を元にする。

### 4. Service Worker の登録

- `src/components/ServiceWorkerRegistration.tsx`（クライアント。DOM を出さない）を `app/[lang]/layout.tsx` の `<body>` に置き、`useEffect` で `navigator.serviceWorker.register('/sw.js', { scope: '/' })`。Next.js の JS のチャンク（外部ファイル）に入るので、インラインスクリプトは増えない（CSP のハッシュも増えない）。
- `process.env.NODE_ENV !== 'production'`（`pnpm dev`。`sw.js` がない）と、`serviceWorker` がないブラウザでは何もしない。登録の失敗は利用者に見せることがないので、画面には出さない（`console` にも出さない。lint の決まり）。
- `public/_headers` に `/sw.js` の `Cache-Control: no-cache`（更新をすぐ見つけるため）。

### 5. E2E の切り分け

- `playwright.config.ts`・`playwright.preview.config.ts`・`playwright.screenshots.config.ts` の `use` に `serviceWorkers: 'block'`（既存のテストの `page.route` が SW に邪魔されないように。SW のない今と同じ条件で動く）。
- `tests/e2e/pwa.spec.ts` だけ `test.use({ serviceWorkers: 'allow' })`。Chromium だけ（`test.skip(browserName !== 'chromium')`。タスクのテスト条件）。

### 6. 文書

- 開発概要書 5.4（決めた内容と理由）、第16章の U3・U13 を決定に、付録A に D40・D41、6.6 / 11.x の `dist/` の組み立ての説明に `sw.js`、更新日。
- 開発計画 5章の U3・U13 の行（決まったことを書く）。
- `AGENTS.md`：アーキテクチャに「PWA」の節（SW は postbuild の最後、E2E は `serviceWorkers: 'block'` が既定で `pwa.spec.ts` だけ許可、`pnpm dev` では登録しない、`wrangler dev` の 8787 番では SW が残る〔古い HTML が出たら2回読み込む〕、manifest とアイコン）。技術スタックに workbox-build。コマンドに `node scripts/make-icons.ts`。
- T4-03〜T4-06 のタスクの定義に関係があれば書き足す（例：Lighthouse の PWA の項目、T4-06 の対応環境の確認でホーム画面への追加を見る）。

## 先に書くテスト

| テスト条件・確かめること | ファイル | テスト名（例） |
|---|---|---|
| manifest の中身（3言語の `name`・`short_name`・`icons`・`start_url`＝その言語・`id`・`scope`・`display`・`lang`、ふりがなの記法が残らない） | `tests/unit/features/pwa/manifest.test.ts` | `5.4: webManifest は言語ごとの名前と start_url /{lang}/ を返す` など |
| 辞書の `pwa.shortName` がふりがなの記法として正しい | 既存の辞書のテストに足す | `5.4: pwa.shortName` |
| SW の設定：プリキャッシュに3言語の HTML と `_next/static` があり、`*.txt`・`404`・`_not-found`・`cards`・`geo` がない。実行時キャッシュが `/geo/muni/` と `/cards/` に NetworkFirst | `tests/unit/scripts/postbuild.test.ts`（小さな仮の `dist/` で `writeServiceWorker` を動かし、`generateSW` の結果〔`manifestEntries`〕と `sw.js` の中身を見る） | `U13: writeServiceWorker はアプリの枠組みだけをプリキャッシュする` |
| SW はプリキャッシュの HTML を CSP を書いた後の内容で数える（`assembleDistWithCsp` の順番） | 同上 | `U13: sw.js のプリキャッシュの版は CSP を書いた後の HTML のもの` |
| SW の生成に失敗したら `dist/` を消す | 同上 | `U13: sw.js を作れなければ dist/ を残さない` |
| 登録：本番では `/sw.js` を登録し、開発・SW のないブラウザでは何もしない。登録の失敗で例外にならない | `tests/unit/components/ServiceWorkerRegistration.test.tsx` | `5.4: 本番のビルドでは /sw.js を scope / で登録する` など |
| E2E：SW が登録される（`navigator.serviceWorker.ready`、`controller` がある） | `tests/e2e/pwa.spec.ts` | `5.4: Service Worker が登録される` |
| E2E：一度開いた後、オフラインで再読み込みしても地図とカード（見出し）が出る。一度見た県のカードの内容も出る | 同上 | `5.4: オフラインで再読み込みしても地図とカードが表示される` |
| E2E：オフラインで、一度見た県を最大化すると市区町村が出て、見ていない県では「オフラインのため表示できません」 | 同上 | `4.11.5: オフラインでは一度見た県の市区町村だけが表示される` |
| E2E：3言語の manifest に `name`・`icons`・`start_url`・`display` があり、`start_url` がその言語のページ。`<link rel="manifest">` がある。アイコンが 200 で返る。Content-Type | 同上 | `5.4: 3言語の manifest` |
| E2E：SW があってもオフラインの操作の間に CSP 違反が出ない | 同上（`csp.spec.ts` の集め方を使う） | `5.5: オフラインでも CSP 違反がない` |

## 作る・変えるファイル（順番）

1. `pnpm add -D workbox-build`（インストールスクリプトがあれば `allowBuilds` を決める）
2. 辞書（`src/i18n/ja.ts`・`en.ts`・`zh.ts`）に `pwa.shortName`、`src/features/pwa/manifest.ts`、`app/[lang]/app.webmanifest/route.ts`
3. `scripts/make-icons.ts` → `public/icons/`（`icon.svg`・`icon-192.png`・`icon-512.png`・`icon-maskable-512.png`・`apple-touch-icon.png`）
4. `app/[lang]/layout.tsx`（`manifest`・`icons`、`ServiceWorkerRegistration`）、`src/components/ServiceWorkerRegistration.tsx`
5. `scripts/postbuild.ts`（`writeServiceWorker`、`assembleDistWithCsp` を async に）、`public/_headers`
6. Playwright の3つの設定（`serviceWorkers: 'block'`）、`tests/e2e/pwa.spec.ts`
7. 文書（開発概要書・開発計画・`AGENTS.md`・タスクの定義）

## 完了条件の確かめ方

- 開発概要書の U3・U13 が決定になっている：第16章の行に取り消し線と「決定（D40・D41）」、付録A に D40・D41、5.4 の本文。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジ）・`pnpm build`・`pnpm test:e2e`（全プロジェクト。既存のテストが `serviceWorkers: 'block'` で変わらず通る）・`pnpm test:e2e:preview`・`pnpm size`（登録のコンポーネントのぶん JS が増えるので、300KB の基準の中か）。
- テスト条件：`pwa.spec.ts`（chromium）。
- 手で：`pnpm build` ＋ `wrangler dev` で、Chrome の DevTools の Application（Manifest にエラーがない、インストールできる、SW の状態）を見る。

## 判断が必要な点

| # | 項目 | 推奨案 | 理由 | ほかの案 |
|---|---|---|---|---|
| 1 | U13：ツール | `workbox-build` の `generateSW`（`inlineWorkboxRuntime` で `sw.js` 1つ） | SW のコードを書かずに、プリキャッシュの版の管理・古いキャッシュの削除・NetworkFirst が使える。postbuild の最後にそのまま入る。2026-05 にも版が出ている | Serwist（`@serwist/build` の `injectManifest`）：SW のソースを書いて組み立てる工程が増える。自前の SW：依存はないが、版の管理・更新の扱いを自分で持つ |
| 2 | U3：プリキャッシュの範囲 | 3言語の HTML と JS・CSS・manifest・アイコン（およそ 0.5〜0.6MB を裏で読む） | 言語の切替もオフラインで動く。開いた言語だけにするには、`generateSW` では書けない自前のコードが要る | 開いた言語の HTML だけ（通信は約 3 分の 2。自前のコードが要る） |
| 3 | 市区町村・カードの JSON の戦略 | NetworkFirst（オンラインは今と同じ、失敗したときだけキャッシュ） | カードの内容を直したデプロイがすぐ反映される。オンラインの動きが今と変わらない | StaleWhileRevalidate（速いが1回古い内容を見せる）、CacheFirst（更新されない） |
| 4 | 更新の反映 | `skipWaiting` ＋ `clientsClaim`。更新の通知 UI は作らない | 最初に開いたページで見た県もキャッシュに入る（テスト条件の「一度見た県」）。新しいデプロイは次の読み込みで反映 | 待機させて「更新があります」を出す（UI と文言が増える。今は要らない） |
| 5 | manifest の出し方とパス | ルートハンドラー `app/[lang]/app.webmanifest/route.ts`（`/ja/app.webmanifest`）、名前は辞書から | カードの JSON と同じ形。名前を辞書で管理できる。`manifest.webmanifest` は Next.js のメタデータのファイルと紛れるので避ける | `public/` に3つの静的ファイル（辞書と二重管理になる）、postbuild で書く |
| 6 | `scope`・`id` | `scope: /`、`id`・`start_url: /{lang}/` | 言語の切替でアプリの外に出ない。3言語を別のアプリとして追加できる | `scope: /{lang}/`（言語を切り替えるとブラウザの画面になる） |
| 7 | `short_name` | 辞書に `pwa.shortName`：ja「めいぶつ地図」、en「Meibutsu Map」、zh「名产地图」 | ホーム画面の名前は12字程度で切れる。`siteName` は長い | `siteName` をそのまま使う |
| 8 | アイコン | 日本の形（`prefs.topo.json`）を角丸の正方形に描いた仮のアイコン。`scripts/make-icons.ts` で一度だけ作ってコミット。apple-touch-icon とファビコン（SVG）も付ける | 新しい依存なし（Playwright で PNG にする）。デザインは後で差し替えられる | オーナーが用意する（それまで止まる）、文字だけのアイコン |
| 9 | E2E の SW | 既存の設定は `serviceWorkers: 'block'`、`pwa.spec.ts` だけ許可（chromium） | `page.route` で失敗を作る既存のテストが、SW のせいで変わらない | すべてで許可（`page.route` のテストを書き直す） |
| 10 | 登録の方法 | クライアントコンポーネントの `useEffect`（Next.js の JS のチャンクに入る外部ファイル） | インラインスクリプトが増えない。開発では登録しない分岐を書ける | `public/sw-register.js` を `<script src>` で読む（ファイルが1つ増え、開発での分岐が書きにくい） |

## 承認後に変えたこと

- `writeServiceWorker` の置き場所：`scripts/postbuild.ts` の中 → `scripts/service-worker.ts`（`postbuild.ts` が呼ぶ。`postbuild.ts` が長くなるため。テストは `tests/unit/scripts/service-worker.test.ts`。順番・失敗時に `dist/` を消すことは `postbuild.test.ts` で確かめる）。
- `writeServiceWorker` の失敗の条件を足した：3言語の HTML のどれかがなければ、ファイルを書く前に例外。workbox の警告（パターンに合うファイルがない・2MB の上限で外れたファイル）があれば例外（オフラインの範囲が黙って小さくならないように）。
- 登録：`useEffect` の中で、すぐ登録 → ページの `load` の後に登録（プリキャッシュの通信が、ページの読み込みと取り合わないように）。
- `serviceWorkers: 'block'` は3つ目の `playwright.screenshots.config.ts` にも入れた（計画のとおり。理由はスクリーンショットが古い HTML に変わらないため）。`pwa.spec.ts` は、Chromium のうち、タッチの端末（Pixel）も飛ばす（最大化がダブルクリックのため）。
- `workbox-build` は `7.4.1` に固定（ほかの依存と同じ）。インストールスクリプトはなく、`allowBuilds` は変えていない。
- アイコンの SVG は小数0桁のパス（約 38KB）。
- 文書：開発計画の T4-02 の「状態」は変えていない（前のタスクと同じく、マージの後に更新する）。T4-05・T4-06 のタスクの定義に、オフラインで開くページの扱いと実機確認の項目を足した。
- レビューの指摘で足した：
  - `networkTimeoutSeconds: 4`（`scripts/service-worker.ts` の `NETWORK_TIMEOUT_SECONDS`。市区町村・カードの NetworkFirst）。つながっているのに通信が進まないとき、15秒の打ち切りより先にキャッシュへ切り替える。キャッシュがなければ待ち続ける。
  - `manifestTransforms`：プリキャッシュの URL を `xx/index.html` から `xx/` にした（Workers の静的配信は `/xx/index.html` を `/xx/` へ転送するため。ナビゲーションの URL とキーを合わせる）。
  - E2E：オフラインにする前に CDP の `Network.clearBrowserCache` で HTTP キャッシュを消す（`/geo/*` の max-age・`_next/static` の immutable で、SW のキャッシュがなくても通るのを防ぐ）。オフラインの市区町村の応答が `fromServiceWorker()` であることと、プリキャッシュのキーが `/{lang}/` であることも確かめる。SW の設定を壊して（市区町村・カードの URL の規則と `_next/static` のパターンを変えて）テストが落ちることを確認した。
  - 文書：5.4 の「裏で読む量」を実測（約 0.3MB）に直した。ダークモードの起動画面が白であること、T4-06 の実機確認の項目（2言語以上をホーム画面に追加したとき）を足した。
