# T5-03 出典のリンク切れチェック：実装計画

- タスクの定義：`docs/tasks/m5-content.md` の T5-03
- ブランチ：`ci/T5-03-link-check`
- 参照仕様：開発概要書 12.1、12.4、13（運用：四半期に1回）、D15、R3

## 目的

出典（`sources[].url`）のリンク切れを、相手のサーバーに負担をかけずに見つけられるようにする。手動で実行する workflow（`link-check.yml`）で、結果を Markdown のレポートにして Artifact に残す。

## 着手時に調べたこと

- 出典は `access.sources`・`specialties[].sources`・`spots[].sources` にある。スキーマで `url` は `^https://[^\s]+$`（https だけ）。
- 本物のコンテンツ（`content/prefectures/`）には、まだ出典がない（名物・名所は未作成）。フィクスチャ（`tests/fixtures/content/01-hokkaido.yaml`）に3件ある。→ 手動の実行の確かめは、本物で「0件」のレポートができることと、`CONTENT_DIR` でフィクスチャを指したときに実際の URL を確かめられることで行う。
- `loadContent(dir)`（`src/lib/content.ts`）は、検証を通った県を返す（誤りがあれば投げる）。出典を集めるのにそのまま使える。
- Node.js の `fetch`（undici）は、`redirect: 'follow'` で最終の `response.url` と `response.redirected` を返す。タイムアウトは `AbortSignal.timeout(ms)`。
- 既存の workflow（`e2e.yml`）の形：Action はコミット SHA で固定、`permissions: contents: read`、`persist-credentials: false`、入力は `env` を通してシェルに渡す。
- 外部のツール（lychee など）も並列数は絞れるが、YAML から県ごとに URL を集める部分・使われている場所を添えたレポートは自分で書くことになり、別の実行ファイルを入れて確かめる手間も増える。タスクの定義どおり `scripts/check-links.ts` で作る。

## 方針

### 1. ロジック：`scripts/lib/link-check.ts`（純粋な関数。fetch・時計・待ちは引数で受け取る）

- `collectLinks(prefectures, filter)`：出典の URL を集め、同じ URL を1つにまとめる。URL ごとに、使われている場所（`26-kyoto specialties/uji-tea` など）を残す。`status`（draft・verified・reviewed）は問わない。
- `parsePrefectureFilter(input, prefectures)`：`26,kyoto` のように、県コードか `id` をカンマ・空白で区切って受け取る。空なら全県。知らない県はエラー（打ち間違いで「0件・すべて正常」にならないように）。
- `checkLink(url, { fetch, timeoutMs })`：`GET`・`redirect: 'follow'` で1回だけ取り、本文は読まずに捨てる（`body.cancel()`）。結果を分類する：

  | 分類 | 条件 | レポートでの扱い |
  |---|---|---|
  | `ok` | 2xx、リダイレクトなし | 件数だけ |
  | `redirected` | 2xx、リダイレクトあり（最終の URL を記録） | 要確認（移転の可能性。URL を直すかを見る） |
  | `broken` | 404・410 | リンク切れ |
  | `http-error` | そのほかの 4xx・5xx（403・429・500 など） | 要確認（ボットを拒む・一時的なこともある） |
  | `timeout` | タイムアウト | 要確認 |
  | `network-error` | DNS・TLS（証明書）・接続の失敗 | 要確認（理由を添える） |

- `runChecks(links, { check, concurrency, hostIntervalMs, now, sleep })`：同時に確かめる数を `concurrency` までにし、同じホストへの送信の間隔を `hostIntervalMs` 以上あける。結果は入力と同じ順に返す。
- `formatReport(results, meta)`：Markdown。見出し・実行日時・対象の県・件数のまとめ、リンク切れ・要確認の表（分類・HTTP ステータス・URL・最終の URL・使われている場所）。問題がなければ「問題なし」。

### 2. CLI：`scripts/check-links.ts`（`pnpm content:links`）

- `node scripts/check-links.ts [--pref 26,kyoto] [--out <ファイル>]`。コンテンツは `CONTENT_DIR`（既定 `content/prefectures`）。
- レポートを標準出力（と `--out` のファイル）に出す。進み具合は標準エラーに1件ずつ出す。
- 終了コード：リンク切れ（`broken`）があれば 1。要確認だけなら 0（判断8）。引数の誤り・コンテンツの誤りは 2。
- 上限の値（判断3）：同時 4、同じホストへの間隔 2 秒、タイムアウト 20 秒。User-Agent は判断5。

### 3. workflow：`.github/workflows/link-check.yml`

- `workflow_dispatch`。入力 `prefectures`（文字列。空なら全県。例：`26,kyoto`）。
- `permissions: contents: read`。Secrets は使わない。入力は `env` で渡す（スクリプトの注入を避ける）。
- install → `pnpm content:links --pref "$PREFECTURES" --out "$RUNNER_TEMP/link-check.md"` → レポートを `$GITHUB_STEP_SUMMARY` にも書く → `actions/upload-artifact`（`if: always()`、`retention-days: 90`）。
- Action は `e2e.yml` と同じコミット SHA で固定する。`timeout-minutes: 30`。

### 4. ドキュメント

