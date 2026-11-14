# T2-09 ツールチップ：実装計画

- タスクの定義：`docs/tasks/m2-map-core.md` の T2-09
- ブランチ：`feat/T2-09-tooltip`
- 参照仕様：開発概要書 F-TIP-01・02、4.11.2（ホバーの行）、4.11.3、4.11.4、6.6 (2)、F-I18N-05、開発計画 1.1（E2E は `tests/fixtures/content/`）

## 目的

マウスで地図を操作するとき、県（県名と名物3つの名前）と、最大化中の市区町村（名前と読みがな）を、マウスの位置の近くで確かめられるようにする。

## 方針

- **E2E のコンテンツをフィクスチャにする（判断 1）**：開発計画 1.1 は「E2E は `tests/fixtures/content/` を使う」と決めているが、今の E2E は本物の `content/` でビルドしている（今までは内容を見るテストがなかった）。本物の47県は名物が `[]` なので、「名物のある県」を E2E で確かめられない。フィクスチャ（今は北海道・東京都・沖縄県の3県）に、残りの44県を本物の `content/prefectures/` から写して47県にし（名物・名所は `[]`）、`playwright.config.ts`・`playwright.screenshots.config.ts` の `webServer` を `CONTENT_DIR=tests/fixtures/content pnpm build && …` にする。単体テストの「フィクスチャは3県」の期待（`content.test.ts` の `toHaveLength(3)` など）を47県に直す。
- **県のツールチップの中身はサーバーで出力する（判断 2）**：カード（`CardSwitch`）と同じく、47県ぶんの `<div data-tip-pref="NN" hidden>`（県名＋名物の名前の `<ul>`。名物がない県は県名だけ）をサーバーで出力し、クライアントは `hidden` と位置だけを書き換える（6.6 (2)）。県名・名物の名前は `RubyText` で描く（ふりがなの記法をクライアントで解かない。ふりがなの ON/OFF も CSS で効く）。解説文は出さない。
  - `src/components/MapTooltip.tsx`（サーバー）：中身を作り、`Tooltip` の `children` に渡す。
  - `src/components/Tooltip.tsx`（クライアント）：表示・位置・市区町村の中身。`MapArea` の `[data-map-box]` の中、`MapInteraction` の外（`MuniStatus` と同じ場所）に置く。
- **イベントは地図の箱で受ける**：`Tooltip` が effect で親の `[data-map-box]` に `pointerover`・`pointermove`・`pointerout`（と `pointerdown`）のリスナーを付ける（`MapInteraction` は変えない）。位置は `pointermove` ごとに `style.transform` だけを書き、React を描き直さない。表示する対象（県・市区町村・なし）が変わったときだけ状態を変える。
- **何を出すか（4.11.2、4.11.3）**は純粋関数 `src/features/map/tooltip.ts` の `tooltipTarget({ target の属性, maximized, pointerType, buttons })` で決める：
  - タッチ（`pointerType === 'touch'`）・ボタンを押している間（ドラッグでの移動中）→ なし。
  - 最大化していない：県（`data-pref`）の上 → 県のツールチップ（通常・固定中の両方）。
  - 最大化中：市区町村（`data-muni`）の上 → 市区町村のツールチップ。それ以外（ほかの県・読み込み前の最大化した県）→ なし（4.11.2「市区町村のツールチップだけ」）。
  - 海・余白・ボタン → なし。
- **市区町村のツールチップ**：`data-muni`（5桁の `code`）を `useMuniShapes(state.maximized)` の `shapes[].properties` で引く（読み込み・変換は共有のキャッシュで1回）。文言は純粋関数 `muniTooltipText(properties, lang)`：
  - ja：`name.ja`（区は「札幌市中央区」とすでに市名を含む）と、その下の行に `kana`（判断 4）。
  - en：`name.en`（区は `Chuo-ku, Sapporo-shi`）。読みは出さない。
  - zh：`name.ja`（`lang="ja"`。F-I18N-05）。読みは出さない。
