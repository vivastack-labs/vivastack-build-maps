# T4-06 対応環境の確認：実装計画

- タスクの定義：`docs/tasks/m4-pwa-quality.md` の T4-06
- ブランチ：`test/T4-06-supported-environments`
- 参照仕様：開発概要書 5.3、D25（T2-06・T4-02・T4-03 から引き継いだ実機確認の項目）

## 目的

対応環境（5.3）を CI の E2E で漏れなく確かめられるように Playwright のプロジェクトを整え、CI で確かめられないもの（実機のピンチ、ホーム画面への追加など）は、公開前の実機確認のチェックリストにまとめる。

## 着手時に調べたこと

- 今の Playwright のプロジェクト（7つ）：`chromium`・`firefox`・`webkit`（1280×720）、`iphone`（iPhone 17、402px）、`pixel`（Pixel 10、360px）、`ipad-portrait`（iPad Mini、768px）、`ipad-landscape`（iPad Pro 11 landscape、1194px）。
  - 5.3 の画面幅のうち、360px（pixel）・768px（ipad-portrait）はある。**1024px・1366px と、Android タブレットがない**。
  - Playwright 1.65 の端末：Android タブレットは `Galaxy Tab S9`（640×1024）・`Galaxy Tab S9 landscape`（1024×640）・`Galaxy Tab S4`・`Nexus 10` など。1366px の端末はない（iPad Pro 12.9 もない）。
- PC だけ・タッチだけのテストは、いまは `test.skip(hasTouch, …)`・`test.skip(!hasTouch, …)`・`test.skip(isMobile, …)` で分けている（`keyboard`・`index`・`interaction`・`muni`・`muni-render`・`zoom`・`tooltip`・`mode`・`pending`・`pwa`・`card`・`layout`・`map`・`lang-switch`）。今のプロジェクトでは `hasTouch` と `isMobile` は同じ値。
- 「代表の1つで確かめる」skip（`project.name !== 'chromium'`・`'pixel'`、`browserName !== 'chromium'`）は、PC／タッチの区別とは別の理由。
- 横スクロールの検査（`layout.spec.ts`）は、`/ja/` を PC の幅 360px で1件と、3言語のトップを端末の幅で。**「このサイトについて」・プライバシーポリシー・404 と、カードを開いた状態は見ていない**。
- `e2e.yml`：`project` の選択肢をプロジェクトの名前と手で合わせている。`timeout-minutes: 30`。最後に全部を通した記録は T2-11（約10分）で、その後テストは大きく増えた。

## 方針

### 1. Playwright のプロジェクト（7 → 9）

| プロジェクト | 端末 | 幅 | 5.3 のどこ |
|---|---|---|---|
| chromium・firefox・webkit | Desktop（変更なし） | 1280 | PC |
| **chromebook**（追加） | Desktop Chrome、viewport 1366×768 | **1366** | 学校の端末（GIGA の Chromebook・Windows の多くがこの解像度）・画面幅 |
| iphone・pixel | 変更なし | 402・360 | スマホ・画面幅 360 |
| ipad-portrait・ipad-landscape | 変更なし | 768・1194 | タブレット（iPad 縦・横）・画面幅 768 |
| **android-tablet**（追加） | Galaxy Tab S9 landscape | **1024** | Android タブレット・画面幅 1024（2列の配置の下限を、タッチで確かめる） |

- 端末の名前・幅の対応表を `playwright.config.ts` のコメントに書く。

### 2. PC だけ・タッチだけをタグで分ける

