# T4-04 Lighthouse CI：実装計画

- タスクの定義：`docs/tasks/m4-pwa-quality.md` の T4-04
- ブランチ：`ci/T4-04-lighthouse-ci`
- 参照仕様：開発概要書 5.1、12.2・12.3、6.6 (2)、D38。開発計画 5章「ハッシュつきで1列の配置で開いたときの最初のずれ」（T4-04 の前に直す。オーナーの判断で、このPRに含める）

## 目的

1. 表示速度の基準値（5.1）を下回る変更を、PRごとの CI（`ci.yml`）で Lighthouse を動かして止める。
2. ハッシュつき（`#pref-NN`）で1列の配置（768px 以上 1024px 未満）で開いたときのずれ（CLS 0.6〜0.9）を直し、Lighthouse でも止める。

## 着手時に調べたこと

- `@lhci/cli` 0.16.1（Lighthouse 13.6.0。Node.js 22.19 以上）。インストールスクリプトはない。
  - `staticDistDir` の内蔵サーバーは express ＋ `compression`（gzip）で配信する。`_headers`・`_redirects` は効かないが、CSP は HTML の `<meta>`（T4-01）なので影響しない。
  - `lhci collect` は、`--additive` を付けなければ前の結果を消す。設定（画面の大きさ）の違う2回の collect を、`--additive` で1つの結果にまとめられる。
  - WSL の手元では、chrome-launcher が Windows の一時ディレクトリを使おうとして Chrome に繋がらない。Chrome を `--remote-debugging-port` で起動し、`--collect.settings.port` で繋ぐと動く（CI の ubuntu では起きない見込み）。
- 上限のコンテンツ（`scripts/make-max-content.ts`）のビルドで、手元で測った値（スマホの既定の設定〔412px 幅、遅い 4G・CPU 4倍の模擬〕。3回ずつ。1回目の冷えた状態を除く）：

  | URL | Performance | LCP | TBT | CLS |
  |---|---|---|---|---|
  | `/ja/` | 0.99〜1 | 1.06秒 | 51〜138ms | 0 |
  | `/en/` | 1 | 1.06秒 | 58〜91ms | 0 |
  | `/zh/` | 0.99〜1 | 1.06秒 | 51〜113ms | 0 |

  冷えた1回目は TBT 367〜444ms・Performance 0.89〜0.91 だった（手元の負荷の影響が大きい）。
- 幅 800px・ハッシュつきでは、Lighthouse でずれが出る：`/ja/#pref-01` CLS 0.699・`/en/#pref-13` CLS 0.601（動いた要素は、さくいんの `div.min-w-0`。E2E で分かっていたものと同じ）。Performance 0.71。**LCP は 2.9秒**（LCP の要素は、JSON から描いたカードの内容の段落。読み込み → ハイドレーション → JSON の取得 → 描画の順で遅れる）。
- 最初の読み込みのサイズは、PR #60 で `pnpm size` を上限のコンテンツで CI に加えた（タスクの定義の「`pnpm size` を上限のコンテンツで CI に加えるか」は済み）。

## 方針

### 1. ハッシュつきで開いたときのずれを直す

原因：ブラウザは最初のレイアウトの後で `:target` を決めるので、`hidden` のカードが後から表示され、さくいんが押される。

直し方（開発計画 5章の推奨案）：`<head>` の初期化スクリプト（`MODE_INIT_SCRIPT`）を広げ、最初の描画の前にハッシュの県を `<html data-hash-pref="NN">` に書く。CSS は `:target` の代わりにこの属性で、最初のレイアウトからカードを表示する。

- スクリプト：`location.hash` が `#pref-01`〜`#pref-47`（`prefFromHash` と同じ規則）なら `data-hash-pref` を書き、そうでなければ消す。`hashchange` でも同じことをする（JavaScript が有効なのに読み込めなかったとき、さくいんのリンクでハッシュが変わっても追う）。localStorage の例外とは別にする（localStorage が使えなくてもハッシュは書く）。500バイト未満のまま（今 約 230 バイト → 約 400 バイトの見込み）。CSP のハッシュは定数が変わるだけで自動で入る（T4-01）。`<html>` には `suppressHydrationWarning` がある。
- CSS（`app/globals.css`）：CSS は属性の値どうしを比べられないので、県ごとの規則を47県ぶん書く（`:root[data-hash-pref='01'] #pref-01` …）。
  - カードの表示（`card-target` レイヤー、`!important`）：`[data-card-switch]:not([data-card-ready])` の中の、ハッシュの県のカード。
  - 差し込み先の予約（1列の配置の `min-height: 100svh`）：同じく、ハッシュの県のカードの `[data-card-body]`。
  - 案内文を隠す・768px 未満のパネルを全部見える状態にする規則は、県によらないので `:root[data-hash-pref]` で1つずつ。
  - JavaScript が無効のとき（スクリプトが動かない）のために、今の `:target` の規則は残す（同じカードを指すので、重なっても見た目は同じ）。
  - 47県の一覧の書き漏れは、単体テストで `globals.css` を読んで確かめる（`theme-contrast.test.ts` と同じやり方）。