- **位置**：純粋関数 `tooltipPosition({ pointer, tooltip の大きさ, 箱の大きさ })`。マウスの右下（12px ずらす）に出し、箱の右・下にはみ出すなら左・上に反転し、それでもはみ出すなら箱の内側に寄せる（箱は `overflow-hidden` なので切れないように）。
- **読み上げ**：ツールチップは `aria-hidden="true"`・`pointer-events-none`。同じ情報はカード（県名・名物は T3-03）と「市区町村の一覧」（T2-08）で読めるので、二重に読ませない。
- **本番の `reviewed` の絞り込みは T3-02**：このタスクでは名物の `status` を見ずにすべて出す（4.11.4「準備中の県は県名だけ」は T3-02 が `publish.ts` で名物を空にすれば、同じ「名物がない県」の表示になる）。T3-02 の定義に書き足す。

## 先に書くテスト

### 単体：`tests/unit/features/map/tooltip.test.ts`

- `F-TIP-01: 最大化していないとき、県の上ではその県のツールチップ`
- `F-TIP-01: 固定中でも、県の上では県のツールチップ（4.11.2）`
- `F-TIP-01: 海・余白（県の属性がない）ではなし`
- `4.11.3: タッチではなし`
- `ボタンを押している間（ドラッグ中）はなし`
- `F-TIP-02: 最大化中、市区町村の上では市区町村のツールチップ`
- `4.11.2: 最大化中、ほかの県・市区町村のない所ではなし`
- `属性の値が県コード・市区町村コードの形でなければなし`（境界の検証）
- `F-TIP-02: muniTooltipText は日本語で名前と読み、区は市名を含む`
- `F-I18N-05: muniTooltipText は英語でローマ字だけ、中国語で日本語の漢字表記だけ`
- `tooltipPosition はマウスの右下に出す`／`右・下にはみ出すなら左・上に反転する`／`箱より大きいときは箱の内側に寄せる`

### コンポーネント：`tests/unit/components/Tooltip.test.tsx`（読み込み部品は置き換える）

- `F-TIP-01: マウスで県にのせると、その県の中身だけ hidden が外れる`
- `F-TIP-01: 県から海に出ると隠れる`
- `4.11.3: pointerType が touch のときは出ない`
- `F-TIP-02: 最大化中、市区町村にのせると名前と読みが出る（ja）`
- `F-I18N-05: 英語では name.en、中国語では lang="ja" の name.ja`
- `ルートは aria-hidden`

### コンポーネント：`tests/unit/components/MapTooltip.test.tsx`

サーバーコンポーネントだが async ではないので Vitest で描ける。

- `F-TIP-01: 県ごとに県名と名物3つの名前を出し、解説文は出さない`
- `4.11.4: 名物がない県は県名だけ（名物の一覧を出さない）`

### 単体：`tests/unit/lib/content.test.ts`（直す）

- フィクスチャの県の数の期待を 3 → 47 にする。北海道・東京都・沖縄県の中身を確かめるテストはそのまま。

### E2E：`tests/e2e/tooltip.spec.ts`（フィクスチャのコンテンツ）

PC（`hasTouch` でないプロジェクト）：

- `F-TIP-01: 名物のある県（北海道）にマウスをのせると、県名と名物3つの名前が出る`
- `4.11.4: 名物がない県（沖縄県）では県名だけが出る`
- `F-TIP-01: 海にマウスを動かすと隠れる`
- `F-TIP-02: 最大化中、札幌市中央区にマウスをのせると「札幌市中央区」と「さっぽろしちゅうおうく」が出る`

マウスの位置は `page.mouse.move`。凹んだ形の内側の点は `muni-render.spec.ts` の `pointInside`（`isPointInFill`）を `helpers.ts` に移して使う。

タッチ（`hasTouch` のプロジェクト）：

- `4.11.3: 県をタップしても、ツールチップは出ない`

## 作る・変えるファイル（順番）

