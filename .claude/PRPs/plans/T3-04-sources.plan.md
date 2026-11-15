# T3-04 出典の表示：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-04
- ブランチ：`feat/T3-04-sources`
- 参照仕様：開発概要書 F-SRC-01〜04、8.3、4.11.7、6.6 (2)・D24

## 目的

カードの最後に折りたたみ式の「出典」欄を置き、名物・名所・行き方の項目ごとに出典（タイトル・URL・確認日）をたどれるようにする。
フッターに、地図データの出典（8.3）と「AIで作成し、人が確認しています」を3言語で出す。

## 方針

### カードの出典欄：`PrefCard` の中、最大化ボタンの後（判断 1）

```html
<article id="pref-NN" data-card-pref="NN" hidden>
  …（見出し・距離・行き方・名物・名所）…
  <button data-card-maximize="NN" hidden>…</button>
  <details data-card-sources>                        <!-- 閉じた状態で出す（F-SRC-01） -->
    <summary>出典</summary>
    <ul>
      <li data-source-item="access">                 <!-- 行き方・名物・名所の順。名物・名所は "specialties/potato" の形 -->
        <p>東京からの行き方</p>                       <!-- 行き方は見出しの文言、名物・名所は項目の名前 -->
        <ul>
          <li data-source>
            <a href="https://…" target="_blank" rel="noopener noreferrer">タイトル</a>
            <span data-source-url>https://…</span>     <!-- URL を文字でも見せる（F-SRC-02） -->
            <span data-source-accessed>確認日：2026年11月15日</span>
          </li>
        </ul>
        <!-- sources: [] のとき -->
        <p data-source-none>出典なし</p>             <!-- F-SRC-03 -->
      </li>
    </ul>
  </details>
</article>
```

- 出典欄を出すのは、項目（行き方・名物・名所）が1つ以上あるときだけ。「準備中」の県（`pending`）と、プレビューで項目がない県には出さない。
- 新しいサーバーコンポーネント `src/components/SourceList.tsx`（`PrefCard.tsx` が 200 行を超えないように分ける）。フックなし。文字はすべて `RubyText`（タイトルもふりがなの記法を通す）。
- 外部へのリンクは `target="_blank" rel="noopener noreferrer"`（判断 4）。
- 確認日：`src/i18n/format.ts` に `formatDate(lang, isoDate)` を足す。`Intl.DateTimeFormat(htmlLang(lang), { dateStyle: 'long', timeZone: 'UTC' })` を言語ごとに1つ作って使い回し、`YYYY-MM-DD` を `Date.UTC` で日付にする（端末のタイムゾーンで日がずれない）。形が合わない・存在しない日（`2026-02-30`）は例外（ビルドを止める）。ja・zh「2026年11月15日」、en「November 15, 2026」。
- 「下書き」の印は出典欄には付けない（項目の見出しの横にすでにある）。
- `CardArea` のコメント（「出典を入れる T3-04 で並びを決める」）を、決めた並びに直す。

### フッター：`Footer({ lang })`

`app/[lang]/layout.tsx` から `lang` を渡す。

```html
<footer>
  <p data-footer-map-source>出典：「国土数値情報（行政区域データ）」（国土交通省）（<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html" rel="noopener noreferrer">https://nlftp…</a>）を加工して作成</p>
  <p data-footer-ai>AIで作成し、人が確認しています</p>
</footer>
```

- URL は定数 `N03_SOURCE_URL`（`Footer.tsx` の中）。辞書には URL の前後の文（`footer.mapSource.before`・`after`）と `footer.ai` を書く。
- 3言語の文言（判断 3）：

| キー | ja | en | zh |
|---|---|---|---|
| `mapSource` | `{出典\|しゅってん}：「{国土数値情報\|こくどすうちじょうほう}（{行政区域\|ぎょうせいくいき}データ）」（{国土交通省\|こくどこうつうしょう}）（URL）を{加工\|かこう}して{作成\|さくせい}` | `Source: Created by processing "National Land Numerical Information (Administrative Area Data)" (Ministry of Land, Infrastructure, Transport and Tourism) (URL)` | `出处：根据「国土数值信息（行政区域数据）」（日本国土交通省）（URL）加工制作` |
| `ai` | `AIで{作成\|さくせい}し、{人\|ひと}が{確認\|かくにん}しています` | `Created with AI and checked by people` | `由 AI 制作，并经人工确认` |