- タグは `@pc`（マウス・キーボード・幅の指定〔`setViewportSize`〕を使う）と `@touch`（タップを使う）。`test.describe(…, { tag: '@pc' }, …)` か `test(…, { tag: '@pc' }, …)` で付ける。
- `playwright.config.ts` で、PC のプロジェクトは `grepInvert: /@touch/`、タッチのプロジェクトは `grepInvert: /@pc/`。端末の定義（`hasTouch`）から自動で決める関数（`pcProject`・`touchProject` のような小さな関数）にする。
- 今の `test.skip(hasTouch…)`・`test.skip(!hasTouch…)`・`test.skip(isMobile…)` をタグに置き換えて消す。条件が混ざったもの（`pwa.spec.ts` の `browserName !== 'chromium' || hasTouch` など）は、PC／タッチの部分をタグにし、残りは `test.skip` のまま。
- 「代表で1つ」の skip のうち `browserName !== 'chromium'` は `project.name !== 'chromium'` に直す（chromebook も Chromium なので、同じ検査が2回動くのを防ぐ）。
- 全部が片方だけのファイル（`keyboard.spec.ts` など）は、ファイル全体を1つの `describe` で包んでタグを付ける。
- 実行例：`pnpm test:e2e --grep @touch`（タッチのテストだけ）。

### 3. 360px の横スクロール（すべてのページ）

`layout.spec.ts` を広げる（新しいファイルにしない）：

- 3言語 × 3ページ（`PAGES`：トップ・about・privacy）＋ 404（`/no-such-page/`）を、
  - 全プロジェクトで、端末の幅のまま（pixel が実際の 360px のスマホ）、
  - PC のプロジェクト（`@pc`）で、幅 360px を指定して、
  横スクロールが出ないこと（`scrollWidth - clientWidth <= 0`）。ページの一覧は `PAGES`・`LANGS` から作る（ページを足すと自動で対象になる）。
- 内容が広がる状態も見る：幅 360px（pixel と、PC の幅指定）・800px・1024px（PC の幅指定）で `/en/#pref-01`（英語は単語が長い）を開き、カードの内容の読み込みを待ち、パネルを広げ（`expandSheet`）、出典の `<details>` を開き、最大化ボタンを押して「市区町村の一覧」を開いた状態で、文書とカードの箱に横スクロールが出ない。出典の URL の文字など、長い1語がはみ出すのを見つけるため（長い1語は `page.route` で入れる。「先に書くテスト」の下）。

### 4. 設定の漏れを止める単体テスト

`tests/unit/config/playwright-projects.test.ts`（node）：

- すべてのプロジェクトに、`hasTouch` に合った `grepInvert` がある（PC なら `@touch` を、タッチなら `@pc` を除く）。
- 5.3 の画面幅 360・768・1024・1366 が、どれかのプロジェクトの viewport の幅にある。PC（chromium・firefox・webkit）・スマホ（iPhone・Android）・タブレット（iPad の縦・横、Android）がある。
- `.github/workflows/e2e.yml` の `project` の選択肢が、`all` と全プロジェクトの名前に一致する（手で合わせている所の漏れを止める）。
- `tests/e2e/` に `test.skip(hasTouch`・`test.skip(!hasTouch`・`test.skip(isMobile` が残っていない（PC／タッチの区別はタグで書く決まりを、後のタスクでも守る）。

### 5. 実機確認のチェックリスト

`docs/device-checklist.md`：

