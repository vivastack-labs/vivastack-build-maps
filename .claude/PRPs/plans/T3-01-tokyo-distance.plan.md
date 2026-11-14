# T3-01 東京からの距離：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-01
- ブランチ：`feat/T3-01-tokyo-distance`
- 参照仕様：開発概要書 F-CARD-03、7.5（ハバーサイン公式・地球の半径 6,371km・10km 単位・「約○km」・ビルド時に計算）、4.11.4（準備中の県のカードにも距離を出す）、4.11.7（カードの順：見出し → 距離・行き方）

## 目的

東京からの距離を、固定値ではなく、コンテンツの県庁の緯度経度から計算して3言語で表示する。

## 方針

- **計算は `src/lib/distance.ts`（純粋関数。DOM・React・`node:fs` を使わない）**：
  - `haversineKm(from, to)`：`{ lat, lon }` の2点の直線距離（km）。地球の半径は定数 `EARTH_RADIUS_KM = 6371`。
  - `roundTo10Km(km)`：10km 単位に四捨五入（`Math.round(km / 10) * 10`。395 → 400、394 → 390）。
  - `distancesFromTokyo(prefectures)`：県コード → 丸めた距離（km）の `ReadonlyMap`。基準は東京都（`code: "13"`）の `capital` の緯度経度。東京都がなければ例外（ビルドで止める。黙って 0 などにしない）。東京都自身は 0。
  - `distanceText(lang, km)`：辞書の文言に `formatNumber`（`Intl.NumberFormat`。1,000 以上で桁区切り）の値を入れた文（ふりがなの記法つき。`RubyText` で描く）。既存の `fillCount`（`%n` を言語の書式の数に置き換える）を使う。
  - `src/lib/` は `scripts/` から直接読まれることがあるので、相対の import に `.ts` を付ける（AGENTS.md）。
- **値はビルド時に計算する（7.5）**：`app/[lang]/page.tsx` で `loadContent()` の結果から `distancesFromTokyo()` を1回だけ求め、`CardArea` に渡す。サーバーコンポーネントで描くので、計算のコードはクライアントの JavaScript に入らない。
- **表示（判断 1）**：今の仮のカード（`CardArea` の `<p data-card-pref>`。県名だけ）を `<div data-card-pref hidden>` にし、県名の下に距離の行（`data-card-distance`）を足す。T3-03 の `PrefCard` は、この行をそのまま移す。
- **辞書（判断 2）**：`card.distance` に文言を足す。

  | 言語 | 文言 | 例 |
  |---|---|---|
  | ja | `{東京|とうきょう}から{約|やく} %n km` | 東京から約 1,550 km |
  | en | `About %n km from Tokyo` | About 1,550 km from Tokyo |
  | zh | `距东京约 %n 公里` | 距东京约 1,550 公里 |

  こども向け・おとな向けで言い方を変えない（`ModeTextValue` にしない）。

## 先に書くテスト

### 単体：`tests/unit/lib/distance.test.ts`

- `F-CARD-03: 同じ点どうしは 0km`
- `7.5: 東京都庁 → 大阪府庁が、国土地理院の距離計算の結果と1%以内で一致する`
- `7.5: 東京都庁 → 沖縄県庁が、国土地理院の距離計算の結果と1%以内で一致する`
- `7.5: 10km 単位に丸める（394 → 390、395 → 400）`
- `distancesFromTokyo: 県コードごとに丸めた距離を返し、東京都は 0`
- `distancesFromTokyo: 東京都がなければ例外`
- `F-CARD-03: 3言語の表示（ja・en・zh）`
- `F-CARD-03: 1,000km 以上では桁区切りが入る（3言語）`

緯度経度はコンテンツ（`content/prefectures/`）の値をテストに書く（ファイルを読まない。コンテンツを直したらテストの値も直す）。参照値は判断 3。

### データ：`tests/data/content.test.ts`（既存。47県の基本情報の検査）