- `CardDetails` のマウントでの予約（今は `[data-card-pref]:target [data-card-body]`）も、`data-hash-pref` の県で探す（CSS と同じ条件にする）。
- E2E（`tests/e2e/sheet.spec.ts`）：layout-shift の数え始めを `data-card-ready` から最初に戻す（`__shiftAfterReady` をやめ、幅 800px のテストも `totalShift` で 0.1 未満）。開発計画 5章の行を「決定」にする。

### 2. Lighthouse CI

- `@lhci/cli` 0.16.1 を devDependencies に入れ、`pnpm lhci` を足す。
  - `lighthouserc.yml`：スマホの既定の設定で `/ja/`・`/en/`・`/zh/` を3回ずつ測り、結果の確かめ（assert）と保存（upload）もこのファイルに書く。
  - `lighthouserc.tablet.yml`：幅 800px（1列の配置）で `/ja/#pref-01` を3回測る（`--additive`）。ハッシュつきのずれが戻ったら止めるため。
  - YAML にするのは、設定にコメントを書けて、`yamllint` の対象になるため。
- 基準（`assertMatrix`。3回の中央値 `median`）：
  - ハッシュなしの3つ：Performance 0.9 以上、LCP 2500ms 以下、CLS 0.1 以下、TBT 200ms 以下。
  - ハッシュつき（幅 800px）：CLS 0.1 以下だけ（LCP は後述の判断）。
- 測るビルド：CI の「Size budget」の手順で作った**上限のコンテンツの `dist/`** を、`pnpm size` の直後（本物の Build の前）に測る。ビルドを増やさない。本物のコンテンツは47県とも「準備中」で、カードの JSON を読まないため、最悪の場合を測れない。
- サーバー：`staticDistDir: dist`（lhci の内蔵サーバー）。
- 結果：`upload.target: filesystem` で `.lighthouseci/` に出し、`actions/upload-artifact`（SHA で固定、14日）で残す（失敗したときも）。`temporary-public-storage` は使わない（レポートが公開の場所に上がるため）。`.lighthouseci/` は `.gitignore` に足す。
- `deploy.yml` はまだない（T0-06）。T0-06 のタスクの定義に「`pnpm lhci` を入れる」を書き足す。
- 文書：開発概要書 5.1（TBT の基準・測る URL と設定・上限のコンテンツで測ること）、12.2・12.3（`lhci` の位置）、`AGENTS.md`（コマンド・手元の WSL での動かし方）。

## 先に書くテスト

| テスト | ファイル | テスト名（要件ID） |
|---|---|---|
| ハッシュを `data-hash-pref` に書く | `tests/unit/features/mode/initScript.test.ts` | `6.6 (2)（CLS）：ハッシュが #pref-01〜#pref-47 なら <html data-hash-pref> に県コードを書く` |
| 正しくないハッシュは書かない | 同上 | `6.6 (2)（CLS）：#pref-00・#pref-48・#pref-1・#pref-01x・ほかのハッシュでは data-hash-pref を書かない`（`prefFromHash` と同じ結果になることも確かめる） |
| hashchange で追う | 同上 | `6.6 (2)（CLS）：hashchange でハッシュが変われば data-hash-pref を書き直し、県でなくなれば消す` |
| localStorage が例外でもハッシュは書く | 同上 | `4.11.5：localStorage が例外を投げても、data-hash-pref は書く` |
| 500バイト未満 | 同上（既存） | `D23：初期化スクリプトは500バイト未満` |
| 47県の規則がそろっている | `tests/unit/styles/hash-pref-rules.test.ts` | `6.6 (2)（CLS）：globals.css のカードの表示と予約の規則に、01〜47 の県がすべて1回ずつある` |
| 最初のフレームから数えて、ずれがない | `tests/e2e/sheet.spec.ts`（変更） | `F-MAP-05・T3-09（CLS）：幅800px（1列）でハッシュつきで開いても、最初からカードの内容が入るまで、さくいんがずれない`（`totalShift` < 0.1） |
| ハイドレーションの前から表示 | `tests/e2e/sheet.spec.ts`（追加） | `F-MAP-05（CLS）：幅800px でハッシュつきで開くと、JavaScript の読み込みを止めても、<html data-hash-pref> が付き、ハッシュの県のカードが見える` |
| `CardDetails` の予約 | 既存の `tests/unit/components/CardDetails.test.tsx` に、`data-hash-pref` の県の差し込み先に予約を付けるテストを足す（`:target` のテストを置き換える） | `T3-09（CLS）：マウントの時点で、data-hash-pref の県の差し込み先に data-card-reserve を付ける` |