- 使い方：公開前（T6-01）に1回、全体。その後は大きな変更のときに該当する行。結果の記録の表（日付・端末・OS とブラウザの版・結果・メモ）。
- 端末の表：5.3 の区分ごとに、確かめる OS・ブラウザの版（最新と1つ前。iPadOS は1つ前を必ず）。Windows の Edge・ChromeOS の Chrome・iPadOS の Safari・iOS の Safari・Android の Chrome・Android タブレット・macOS の Safari・Firefox。
- 全端末で共通の操作（短く）：開く・3言語・モード／ふりがな・県のタップ（クリック）で固定・最大化と市区町村・パネル（スマホ）・さくいん・出典のリンク・ハッシュつきの URL の共有。
- CI で確かめられない項目（タスクの定義から引き継ぐもの）：
  - iPhone のピンチ・スワイプでの拡大・移動（WebKit は CDP がない）。
  - Apple Pencil（`pen`）のダブルタップで、最大化と Safari のダブルタップ拡大が重ならない。
  - 地図の上の縦スワイプでページがスクロールしない（`touch-action: none`）。地図の外に、スクロールできる余白があるか（使いにくくないか）。
  - ホーム画面への追加（iPhone Safari・Android Chrome。アイコン・名前・`standalone`）。2言語以上を追加したとき、それぞれの言語で開く。Android の WebAPK でリンクを受けるアプリ（`scope` がどれも `/`）。
  - 機内モードでの起動（地図・見た県のカード・市区町村が出る。見ていない県は「オフラインのため表示できません」）。
  - デプロイの後の更新（1〜2回の再読み込みで新しい内容になる）。
  - Chrome の DevTools の Application で Manifest にエラーがなく、インストールできる。
  - 学校で管理されている iPad（1つ前の iPadOS）。フィルタリングのある学校のネットワークで開けるか（分かる範囲で）。
  - スクリーンリーダー（VoiceOver の iOS Safari）で、ふりがなが二重に読まれない（T4-03 の確認をスマホでもう一度）。
- 5.3 の「確認のしかた」の列から、このファイルへリンクする。

### 6. 文書・CI

- `e2e.yml`：`project` の選択肢に `chromebook`・`android-tablet`、説明の「7つ」を「9つ」に。`timeout-minutes` を 30 → 45（判断 6）。
- `AGENTS.md`：「7プロジェクト」→「9プロジェクト」、タグ（`@pc`・`@touch`）の書き方、`--grep @touch` の例。
- 開発概要書 5.3：CI の列に、プロジェクトの名前と幅を書く。`docs/device-checklist.md` へのリンク。
- タスクの定義（`m4-pwa-quality.md`）に、実際のプロジェクトとタグを書き足す。T6-01（`m6-release.md`）は `docs/device-checklist.md` を参照済みなので、そのまま。

## 先に書くテスト

| テスト | ファイル | テスト名 |
|---|---|---|
| プロジェクトとタグの対応 | `tests/unit/config/playwright-projects.test.ts` | `5.3：PC のプロジェクトは @touch を、タッチのプロジェクトは @pc を除く` |
| 画面幅 | 同上 | `5.3：画面幅 360・768・1024・1366px のプロジェクトがある` |
| 端末の区分 | 同上 | `5.3：PC・スマホ・タブレット（iPad の縦・横、Android）のプロジェクトがある` |
| e2e.yml の選択肢 | 同上 | `T0-04：e2e.yml の project の選択肢が、all と全プロジェクトの名前に一致する` |
| e2e.yml のブラウザの導入 | 同上 | `T0-04：e2e.yml の case で導入されるブラウザが、プロジェクトの defaultBrowserType と合う` |
| E2E の書き方 | 同上 | `5.3：テストの引数で hasTouch・isMobile・browserName を受け取らない（PC／タッチはタグ、代表の1つは project.name で書く）`、`5.3：例外の一覧は、実際にその引数を使っているファイルだけ（使わなくなったら消す）`、検出器自体の2件（`検出：…を見つける`・`検出：…は見つけない`） |
| 全ページの横スクロール（端末の幅） | `tests/e2e/layout.spec.ts` | `5.3：端末の幅で、/{lang}/{page}/ に横スクロールが出ない`（3言語×3ページ）・`5.3：端末の幅で、404 のページに横スクロールが出ない` |
| 全ページの横スクロール（360px） | 同上（`@pc`） | `5.3：幅360pxで、/{lang}/{page}/ に横スクロールが出ない`・`5.3：幅360pxで、404 のページに横スクロールが出ない` |
| 内容を広げた状態 | 同上 | `5.3：幅360pxで、カード・出典・市区町村の一覧を開いても、パネルと文書に横スクロールが出ない`（`@pc`）、`5.3：幅360pxのスマホ（pixel）で、…`（`@touch`。pixel だけ）、`5.3：幅800pxで、…カードと文書に…`・`5.3：幅1024pxで、…カードと文書に…`（`@pc`） |

