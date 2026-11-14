# T3-03 県のカード：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-03
- ブランチ：`feat/T3-03-pref-card`
- 参照仕様：開発概要書 F-CARD-02〜06・08、4.11.4、4.11.7、6.6 (2)、D24、F-MODE-04（F-ZOOM-04・F-CARD-01・07 は T2-05 の結線を使う）

## 目的

47県のカードをサーバーコンポーネントで HTML に出しておき、JavaScript は表示する県を切り替えるだけにする（D24・6.6 (2)）。
T2-05 の仮のカード（県名と距離だけ）を、本物のカード `PrefCard` に置き換える。

## 着手前に分かったこと（判断 1 の根拠）

今のビルド（`dist/en/index.html`）で、サーバーコンポーネントだけが出している文（案内文 `Hover over or tap a prefecture`、距離 `About 1,550 km from Tokyo`）が、
HTML の本体（109,765 バイト目）と、`<script>self.__next_f.push(…)`（RSC のデータ。282,222 バイト目）の**2回ずつ**出ている。
`index.html`（343KB）は RSC のデータ（`index.txt`、177KB）のほぼ2倍で、地図のパスも2回ずつ入っている。

Next.js 16 の同梱ドキュメント（`01-app/01-getting-started/05-server-and-client-components.md`）に、RSC のデータには
「The rendered result of Server Components」が入ると書いてあり、初回の読み込みでは HTML に埋め込まれる。止める設定はない。
つまり、完了条件「カードの解説文が、HTML の中で1回だけ出てくる」は、App Router のサーバーコンポーネントでは満たせない。
また、6.6 (2) の「props に渡すとサイズがほぼ倍になる」は、サーバーコンポーネントで出しても同じ（HTML に1回＋RSC のデータに1回）。
props に渡さない意味は、「HTML の本体に1回＋RSC のデータに1回」より増やさない（サーバーで描いた結果と props の両方が RSC のデータに入る3回目を作らない）ことと、描画のコード（ふりがなの変換など）をクライアントに送らないことになる。

## 方針

### カード：`src/components/PrefCard.tsx`（サーバーコンポーネント。フックを使わない）

`CardArea` が `CardSwitch` の中に47県ぶん出す。props は `lang`・`prefecture: PublishedPrefecture`・`distanceKm: number | null`（東京都は `null`）・`labels: Messages['card']`（と `comingSoon`）。

```html
<article id="pref-NN" data-card-pref="NN" hidden>
  <p data-card-region>北海道地方</p>
  <h2 data-card-name>北海道</h2>
  <p data-card-capital>県庁所在地：札幌市</p>
  <p data-card-distance>東京から約 830 km</p>        <!-- 東京都は出さない（T3-01） -->
  <!-- 内容を出す県 -->
  <section data-card-access>                           <!-- access があるとき -->
    <h3>行き方 [下書き]</h3>
    <p>✈️ 飛行機　羽田空港 → 新千歳空港</p>
    <p data-card-duration>所要時間の目安：1時間35分</p>
  </section>
  <section data-card-specialties>
    <h3>名物</h3>
    <ul><li data-card-item="potato"><span aria-hidden>🥔</span> <strong>じゃがいも</strong> [下書き] <p>ModeText(解説)</p></li>…</ul>
  </section>
  <section data-card-spots>…（emoji は任意）</section>
  <!-- 「準備中」の県（pending）：行き方・名物・名所の代わりに -->
  <p data-card-coming-soon>ModeText(comingSoon.card)</p>
  <button type="button" data-card-maximize="NN" hidden>
    <span data-label-maximize>大きくして市区町村を見る</span><span data-label-restore hidden>元の大きさにもどす</span>
  </button>
</article>
```

