# T0-04 PR用のCI（チェックだけ）：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-04
- 参照仕様：12.1〜12.3、11.5、5.5
- ブランチ：`ci/T0-04-pr-ci`
- この計画は実際の内容に合わせてある。承認したときの内容は、このファイルの最初のコミットと、末尾の「承認後に変えたこと」にある。

## 着手前に確かめたこと

- リポジトリは **private**、Organization（`vivastack-labs`）のプランは **Free**。
  `GET /repos/.../branches/main/protection` と `/rulesets` は「Upgrade to GitHub Pro or make this repository public」（403）を返す。
  つまり今のプランでは、ブランチ保護（必須のチェック・CODEOWNERS の承認の必須化）を設定できない。
  また、private リポジトリの Environments・Environment の Secrets も有料プランが要る（GitHub の公式ドキュメント）。T0-05・T0-06 に影響する。
- GitHub Actions の分数も、private の Free では月2,000分まで。CI の1回の時間を抑える意味がある。
- gitleaks（既存の `.gitleaks.toml`）で全履歴を検査した：検出なし。
- GitHub の公式ドキュメントのとおり、`paths-ignore` で workflow が実行されなかった PR では、その workflow のチェックは「Pending」のままになり、必須にしていると merge できない。

## 方針

### `ci.yml` の `check` job

```text
checkout（fetch-depth: 0）→ pnpm/action-setup → setup-node（.nvmrc、cache: pnpm）→ yamllint を入れる
→ pnpm install --frozen-lockfile → 変更されたファイルを見る（docs_only）
→ pnpm lint（いつも）
→ pnpm typecheck → pnpm test → pnpm build（docs_only でないときだけ）
```

E2E は、承認の後にオーナーが決めたとおり、開発中は PR ごとに実行しない（D30。判断10）。

- `on: pull_request`（`branches: [main]`）。`paths-ignore` は使わない（判断1）。
- `permissions: contents: read`。`concurrency: ci-<PR番号>`、`cancel-in-progress: true`。`timeout-minutes: 30`。
- env：`NEXT_TELEMETRY_DISABLED=1`、`WRANGLER_SEND_METRICS=false`。
- Action はコミットSHAで固定し、横にタグをコメントで書く。

### `e2e.yml`（手動。D30）

- `on: workflow_dispatch`。入力 `project`（`all` か、`playwright.config.ts` の7プロジェクトの1つ）。
- 選んだプロジェクトが使うブラウザだけを `playwright install --with-deps` で入れ、`pnpm test:e2e [--project=...]` を実行する。失敗したら `playwright-report/` を artifact（14日）に上げる。
- `permissions: contents: read`、`concurrency: e2e-<ref>`、`timeout-minutes: 30`。

### `gitleaks` job（`check` と並行）

- gitleaks の公式バイナリ（v8.30.1）をダウンロードし、**SHA-256 を確かめてから**実行する（判断3）。
- `gitleaks git --redact` で全履歴を検査する（`.gitleaks.toml`・`.gitleaksignore` を使う）。

### 文書だけのPRの判定（`scripts/docs-only.ts`）

- `isDocsOnly(files)`：すべてのファイルが「アプリの動作に関係しない」なら true。対象は 12.1 の案のとおり `docs/`・`.claude/`・`.codex/`・`.agents/` の下と、`*.md`。
  ファイルが0件なら false（安全側：全部を実行する）。
- CLI：`git diff --name-only <base> <head>` の出力を標準入力で受け、`docs_only=true|false` を出力する（workflow で `$GITHUB_OUTPUT` に書く）。
- 文書だけのPRでも lint（markdownlint・yamllint）は実行する。12.1 の案の `paths-ignore` だと、`.md` の lint まで実行されなかった。

## 先に書くテスト

テスト条件は「自動テストはない（CIの設定そのもの）」だが、判定の関数は純粋なのでテストを先に書く。

| 確かめること | ファイル | テスト名 |
|---|---|---|
| 文書だけのとき true | `tests/unit/scripts/docs-only.test.ts` | `12.1：{ファイル} だけの変更は文書だけとみなす`（`docs/a.md`・`.claude/hooks/x.js`・`.codex/x`・`.agents/x`・`README.md`・`app/x/README.md` を表で回す） |
| アプリに関係するファイルが1つでもあれば false | 同上 | `12.1：{ファイル} を含む変更は文書だけとみなさない`（`app/page.tsx`・`package.json`・`.github/workflows/ci.yml`・`public/_headers`・`docs.ts`・`.claudeignore` など） |
| 0件のとき false | 同上 | `12.1：変更されたファイルがないときは文書だけとみなさない（全部を実行する）` |
| 標準入力の形（空行・CRLF・前後の空白）を扱う | 同上 | `12.1：git diff --name-only の出力を行に分ける` |