Lighthouse CI の設定は自動テストがない（タスクの定義）。

## 作る・変えるファイル（順番）

1. `src/features/mode/initScript.ts`（＋テスト）
2. `app/globals.css`（＋ `tests/unit/styles/hash-pref-rules.test.ts`）
3. `src/components/CardDetails.tsx`（＋テスト）
4. `tests/e2e/sheet.spec.ts`
5. `package.json`（`@lhci/cli`、`lhci` のスクリプト）、`lighthouserc.yml`、`lighthouserc.tablet.yml`、`.gitignore`
6. `.github/workflows/ci.yml`（Size budget の後に Lighthouse と Artifact）
7. 文書：`docs/development-overview.md`（5.1・12.2・12.3、決定事項 D42）、`docs/development-plan.md`（5章の行）、`docs/tasks/m4-pwa-quality.md`（T4-04）、`docs/tasks/m0-setup.md`（T0-06 に lhci）、`AGENTS.md`

## 完了条件の確かめ方

- CI で Lighthouse が実行され、基準値を下回ると失敗する：
  - PR の CI で `pnpm lhci` が動き、通ることを確かめる。
  - テスト条件：このブランチに、基準を実際の値より厳しくした一時的なコミット（例：TBT 10ms 以下・Performance 1.0）を push し、CI が失敗することを確かめてから revert する。ハッシュつきの CLS も、ずれを直す前のコミットで失敗することを、手元の `pnpm lhci` で確かめる。結果を PR に書く。
- 共通：`pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm build`、`pnpm test:e2e`（UI の CSS を変えるので全プロジェクト。`e2e.yml` も手動で実行）、レビューで CRITICAL・HIGH なし。
- 画面の変更：見た目は変わらない（ハイドレーションの前の表示のタイミングだけ）。スクリーンショットは撮らず「画面の変更なし」。

## 判断が必要な点

| 項目 | 推奨 | 理由 |
|---|---|---|
| ずれの直し方 | `MODE_INIT_SCRIPT` を広げて `<html data-hash-pref>` ＋ CSS の47県ぶんの規則（開発計画 5章の推奨案） | 新しいインラインスクリプトを足さず、CSP のハッシュは1つのまま。最初の描画の前に `<head>` で書くので、タイミングに頼らない。47県ぶんの規則は gzip 後で 1KB 未満の見込み（サイズの余裕は 31.7KB）。`:target` の規則は JavaScript が無効のときのために残す |
| INP の代わりの TBT の基準 | 200ms 以下 | Lighthouse のスマホの採点で TBT が「良好」になる境目が 200ms。上限のコンテンツで手元 51〜138ms。CI のランナーで超えるようなら、値を見て相談する |
| 中央値の取り方 | 3回測り、指標ごとの中央値（`aggregationMethod: median`） | 1回だけだと、冷えた状態・ランナーの負荷で揺れる（手元で TBT 51〜444ms）。lhci の既定の `optimistic`（いちばん良い回）は甘すぎる |
| 測るビルド | 上限のコンテンツの `dist/`（Size budget の直後） | 最悪の量を測れる。本物のコンテンツは全部「準備中」で JSON を読まない。ビルドを増やさない |
| ハッシュつき・1列の配置も測るか | 測る（`/ja/#pref-01`、幅 800px、CLS だけ） | 言語の切替で毎回使う URL で、今回直すずれを PR ごとに止められる（E2E は手動でしか動かない。D30）。1回約10秒×3回 |
| ハッシュつきの LCP（2.9秒）を基準にするか | しない。開発計画 5章に課題として足し、公開（T6-01）の前に決める | カードの内容を JSON にした（D38）ことによる遅れで、直すには JSON の先読み（初期化スクリプトで `<link rel="preload">` を足すなど）が要り、このタスクの範囲を超える。5.1 の LCP は最初の表示（ハッシュなし）に当てる |
| サーバー | lhci の `staticDistDir` | gzip で配信し、設定が少ない。`wrangler dev` はポートの管理と起動待ちが増える。CSP は `<meta>` なので差がない |
| 結果の置き場所 | filesystem ＋ Actions の Artifact（14日） | `temporary-public-storage` は、レポートが誰でも見られる場所に上がる |
| 失敗を確かめる方法 | このPRのブランチに一時的なコミット → 失敗を確かめて revert | `ci.yml` は PR でしか動かない。履歴に確かめた証拠が残る |

## 承認後に変えたこと

（実装後に書く）