- 見出し：カードの県名を `<h2>`、行き方・名物・名所を `<h3>`（`IndexArea` の見出しが `<h2>` なので同じ階層）。地方名は辞書の `regions`、県庁所在地は `capital.name[lang]`。
- 行き方：絵文字（`aria-hidden`）・交通手段・経路・所要時間の目安。所要時間は `durationText(lang, minutes)`（95 → 「1時間35分」、60 → 「1時間」、45 → 「45分」）。「目安」は見出しの文言に入れる（F-CARD-04）。
- 名物・名所：絵文字（名所は任意）・名前・解説。解説は `ModeText`（こども向け・おとな向けの両方。判断 3）。
- 「下書き」の印（プレビュー）：`draft` が `true` の行き方・名物・名所の見出し／名前の横に `<span data-card-draft>下書き</span>`。本番の内容を出す県は全部 `false` なので出ない。
- 「準備中」の県（`pending`）：見出し・県庁所在地・距離・`comingSoon.card`（`ModeText`）と、最大化ボタン（判断 5）。
- 文字はすべて `RubyText`（`dangerouslySetInnerHTML` は使わない）。中国語のページの日本語は今どおり。
- 新しい辞書の文言（`ja.ts` に書き、`en.ts`・`zh.ts` も足す）：`card.capital`（県庁所在地／Prefectural capital／县厅所在地）、`card.access`（行き方／Getting there／交通方式）、`card.durationLabel`（所要時間の目安／Estimated travel time／所需时间（参考））、`card.duration`（`{ hoursMinutes, hours, minutes }`。`%h`・`%m` を入れる）、`card.specialties`（名物／Specialties／特产）、`card.spots`（名所／Sights／名胜）、`card.draft`（下書き／Draft／草稿）。文言の細部は実装で整え、PR で確かめてもらう。

### 文の組み立て：`src/i18n/cardText.ts`（判断 2）

- `distanceText(lang, km)` を `src/lib/distance.ts` から移す。`durationText(lang, minutes)` を足す（0 以下・整数でない値は例外）。
- `distance.ts` は計算だけにする（`../i18n/` の import がなくなる）。`distanceOf`（距離がない県は例外）は `CardArea` に残す。

### 切り替え：`CardSwitch`（クライアント）と `mapDom.ts`

- `CardSwitch` の根に `data-card-switch`。マウントしたら `data-card-ready` を付け、最大化ボタンの `hidden` を外す（JavaScript がないと動かないボタンを出さない。判断 4）。
- `applyCardState(root, pref, maximized)`（`mapDom.ts`）に、最大化の状態を足す：`[data-card-maximize]` のうち `maximized` と同じ県のボタンだけ「元の大きさにもどす」を見せる（`[data-label-maximize]`・`[data-label-restore]` の `hidden` を切り替える）。属性だけを書く（6.6 (2)）。
- ボタンのクリック：`CardSwitch` の根の `onClick` で `[data-card-maximize]` の祖先から県コードを引き（形を確かめる。`pointer.ts` の `prefFromTarget` と同じ検証）、`dispatch({ type: 'doubleClick', pref })` を送る。
  `doubleClick` の遷移（最大化していない → 最大化＋固定、同じ県を最大化中 → 元に戻す・固定は残す）が F-CARD-08・F-ZOOM-04 のボタンの動きそのものなので、`mapReducer` は変えない（判断 6）。
- 最大化は今の `MapZoom`・`useMuniShapes` がそのまま受ける（寄る・市区町村の読み込み）。

### JavaScript がないとき（6.6 (2)）

- `app/globals.css`：`[data-card-switch]:not([data-card-ready]) [data-card-pref]:target { display: block !important }`（Tailwind v4 の preflight の `[hidden] { display: none !important }` に勝つため）。
- 同じく、`:target` のカードがあれば案内文を隠す：`[data-card-switch]:not([data-card-ready]):has([data-card-pref]:target) [data-card-guide] { display: none }`。
- `:not([data-card-ready])` で絞るのは、JavaScript があるときにハッシュ（手で入力したなど）のカードと、状態で選んだカードが2枚同時に見えないようにするため（ハッシュでの固定は T3-07）。