- `7.5: 47県すべての距離が計算でき、東京都が 0、ほかは 0 より大きい`（本物の `content/prefectures/` を読む。県庁の位置の書き間違いで値が 0 や NaN にならないこと）

### コンポーネント：`tests/unit/components/CardArea.test.tsx`（既存）

- `F-CARD-03: 各県のカードに東京からの距離を出す（ja・en・zh）`
- 既存のテスト（県名・`hidden`・案内文）は、`<p>` → `<div>` の変更に合わせて直す。

## 作る・変えるファイル（順番）

1. `tests/unit/lib/distance.test.ts`（Red）
2. `src/i18n/ja.ts`・`en.ts`・`zh.ts`：`card.distance`
3. `src/lib/distance.ts`（Green）
4. `tests/data/` のテスト
5. `tests/unit/components/CardArea.test.tsx`（Red）→ `src/components/CardArea.tsx`（`distances` を props で受ける）→ `app/[lang]/page.tsx`
6. スクリーンショット：既存の `ja-pinned`（県を固定したカード）で距離の行が見える。`en-pinned`・`zh-pinned` を `tests/screenshots/pages.spec.ts` に足す（3言語の文言を画像で確かめられる）
7. ドキュメント：AGENTS.md のアーキテクチャに `distance.ts` を1行、`docs/tasks/m3-card-i18n-mode.md` の T3-03 に「距離の行（`data-card-distance`）を `PrefCard` に移す」を書き足す

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| `src/lib/distance.ts` のカバレッジが 90% 以上 | `pnpm test` のカバレッジの表で確かめる（`src/lib/` は `vitest.config.ts` で 90% を強制） |
| 共通（lint・typecheck・test・build、レビュー） | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`、`pnpm test:e2e`、code-reviewer（Opus） |
| 値がビルド時に計算されている | `pnpm build` の `dist/ja/index.html` に「約 1,550 km」（沖縄県）などが入っていること、クライアントの JS に `6371` が入っていないことを grep で確かめる |

## 判断が必要な点

1. **今の仮のカードに距離を出すか**：推奨は「出す」。理由：「ビルド時に計算して埋め込む」（7.5）を実際の HTML で確かめられ、T3-03 は行を移すだけになる。出さずに関数だけにすると、T3-03 まで画面のどこにも使われない。変更は県名の下に1行で、T3-03 の置き換えの手間はほとんど増えない。
2. **文言**：推奨は上の表（ja「東京から約 820 km」、en「About 820 km from Tokyo」、zh「距东京约 820 公里」）。理由：カードの中で「東京からの」を別の見出しにしなくても1行で意味が通る。zh は「km」より「公里」が自然な書き方。単位を3言語とも `km` にそろえる案もある。
3. **テストの参照値（国土地理院の距離計算の結果）**：国土地理院の「距離と方位角の計算」は GRS80 楕円体の上の測地線長（Vincenty 法）を出す。同じ方法で手元で計算した値をテストに書く（東京都庁 → 大阪府庁 395.910km、→ 沖縄県庁 1553.636km。ハバーサインはそれぞれ 395.17km・1554.04km で、差は 0.2%・0.03%）。推奨は「この値を使い、PR でオーナーに国土地理院のサイトで2つだけ確かめてもらう」。理由：サイトは画面で入力する計算で、テストから呼べない。方法が同じなので、値は mm の単位まで一致するはず。
4. **東京都がないときの扱い**：推奨は「例外（ビルドが止まる）」。理由：コンテンツの検証（T1-08 の47県のデータの検査）で東京都は必ずあるので、なければ設定の誤り（`CONTENT_DIR` の間違いなど）で、黙って距離を出さないより気づきやすい。
5. **E2E を足すか**：推奨は「足さない」。理由：距離はサーバーで出す静的な文で、表示の切り替えは T2-05 の E2E が確かめている。値はコンポーネントテストとビルドの出力の grep で確かめる。カードの E2E は T3-03 で書く。