Red：関数を作る前に実行し、読み込みで失敗することを見る。

CI そのものはタスクの定義の確認の方法で確かめる（下の「完了条件」）。

## 作る・変えるファイル（順番）

1. `tests/unit/scripts/docs-only.test.ts`（Red）
2. `scripts/docs-only.ts`（Green。`import.meta.main` のときだけ標準入力を読む。postbuild と同じ形）
3. `.github/workflows/ci.yml`（`check`・`gitleaks`）、`.github/workflows/e2e.yml`（手動の E2E）
4. `.github/dependabot.yml`（npm と github-actions、週1回。判断5）
5. `.github/CODEOWNERS`（`*` は `@inspireme`、`/content/` は `@vivastack-labs/maps-reviewers`。判断6）
6. 文書：
   - `docs/development-overview.md`：
     - 5.5：CI の gitleaks の「（案）」を消す。
     - 10.2：E2E は開発中は手動（D30）。
     - 11.1・11.5：private・Free ではブランチ保護と Environments を使えないこと（U14）、必須にするチェックの名前、Dependabot の設定。
     - 12.1：`e2e.yml` の行、E2E を手動にしたこと（D30）、`paths-ignore` をやめて job の中で判定する方式にしたこと。
     - 12.2：PR のパイプラインから e2e を外し、注を加える。
     - 12.3：例を実際の `ci.yml` に合わせる。まだないもの（`content:validate` は T1-07、`build:preview`・`preview` job は T0-06、`lhci` は T4-04）は「（後で）」と書く。
     - 第16章：U14（GitHub のプランの制約）・U15（リリース後の E2E）。決定事項：D30。
   - `docs/development-plan.md` 第5章：U14（T0-05 で決める）・U15（T6-02 の前に相談）。
   - `docs/tasks/m0-setup.md`：T0-04（E2E を `e2e.yml` に移したこと）、T0-05（必須にするチェックの名前、プランの制約）、T0-06（`deploy.yml` で E2E を実行するか、`preview` job と `docs_only`）。
   - `docs/tasks/m5-content.md`：テスト条件の「CI（E2E）が通る」を、手動の E2E に合わせる。
   - `AGENTS.md`：「現在」「技術スタック」「コマンド」（`gh workflow run e2e.yml`）。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| このタスクのPRで `ci` が実行され、成功する | PR の Checks で `check`・`gitleaks` が成功することを見る。かかった時間を記録する |
| （加えた）`e2e.yml` が動く | `workflow_dispatch` の workflow は既定のブランチにないと実行できないので、merge の前は動かせない。代わりに、E2E を含んでいた最初の版の `ci.yml` で同じ手順が CI で通ったことを見た。merge 後に `gh workflow run e2e.yml --ref main -f project=all` で確かめる |
| 文書だけを変えたPRでも merge できる設定になっている（12.1 を更新した） | `paths-ignore` を使わないので、`check` は必ず実行されて成功（または重い手順を飛ばして成功）する。判定は単体テストで確かめる。PR の中では差分に `ci.yml` が入るので「文書だけ」の経路は通らない。merge 後の最初の文書だけのPRで、重い手順が飛ばされることを確かめる（T0-05 の docs のPRなど。PRに書く） |
| テスト条件：lint の違反・テストの失敗で `ci` が失敗する | 作業用のブランチ（このブランチから作る）で **draft の PR を main 向けに作り**、lint の違反を入れたコミットを push → `check` の失敗を見る → それを戻してテストが失敗するコミットを push → 失敗を見る。確かめたら PR を閉じ、ブランチを消す。結果（実行のURL）をPRに書く |
| 共通：lint・typecheck・test・build・test:e2e が通る、レビューで CRITICAL・HIGH がない | 手元で実行する。code-reviewer エージェント。`yamllint` で `.github/` の YAML も検査される |

## 判断が必要な点