### `CardArea`

- 仮の `<div data-card-pref>` を `PrefCard` に置き換える。案内文（`data-card-guide`、おとな向けだけ。T3-05 で `ModeText` に戻す）は残す。
- `MuniList` は今どおり `CardSwitch` の外、カードの下に1つだけ置く（判断 7）。
- 1024px 以上の sticky のまま、カードの中をスクロールできるように `lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto` を付ける。
- コメントの「仮の表示」の記述を直す。

## 先に書くテスト

### 単体（Vitest）

| ファイル | テスト名（要件ID） |
|---|---|
| `tests/unit/i18n/cardText.test.ts` | `F-CARD-03：distanceText は辞書の文に桁区切りの km を入れる（ja/en/zh）`（`distance.test.ts` から移す） |
| 同上 | `F-CARD-04：durationText は 95 分を「1時間35分」、60 分を「1時間」、45 分を「45分」にする（ja/en/zh）` |
| 同上 | `F-CARD-04：durationText は 0 以下・整数でない分を例外にする` |
| `tests/unit/components/PrefCard.test.tsx` | `F-CARD-02：見出しに地方名・県名・県庁所在地を出す（ja/en/zh）` |
| 同上 | `F-CARD-03：距離があれば距離の行を出し、null（東京都）なら出さない` |
| 同上 | `F-CARD-04：行き方に絵文字・交通手段・経路・所要時間を出し、「目安」と書く` |
| 同上 | `F-CARD-05：名物3つの絵文字・名前・解説を出す` |
| 同上 | `F-CARD-06：名所3つの名前・解説を出す（絵文字は任意）` |
| 同上 | `F-MODE-04：解説文はこども向け（.kids）とおとな向け（.adult）の両方を出す` |
| 同上 | `4.11.4：準備中の県は行き方・名物・名所の代わりに「名物・名所は準備中です」を出す（県名・県庁所在地・距離は出す）` |
| 同上 | `7.1：draft の項目にだけ「下書き」の印を出す（本番の県には出ない）` |
| 同上 | `F-CARD-08：最大化ボタンを hidden で出し、両方の文言（最大化・元に戻す）を持つ（準備中の県にも出す）` |
| 同上 | `6.6 (2)：カードに id="pref-NN" と data-card-pref と hidden を付ける` |
| `tests/unit/components/CardArea.test.tsx` | 既存の距離・47県のテストを `PrefCard` の構造に合わせる（`data-card-name`・`data-card-distance` は残す） |
| `tests/unit/features/map/mapDom.test.ts` | `F-CARD-08：applyCardState は最大化中の県のボタンだけ「元の大きさにもどす」を見せる` |
| `tests/unit/components/CardSwitch.test.tsx`（新規） | `F-CARD-08：最大化ボタンのクリックで doubleClick を送り、もう一度で元に戻す（固定は残す）` |
| 同上 | `6.6 (2)：マウントすると data-card-ready を付け、最大化ボタンの hidden を外す` |
| 同上 | `F-CARD-08：県コードの形でない data-card-maximize は無視する` |

### E2E（Playwright。`tests/e2e/card.spec.ts`。フィクスチャのコンテンツの本番用ビルド）

| テスト名 | 内容 |
|---|---|
| `F-CARD-02〜06：北海道を固定すると、本物のカード（見出し・距離・行き方・名物3つ・名所3つ）が見える` | さくいんから北海道を固定 |
| `4.11.4：準備中の県（沖縄県）のカードは「名物・名所は準備中です」` | |
| `F-CARD-08：最大化ボタンで最大化し、文言が「元の大きさにもどす」に変わる。もう一度押すと元に戻り、固定は残る` | 地図の県の `data-state="maximized"`、層の倍率 |
| `6.6 (2)：JavaScript を無効にして /ja/#pref-13 を開くと東京都のカードが見え、案内文と最大化ボタンは見えない` | `test.use({ javaScriptEnabled: false })` |
| `D24：解説文は HTML の本体に1回、RSC のデータに1回だけ出る` | `/en/` の HTML を取り、北海道の名物の英語の解説文（ふりがながない）を `<script>` の外と中で数える（判断 1） |