- カードの出典欄の文言：`card.sources`（ja「{出典\|しゅってん}」、en「Sources」、zh「出处」）、`card.noSource`（ja「{出典\|しゅってん}なし」、en「No source」、zh「无出处」）、`card.accessed`（ja「{確認日\|かくにんび}」、en「Accessed」、zh「确认日期」。区切りは `PrefCard` の `LABEL_SEPARATOR`）。

### フィクスチャ：`tests/fixtures/content/01-hokkaido.yaml`

今は全項目が `sources: []`。出典のある項目とない項目の両方を E2E・スクリーンショットで確かめるため、北海道の行き方と名物1つ（じゃがいも）に出典を足す（行き方は2件、じゃがいもは1件。残りは `sources: []` のまま）。URL は `https://example.com/…`（判断 5）。

## 先に書くテスト

| ファイル | テスト名（要件ID） | 確かめること |
|---|---|---|
| `tests/unit/i18n/format.test.ts` | `formatDate：確認日を言語の書式にする（F-SRC-02）` | ja・zh「2026年11月15日」、en「November 15, 2026」 |
| 同 | `formatDate：タイムゾーンで日がずれない（F-SRC-02）` | `2026-01-01` が `TZ` に関係なく1月1日（`process.env.TZ` を変えずに、UTC で作ることを結果で確かめる） |
| 同 | `formatDate：形が合わない・存在しない日は例外にする` | `2026-1-1`・`2026-02-30`・空文字 |
| `tests/unit/components/SourceList.test.tsx` | `出典のある項目は、タイトル・URL・確認日を表示する（F-SRC-02）` | リンクの `href`・名前、URL の文字、「確認日：…」 |
| 同 | `sources: [] の項目は「出典なし」と表示する（F-SRC-03）` | `data-source-none` |
| 同 | `「出典」欄は、最初は閉じている（F-SRC-01）` | `<details>` に `open` がない |
| 同 | `外部へのリンクに rel="noopener noreferrer" を付ける` | 全リンク |
| 同 | `行き方・名物・名所の順に、項目の名前で並べる（F-SRC-02）` | `data-source-item` の順と見出しの文 |
| 同 | `英語のページは英語の文言と書式で出す（F-SRC-02）` | `Sources`・`No source`・`Accessed: November 15, 2026` |
| `tests/unit/components/PrefCard.test.tsx`（追加） | `出典欄は最大化ボタンの後に置く（4.11.7）` | DOM の順 |
| 同 | `準備中の県には出典欄を出さない（4.11.4）` | `data-card-sources` がない |
| `tests/unit/components/Footer.test.tsx` | `地図データの出典と AI の明記を出す（F-SRC-04）` | 3言語で文とリンク（`href`・`rel`） |
| `tests/e2e/footer.spec.ts` | `F-SRC-04：フッターに国土数値情報の出典と AI の明記がある（ja・en・zh）` | 3言語のページ（タスクのテスト条件） |
| `tests/e2e/card.spec.ts`（追加） | `F-SRC-01〜03：北海道のカードの出典欄は閉じていて、開くと出典と「出典なし」が見える` | フィクスチャ。`summary` を押して開く |
| 同 | `F-SRC-01：JavaScript なしでも、ハッシュの県のカードに出典欄がある` | 既存の JavaScript なしのテストに足す |

## 作る・変えるファイルと順番