1. **文書だけのPRの扱い**：推奨は `paths-ignore` を使わず、job の中で変更されたファイルを見て、typecheck・test・build・e2e だけを飛ばす。
   理由：公式ドキュメントのとおり、`paths-ignore` で実行されなかったPRは必須のチェックが「Pending」のまま merge できない。また lint（markdownlint）は文書だけのPRこそ必要。
   判定は第三者の Action（`dorny/paths-filter` など）を使わず、`git diff` と小さなスクリプトで行う（依存を増やさない。テストできる）。
2. **CI で2回ビルドすること**：E2E を `ci.yml` から外した（判断10）ので、`ci.yml` のビルドは1回になった。`e2e.yml` は `webServer` の中でビルドする1回だけ。
3. **gitleaks の実行方法**：推奨は公式バイナリを SHA-256 を確かめてから実行する。
   理由：`gitleaks/gitleaks-action` は Organization のリポジトリでは有料ではないがライセンスキー（`GITLEAKS_LICENSE`）の登録が要る。バイナリならキーも第三者の Action も要らない。
   検査の範囲は全履歴（`fetch-depth: 0`）。リポジトリが小さく、PR の範囲だけを見る設定より単純なため。
4. **yamllint の入れ方**：推奨は `pipx install yamllint==1.33.0`（手元と同じ版）。理由：版を固定し、手元と同じ結果にする。apt は `apt-get update` に時間がかかる。
5. **Dependabot の設定**：推奨は、npm と github-actions を週1回、`cooldown: 7日`（公開から7日たっていない版は提案しない）、npm の minor・patch を1つのPRにまとめる（`groups`）。
   理由：公開直後の版を避ける方針（T0-01 から）と合わせる。オーナーが1人でレビューするので、PRの数を減らす。major は個別のPRにして、変更点を読めるようにする。
   代わりの案は、設計書のとおり週1回だけ（PRが依存ごとに出る）。
   注：pnpm 12 の lockfile に Dependabot が対応しているかは、merge 後に最初の実行で確かめる（失敗したら Dependabot のログに出る）。
6. **CODEOWNERS のオーナー**：`* @inspireme`（`gh api user` の login）で合っていますか。`@vivastack-labs/maps-reviewers` はまだない（T0-05 で作る）が、先に書いておく（存在しない Team は GitHub が無視し、警告を出すだけ）。
7. **プランの制約（Free の private リポジトリ）**：このタスクでは決めない。推奨は、制約を開発概要書 11.5 と T0-05 の定義に書き、開発計画のリスク・未決事項に「GitHub Team への変更 / public 化 / ブランチ保護なしで運用」の選択肢を挙げてオーナーの判断を待つ。
   理由：CI そのものはプランによらず動く。決めるのは T0-05（ブランチ保護・Environments を設定するタスク）。
8. **CI の時間**：最初の実行（E2E を含んでいた版）で、`check` は2分28秒（うち Playwright のブラウザのインストール60秒、E2E 35秒）、`gitleaks` は10秒だった。
   E2E を外した今の `check` は約1分。Playwright のブラウザのキャッシュは入れない（`--with-deps` のシステムのライブラリは毎回入るので、効果が小さい）。
9. **確かめるための draft PR**：テスト条件の確認のため、作業用のブランチと draft のPRを作り、確かめた後に閉じて消す。外に見える操作なので、ここで承認を取る。
10. **（承認の後にオーナーが決めた）E2E は開発中は PR ごとに実行しない**：`.github/workflows/e2e.yml` を手動で実行する（D30）。理由：private・Free の Actions は月2,000分までで、E2E は7プロジェクトを順に回し、テストが増えると長くなるため。本番リリース後の扱いは U15 として別に相談する。

## 後のタスクへの申し送り（タスクの定義に書き足す）

- T0-05：必須にするチェックの名前は `check` と `gitleaks`。ブランチ保護・Environments（private）には GitHub のプランの変更か public 化が要る。
- T0-06：`preview` job は `needs: check`。文書だけのPRでは `build` を飛ばすので、プレビューも飛ばす（`docs_only` を job の出力にして使う）。

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| E2E の実行 | `ci.yml` の `check` で PR ごとに実行する | 開発中は `ci.yml` から外し、`e2e.yml`（`workflow_dispatch`）で手動で実行する（D30）。リリース後は U15 | オーナーの判断（Actions の分数を抑えるため） |
| CI で2回ビルドすること | `build` の手順を残し、E2E の起動でもう一度ビルドする | `ci.yml` のビルドは1回 | E2E を外したため |