- F-CARD-01・07（ホバー・固定でカードが切り替わる）は、既存の `interaction.spec.ts`（`data-card-name` を見る）がそのまま確かめる。`data-card-name` を見出しに残す。
- プレビュー用：`tests/e2e-preview/preview.spec.ts` に `7.1：東京都のカードで、reviewed でない項目（3つ）にだけ「下書き」の印が出る` を足す。

### スクリーンショット

`tests/screenshots/pages.spec.ts` の `SCENES` に、さくいんから北海道を固定したカード（各言語。内容がある県）を足す。長野県・沖縄県の固定の画面は、「準備中」のカードとして写る。

## 作る・変えるファイル（順番）

1. `src/i18n/cardText.ts`・`tests/unit/i18n/cardText.test.ts`（`distanceText` を移し、`durationText` を足す）。`distance.ts`・`distance.test.ts`・`CardArea.tsx` の import を直す。
2. `src/i18n/ja.ts`・`en.ts`・`zh.ts`：カードの文言を足す。
3. `src/components/PrefCard.tsx`・`tests/unit/components/PrefCard.test.tsx`。
4. `src/features/map/mapDom.ts`（`applyCardState` に最大化）・テスト。
5. `src/components/CardSwitch.tsx`（`data-card-switch`・`data-card-ready`・ボタンのクリック）・`tests/unit/components/CardSwitch.test.tsx`。
6. `src/components/CardArea.tsx`（`PrefCard` に置き換え、スクロール）・`CardArea.test.tsx`。
7. `app/globals.css`（`:target` の規則）。
8. `tests/e2e/card.spec.ts`・`tests/e2e-preview/preview.spec.ts`・`tests/screenshots/pages.spec.ts`。
9. ドキュメント：開発概要書 6.6 (2) と付録Aの D24 に判断 1 の事実を書く。`docs/tasks/m3-card-i18n-mode.md` の T3-03 の完了条件・テスト条件を判断 1 に合わせ、T3-04（出典の置き場所と `MuniList` の順。判断 7）・T3-05（カードの解説文も `ModeText`）・T3-08（HTML は RSC のデータで約2倍になる。地図のパスも同じ）に分かったことを書き足す。`AGENTS.md` のアーキテクチャにカードの項を足し、T3-01 の項の「T3-03 で `PrefCard` に移す」を直す。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| カードの解説文が、HTML の本体に1回・RSC のデータに1回だけ出る（判断 1 で書き換えた後の条件） | E2E の D24 のテスト。加えて、ビルドした `dist/en/index.html` を `grep -c` で数え、結果を PR に書く |
| 共通（`pnpm lint`・`typecheck`・`test`・`build`、カバレッジ、レビューで CRITICAL・HIGH なし） | メインで実行。E2E は `pnpm test:e2e` と `pnpm test:e2e:preview` を手元で、merge の前に `e2e.yml` を手動で |

## 判断が必要な点

1. **完了条件「解説文が HTML の中で1回だけ」**（上の「着手前に分かったこと」）
   - 推奨：完了条件を「HTML の本体に1回、RSC のデータに1回（クライアントコンポーネントの props などで3回目を作らない）」に書き換え、6.6 (2)・D24 の説明を事実に合わせる。サイズが 5.1 に収まるかは予定どおり T3-08 で測る（地図のパスも2回入ることを T3-08 の定義に書く）。
   - 理由：App Router は、サーバーコンポーネントで描いた結果を必ず RSC のデータに入れ、止める設定がない（同梱ドキュメント）。HTML だけに出すには、ビルドの後で HTML に差し込むなど React の外で組み立てる必要があり、ハイドレーションの不一致で消える危険がある。実行時に JSON を読む方式（D24 の切り替え先）は、JavaScript なしの `:target` の表示（6.6 (2)）を失う。