内容を広げた状態の検査は、`/en/#pref-01` のカードの JSON（出典の URL を約220字・名物の名前の1つを102字の空白のない語に）と、`/geo/muni/01.topo.json`（1件の `name.en` を40字の空白のない語に）を `page.route` で書き換え、書き換えた文字が描かれたことを確かめてから、文書とカードの箱（`[data-area="card"]`）の両方の `scrollWidth - clientWidth` を見る（768px 未満の fixed のパネルと、1024px 以上の `lg:overflow-y-auto` のカードは、中のはみ出しが文書の `scrollWidth` に出ないため）。

単体テストは、設定を足す前に Red（4件が失敗）を確かめた。横スクロールの E2E は、長い1語を入れると今の実装で落ちた（下の「承認後に変えたこと」）。

## 作る・変えるファイルの順番

1. `tests/unit/config/playwright-projects.test.ts`（Red）
2. `playwright.config.ts`（プロジェクトの追加・`grepInvert`）、`e2e.yml`（Green）
3. `tests/e2e/*.spec.ts` の skip をタグに置き換え（単体テストの「skip の書き方」が Green）
4. `tests/e2e/layout.spec.ts` に全ページ・広げた状態の横スクロール
5. `pnpm test:e2e`（9プロジェクト）を手元で通す。新しい2つのプロジェクトで落ちるテストがあれば、原因で分ける：実装の不具合なら直す。テストの前提（幅・タッチ）の問題なら、テストを直す
6. `docs/device-checklist.md`、開発概要書 5.3、`AGENTS.md`、タスクの定義

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 全プロジェクトで E2E が通る | 手元で `pnpm test:e2e`（9プロジェクト）と `pnpm test:e2e:preview`。結果の件数（passed・skipped）を PR に書く。CI の `e2e.yml` は判断 7 |
| 実機確認のチェックリストができている | `docs/device-checklist.md`。タスクの定義の引き継ぎ項目がすべて入っていることを、定義と突き合わせる。`pnpm lint`（markdownlint） |
| 共通 | `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm build`、レビューで CRITICAL・HIGH なし |

画面は変わらないので、スクリーンショットは撮らない（PR に「画面の変更なし」）。

## 判断が必要な点

| # | 項目 | 推奨案 | 理由 |
|---|---|---|---|
| 1 | 足すプロジェクト | `chromebook`（Desktop Chrome、1366×768）と `android-tablet`（Galaxy Tab S9 landscape、1024×640）の2つ | 足りない 1024px・1366px・Android タブレットを、プロジェクトを2つ増やすだけで埋められる。1366×768 は GIGA 端末（Chromebook・Windows）に多い解像度で、学校の端末の代わりにもなる。1024px をタッチの端末にすると、「2列の配置の下限 ＋ ホバーなし」という、今までにない組み合わせを確かめられる |
| 2 | Edge のプロジェクト（`channel: 'msedge'`） | 作らない。Windows の Edge は実機確認で見る | Edge は Chromium と同じエンジンで、chromium のプロジェクトで足りる。`msedge` は Edge のインストールが要り、手元の WSL にない |
| 3 | 「1つ前の版」 | CI は Playwright に同梱の最新のエンジンだけ。1つ前の版は実機確認（特に1つ前の iPadOS）と `browserslist` で見る | Playwright は1つの版しか持たない。古い版のブラウザを CI で動かす仕組みは、費用と手間に見合わない |
| 4 | タグの分け方 | `@pc`・`@touch` の2つを、プロジェクトの `grepInvert` で除く。「代表の1つで確かめる」skip（chromium だけ・pixel だけ）は `test.skip` のまま | タスクの定義のとおり。PC／タッチの区別は端末の性質なので設定で決められる。代表の1つは「同じ検査をくり返さない」ための別の理由で、タグにすると種類が増える |
| 5 | 横スクロールの「すべてのページ」の範囲 | 3言語 × 3ページ ＋ 404 と、`/en/#pref-01` でカード・出典・市区町村の一覧を開いた状態 | ページは `PAGES` から作るので、足したページも自動で入る。はみ出しやすいのは長い URL・英語の長い単語で、開いた状態でないと出ない |
| 6 | `e2e.yml` の `timeout-minutes` | 30 → 45 分 | プロジェクトが 7 → 9 になり、T2-11（約10分）からテストも大きく増えた。CI の時間は測っていないので、余裕を持たせる。打ち切りは実際にかかった分だけ使うので、上げても費用は増えない |
| 7 | CI（`e2e.yml`）を1回動かすか | このPRでは1回だけ動かす（`project=all`） | ふだんは手元だけにしている（決まり）が、このタスクは「CI で漏れなく確かめる」ことが目的で、`e2e.yml` 自体を変える。選択肢と時間（判断 6）が実際に合うかは、CI で動かさないと分からない |
| 8 | 単体テストで設定を確かめる | 入れる（`tests/unit/config/playwright-projects.test.ts`） | プロジェクトの名前を `e2e.yml` と手で合わせている所と、タグの付け忘れ（`test.skip(hasTouch…)` に戻ること）を、後のタスクでも止められる |