- 開発概要書 12.4（決めた上限・分類・Issue を作らないこと）と変更履歴、13（運用）の `link-check` の手順。
- `AGENTS.md` のコマンドに `pnpm content:links`、`scripts/` の説明に `check-links.ts`。
- `docs/tasks/m5-content.md` の T5-03 の「Issue を自動で作るか」に、決めたことを書く。

## 先に書くテスト

`tests/unit/scripts/link-check.test.ts`（テスト名に「12.4」を入れる。fetch・時計は置き換える）：

- 12.4 200 を `ok` に分類する
- 12.4 301 → 200（`redirected: true`）を `redirected` に分類し、最終の URL を記録する
- 12.4 404・410 を `broken`、403・500 を `http-error` に分類する
- 12.4 タイムアウト（`AbortSignal.timeout` の `TimeoutError`）を `timeout`、DNS・証明書の失敗を `network-error`（理由つき）に分類する
- 12.4 本文を読まずに捨てる（`body.cancel()` が呼ばれる）
- 12.4 同じ URL は1回だけ確かめ、使われている場所をすべて残す
- 12.4 同時に確かめる数が上限を超えない
- 12.4 同じホストへの間隔が設定より短くならない（別のホストは待たない）
- 12.4 指定した県（コード・id）の URL だけを確かめる。知らない県はエラー。空は全県
- 12.4 レポートの Markdown の形（まとめ・表・問題なし）
- 12.4 CLI：リンク切れがあれば終了コード 1、要確認だけなら 0、引数の誤りは 2。`--out` にレポートを書く

`tests/unit/scripts/check-links.test.ts` は置かず、CLI の関数（`runLinkCheck`）も `scripts/lib/` 側で fetch を受け取ってテストする（`scripts/check-links.ts` は本物の fetch をつなぐだけにする）。

## 作る・変えるファイル（順番）

1. `tests/unit/scripts/link-check.test.ts`（Red）→ `scripts/lib/link-check.ts`（Green）
2. `scripts/check-links.ts`、`package.json`（`content:links`）
3. `.github/workflows/link-check.yml`
4. ドキュメント：開発概要書 12.4・13・変更履歴、`AGENTS.md`、`docs/tasks/m5-content.md`
5. 手元で実際に動かす：本物のコンテンツ（0件）と `CONTENT_DIR=tests/fixtures/content`（3件）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| `link-check` を手動で実行し、レポートが Artifact に保存される | workflow は `main` にないと「Run workflow」できない（`workflow_dispatch` は既定のブランチに定義が要る）。PR のブランチを `gh workflow run link-check.yml --ref <ブランチ>` で実行できるのは、定義が `main` にあるときだけ。→ 判断7 |
| （共通）lint・typecheck・test・build、カバレッジ | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |

画面は変わらないので、スクリーンショットは撮らない。

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | リンク切れのときに Issue を自動で作るか | 作らない（レポートと終了コードだけ） | タスクの定義の推奨どおり。四半期に1回の手動実行なので、レポートを見て人が作れば足りる。`issues: write` の権限も要らない |
| 2 | 確かめ方（HTTP のメソッド） | `GET` で1回取り、本文は読まずに捨てる | `HEAD` に 403・404・405 を返すサーバーがあり、切れていないリンクを切れていると報告してしまう。本文を捨てれば、相手の負担は小さい |
| 3 | 上限の値 | 同時 4、同じホストへの間隔 2 秒、タイムアウト 20 秒。再試行しない | 出典は全県で数百件の見込みで、同じホスト（農林水産省・県のサイトなど）に集まる。2 秒あけても数分で終わる。失敗は県を指定してやり直せるので、再試行で処理を複雑にしない |
| 4 | リダイレクト | 自動で辿り、最終の URL を「要確認」に出す | 移転した出典は URL を直すべきかを人が見る。辿った途中の URL まで記録すると処理が増えるが、直すのに要るのは最終の URL だけ |
| 5 | User-Agent | `gotouchi-link-check/1.0`（アプリの名前だけ。連絡先・URL は入れない） | ボットだと分かるように名乗る。本番の URL はまだ公開していないので入れない（リリース後に足すかは T6 で決めてよい） |
| 6 | 対象の項目の `status` | すべて（`draft` も） | 制作中の出典も、切れていれば早く直したい |
| 7 | 完了条件（手動の実行）の確かめ方 | merge の後に `main` で実行し、Artifact を確かめて、PR にコメントで結果を書く。PR の前には、手元で CLI を実行した結果を本文に書く | `workflow_dispatch` は、定義が既定のブランチにないと実行できない。本物のコンテンツは出典が0件なので、レポートは「0件」になる |
| 8 | 終了コード | リンク切れ（404・410）だけで 1。要確認（403・5xx・タイムアウト・リダイレクトなど）だけなら 0 | 実行の一覧で、直すべきものがあるかが赤で分かる。一時的な失敗やボットの拒否で毎回赤くなると、赤の意味が薄れる |
| 9 | コマンドの名前 | `pnpm content:links`（`scripts/check-links.ts`） | `content:validate`・`content:furigana` と並べて、コンテンツの道具だと分かる。ファイル名は設計書のディレクトリ構成のとおり |
| 10 | Artifact の保存期間 | 90 日 | 四半期（約90日）ごとの実行で、前回の結果と比べられる |

## 承認後に変えたこと

（PR を出す前に書く）