1. `tests/fixtures/content/`：44県を `content/prefectures/` から写す。`tests/unit/lib/content.test.ts` の期待を直す。`playwright.config.ts`・`playwright.screenshots.config.ts` の `webServer` に `CONTENT_DIR`。既存の E2E が通ることを確かめる（中身を見るテストはないので変わらないはず）。
2. `src/features/map/tooltip.ts`（`tooltipTarget`・`muniTooltipText`・`tooltipPosition`）と単体テスト。
3. `src/components/MapTooltip.tsx`（サーバー）と `src/components/Tooltip.tsx`（クライアント）とコンポーネントテスト。色は `app/globals.css` の `@theme` に `--color-tooltip-*`（ライト・ダーク）を足す。
4. `src/components/MapArea.tsx` に置く。
5. `tests/e2e/tooltip.spec.ts`、`helpers.ts` に `pointInside` を移す。
6. `tests/screenshots/pages.spec.ts` に場面を足す：`ja-tooltip-pref`（北海道にのせる）、`ja-tooltip-muni`（北海道を最大化して札幌市中央区にのせる）。
7. 文書：`AGENTS.md`（アーキテクチャにツールチップ、E2E がフィクスチャを使うこと）、`docs/tasks/m3-card-i18n-mode.md` の T3-02（ツールチップは `MapTooltip` が `publish.ts` の結果の名物を使えば県名だけになる）、`tests/fixtures/content/` の説明。

## 完了条件の確かめ方

- 「名物のある県・ない県、市区町村の、3種類のツールチップが表示できる」：E2E の3つのテスト（北海道・沖縄県・札幌市中央区）と、スクリーンショットの2場面で確かめる。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`（カバレッジ）・`pnpm build`・`pnpm test:e2e`（7プロジェクト）、code-reviewer（Opus）で CRITICAL・HIGH なし。

## 判断が必要な点

1. **E2E のコンテンツ**：推奨はフィクスチャを47県にして E2E・スクリーンショットのビルドを `CONTENT_DIR=tests/fixtures/content` にする（理由：開発計画 1.1 の決定どおりで、T5 で本物の名物が増えても E2E の結果が変わらない。読み込みの仕組みを変えずに済む）。代わりの案は「本物の上にフィクスチャの3県だけを重ねて読む」仕組みを `content.ts` に足すことだが、本番のコードに E2E のための分岐が入り、残りの44県は本物の進み具合で変わる。44県の基本情報は本物の写しになり、本物を直してもフィクスチャは追従しないが、E2E は北海道・東京都・沖縄県の中身しか見ないので困らない。
2. **県の中身の渡し方**：推奨はサーバーで47県ぶんを `hidden` で出力し、クライアントは属性と位置だけを書く（理由：カードと同じ方式（6.6 (2)）で、RSC のデータに同じ文が二重に入らない。ふりがなもサーバーで描ける）。代わりの案は県名と名物の名前を props で渡す（タスクの定義が許す範囲）が、ふりがなをクライアントで解くことになり、`RubyText` と同じ表示を二通りに持つ。
3. **ツールチップを出す入力**：推奨はタッチ以外（マウス・ペン）（理由：カードのホバーの規則 `toMapEvent` と同じにする。ペンのホバーはマウスと同じ動き）。タスクの定義の「マウスのときだけ」に厳密に合わせるなら、ペンでは出さない。
4. **市区町村の読みの出し方（日本語）**：推奨は名前の下の行に小さく読みを出し、ふりがなの ON/OFF に関係なく常に出す（理由：F-TIP-02 は読みを出すこと自体が要件で、区の読みは「さっぽろしちゅうおうく」と名前全体の読みなので、字ごとのふりがなにならない）。英語・中国語のページは読みを出さない（タスクの定義が「日本語のページ」とし、中国語の利用者にかなは役に立ちにくい）。
5. **名物の表示**：名前だけを出し、絵文字は出さない（F-TIP-01 は「名物3つの名前」。絵文字はカードで出す）。