判断 1〜8 は、すべて推奨案のとおり承認された。判断 7 の結果：CI の `e2e.yml`（`project=all`）は成功。E2E の段は 33.6分（9プロジェクト）、プレビューは 17秒で、30分のままなら打ち切られていた。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| アプリの修正 | はみ出しが見つかれば直す | `CardBody`（名物の `li`・行き方の文と所要時間）・`CardSources`（項目名）・`MuniList`（`li`）に `break-words` を付けた | 空白のない長い1語で、360px のパネルが 257px、1024px のカードが 25px（市区町村の一覧）はみ出した。英語の市区町村名（`Higashimatsushima-` など）は実際に 1024px の一覧の1列（約137px）を超える |
| 横スクロールの検査 | 文書の `scrollWidth`、360px | 文書とカードの箱の両方、360px・800px・1024px、JSON の書き換えで長い1語を入れる | 768px 未満のパネルと 1024px 以上のカードは中でスクロールする箱で、文書だけでは見えない（レビュー HIGH・MEDIUM）。フィクスチャの URL は短く、はみ出しを試せない |
| skip の検出 | `test.skip(hasTouch` などの文字列 | テストの引数で `hasTouch`・`isMobile`・`browserName` を受け取らないことを、`tests/e2e/` の下（再帰）で見る。例外は `csp.spec.ts`（ホバーだけを分ける）。`e2e.yml` の `case` と `defaultBrowserType` も突き合わせる | 複数行・`test.fixme`・`if (hasTouch) test.skip()` などを見逃すため（レビュー MEDIUM・LOW） |
| 「代表の1つ」の skip | `browserName !== 'chromium'` を `project.name` に | 同じ。`pwa.spec.ts` は `@pc` のタグも付けた | chromebook（Chromium）で二重に動かないため |
| `e2e.yml` の選択肢 | 1行の配列に足す | 縦のリスト | 1行では yamllint の行の長さを超える |
| 1つ前の版の書き方 | 実機と browserslist | Chrome・Edge・Firefox は自動更新なので browserslist に任せて個別に確かめない。Safari（macOS）・iOS・iPadOS の1つ前と、Edge（Windows）の最新は実機。5.3 とチェックリストをこれにそろえた | 5.3・チェックリストの表・本文が食い違っていた（レビュー MEDIUM） |
| チェックリストの前提 | 公開前に確かめる | PWA・オフラインの項目は HTTPS の URL（デプロイ後）で確かめる。T6-01 の定義に「前提：T0-06 のデプロイが済んでいる」を足した | LAN の `http://` で `wrangler dev` を開くと Service Worker が動かない（レビュー MEDIUM） |