1. `src/i18n/format.ts`・`tests/unit/i18n/format.test.ts`：`formatDate`
2. `src/i18n/ja.ts`・`en.ts`・`zh.ts`：`card.sources`・`card.noSource`・`card.accessed`・`footer`
3. `src/components/SourceList.tsx`・`tests/unit/components/SourceList.test.tsx`
4. `src/components/PrefCard.tsx`（出典欄を置く）・`tests/unit/components/PrefCard.test.tsx`・`src/components/CardArea.tsx`（コメント）
5. `src/components/Footer.tsx`・`tests/unit/components/Footer.test.tsx`・`app/[lang]/layout.tsx`（`lang` を渡す）
6. `tests/fixtures/content/01-hokkaido.yaml`（出典を足す）→ `pnpm content:validate`（`CONTENT_DIR=tests/fixtures/content`）
7. `tests/e2e/footer.spec.ts`・`tests/e2e/card.spec.ts`
8. `tests/screenshots/pages.spec.ts`：`ja-card-sources`（北海道を固定して出典欄を開いた状態。カードの領域）。フッターは各言語の top の全体の画像に入る
9. ドキュメント：開発概要書 4.11.7 の Card の並び（判断 1）、タスクの定義（T3-04 の結果、T4-05 にフッターの残り＝判断 2）、`AGENTS.md` のアーキテクチャに「出典」の項

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 出典のある項目・ない項目の両方が、正しく表示される | 単体テスト（`SourceList`）と E2E（フィクスチャの北海道：じゃがいもは出典あり、牛乳は「出典なし」）、スクリーンショット `ja-card-sources` |
| 共通：lint・typecheck・test・build・E2E | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、`pnpm test:e2e` |

## 判断が必要な点

1. **出典欄の位置（4.11.7 の並び）**：推奨は「`PrefCard` の中、最大化ボタンの後に置き、市区町村の一覧はその下（カードの外）のまま」。並びは「最大化ボタン → 出典 → 市区町村の一覧（最大化中だけ）」になるので、4.11.7 を直す。
   - 理由：JavaScript がないときも `:target` で開いたカードに出典が入る（6.6・5.x の「さくいんから県のカードを開ける」）。出典と一覧はどちらも閉じた `<details>` なので、入れ替わるのは2行の見出しの順だけ。
   - ほかの案：(b) 出典だけを47個の別の要素にして一覧の後に置き、`CardSwitch` で切り替える → 4.11.7 のままにできるが、JavaScript がないときに出典が見えない（見せるには、県ごとの `:has(#pref-NN:target)` の規則を47個、`@layer card-target` に書く必要がある）。(c) 一覧を `createPortal` で表示中のカードの中に差し込む → 4.11.7 のままで JavaScript なしも保てるが、サーバーで出した要素の中にクライアントが要素を足す仕組みが増え、`MuniList` のテストも作り直しになる。
2. **フッターに載せる出典の範囲**：推奨は「地図データ（国土数値情報）の出典と AI の明記だけ。読みがな（総務省）・県庁の位置（地理院地図）の出典は、T4-05 の『このサイトについて』に載せる」。理由：F-SRC-04 とタスクの定義がフッターに求めるのは地図データの出典で、8.3 の2つ目の段落は「同じページ（このサイトについて）」と読める。T4-05 の定義に書き足す。
3. **en・zh の文言**：上の表のとおり。推奨は表の案（理由：8.3 の日本語の文の要素〔データ名・作成者・URL・加工したこと〕をそのまま訳し、加工したことを明記する）。直したいところがあれば指示してください。
4. **リンクを新しいタブで開くか**：推奨は「カードの出典は `target="_blank"`、フッターの国土数値情報は同じタブ」。理由：カードの出典を同じタブで開くと、選んだ県・最大化の状態が失われる（T3-07 まで URL に状態がない）。フッターは状態と関係なく読み終えた後に押すもの。どちらも `rel="noopener noreferrer"`。
5. **フィクスチャの出典の URL**：推奨は `https://example.com/…`。理由：「出典は実際に開いて確かめた URL だけ」（9.3）の決まりがあり、確かめていない実在のサイトの URL をテストのデータでも出典として書かない。スキーマ（`https://` で始まる）は満たす。
6. **出典のタイトルの `lang`**：推奨は「付けない」。理由：タイトルはスキーマでは言語を持たない1つの文字列で、日本語とは限らない（英語のページの出典が英語のこともある）。中国語のページで日本語のタイトルが中国語の字形になることは許す。

## 承認後に変えたこと

- `LABEL_SEPARATOR`：`PrefCard.tsx` の中 → `src/i18n/cardText.ts` に移して export（`SourceList` の「確認日：…」でも使うため）。
- 出典欄の項目の見出しに `data-source-item-name` を付けた（テスト・E2E が項目の名前を引くため）。
- フィクスチャの北海道に出典を足したので、警告の件数を数える既存の単体テスト（`tests/unit/lib/content.test.ts`・`tests/unit/scripts/validate-content.test.ts`）の数を直した（警告 14 → 12 など）。
- ほかに計画から変えたことはない。