2. **`distanceText` の置き場所**：推奨は `src/i18n/cardText.ts` に移し、`durationText` と並べる（理由：辞書に依存する文の組み立てを `src/i18n/` に集め、`distance.ts` を計算だけの純粋なモジュールにできる。`PrefCard` に置くとサーバーコンポーネントのファイルに関数のテストが混ざる）。
3. **こども向け・おとな向けの両方が、T3-05 まで画面に両方出る**：推奨は、タスクの定義どおり解説文を `ModeText` で両方出し、片方を隠す CSS は T3-05 に任せる（理由：既定のモードは U1 で T3-05 が決めるので、仮の CSS は捨てることになる。`MuniStatus` も既に両方を出している。T3-05 は T3-03 の直後に着手できる）。案内文は今どおりおとな向けだけ（T3-05 で戻す）。PR のスクリーンショットでは、解説文が2つずつ並んで見える。
4. **JavaScript がないときの最大化ボタン**：推奨は `hidden` で出し、`CardSwitch` がマウントしたら外す（理由：JavaScript なしでは押しても何も起きないボタンになる。属性だけで済み、CSS も要らない）。
5. **「準備中」の県のカードにも最大化ボタンを出す**：推奨は出す（理由：4.11.4 は「固定・最大化などの操作は、ほかの県と同じようにできる」。スマホは最大化をカードのボタンでしかできない（F-ZOOM-04）。4.11.4 のカードの項目の列挙にはボタンがないが、操作の規則を優先する）。
6. **最大化ボタンのイベント**：推奨は既存の `doubleClick` を送る（理由：4.11.2 のダブルクリックの列が、ボタンの動き「最大化＋固定／同じ県なら元に戻す（固定は残す）」と同じ。新しいイベントを足すと、同じ遷移を2か所に書くことになる）。ボタンはカードに表示中の県のものなので、「最大化中に別の県のボタン」は起きない。
7. **「市区町村の一覧」の位置**：推奨は今どおり `CardSwitch` の外、カードの下に1つだけ（理由：47枚のカードの中に入れると、クライアントコンポーネントが47個でき、文言の props も47回 RSC のデータに入る。4.11.7 の順「最大化ボタン → 市区町村の一覧」は今の時点では守れる）。T3-04 で出典（`<details>`）をカードに入れると、出典が一覧より上になるので、その解決（出典だけをカードの外の2つ目の `[data-card-pref]` の組にする、など）を T3-04 の定義に書き足す。

## 承認後に変えたこと

- `:target` の規則：`app/globals.css` の通常の規則 → 先頭で宣言したレイヤー `@layer card-target` の中（理由：preflight の `[hidden] { display: none !important }` は `@layer base` の中にあり、!important はレイヤーでは先に並べたものが勝つので、レイヤーなしの規則では勝てなかった。E2E で確かめた）。
- `PrefCard` の props：`labels` を渡す → `lang` から `getMessages` で引く（サーバーコンポーネントで、props はRSCのデータに入らないため）。
- 辞書の文言：行き方の見出しは「東京からの行き方／Getting there from Tokyo／从东京出发的交通方式」、`card.draft` の日本語は「下書き」（ふりがな付き）。
- `durationText`：日本語の「分」の読みを数に合わせて「ふん」「ぷん」にする（辞書は `{分|ふん}` で書き、`cardText.ts` が差し替える）。
- `applyCardState` の引数に `maximized` を足した（必須。`CardSwitch` が `cardPref` と一緒に渡す）。
- E2E の JavaScript なしのテストは、東京都（`#pref-13`）に加えて北海道（`#pref-01`）でも確かめた。
