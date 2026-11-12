# T0-04 PR用のCI（チェックだけ）：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-04
- 参照仕様：12.1〜12.3、11.5、5.5
- ブランチ：`ci/T0-04-pr-ci`

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
→ pnpm typecheck → pnpm test → pnpm build → playwright install --with-deps → pnpm test:e2e（docs_only でないときだけ）
→ 失敗したら playwright-report/ を artifact に上げる
```

- `on: pull_request`（`branches: [main]`）。`paths-ignore` は使わない（判断1）。
- `permissions: contents: read`。`concurrency: ci-<PR番号>`、`cancel-in-progress: true`。`timeout-minutes: 30`。
- env：`NEXT_TELEMETRY_DISABLED=1`、`WRANGLER_SEND_METRICS=false`。
- Action はコミットSHAで固定し、横にタグをコメントで書く。

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
3. `.github/workflows/ci.yml`（`check`・`gitleaks`）
4. `.github/dependabot.yml`（npm と github-actions、週1回。判断5）
5. `.github/CODEOWNERS`（`*` は `@inspireme`、`/content/` は `@vivastack-labs/maps-reviewers`。判断6）
6. 文書：
   - `docs/development-overview.md`：12.1（`paths-ignore` をやめ、job の中で判定する方式にした結果）、12.3（例を実際の `ci.yml` に合わせる。まだないもの〔`content:validate`・`build:preview`・`lhci`・`preview` job〕は後のタスクで加えると書く）、5.5（CI の gitleaks の「（案）」を消す）。11.5 に、Free の private ではブランチ保護を設定できないことを書く。
   - `docs/tasks/m0-setup.md`：T0-05（必須にするチェックの名前は `check` と `gitleaks`。ブランチ保護・Environments にはプランの変更か public 化が要る）、T0-06（`ci.yml` に `preview` job を加えるときの前提）に書き足す。
   - `docs/development-plan.md`：プランの制約を、オーナーが決めることとしてリスク・未決事項に書く（判断7）。
   - `AGENTS.md`：「技術スタック」「現在」の記述に CI を加える。

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| このタスクのPRで `ci` が実行され、成功する | PR の Checks で `check`・`gitleaks` が成功することを見る。かかった時間を記録する |
| 文書だけを変えたPRでも merge できる設定になっている（12.1 を更新した） | `paths-ignore` を使わないので、`check` は必ず実行されて成功（または重い手順を飛ばして成功）する。判定は単体テストで確かめる。PR の中では差分に `ci.yml` が入るので「文書だけ」の経路は通らない。merge 後の最初の文書だけのPRで、重い手順が飛ばされることを確かめる（T0-05 の docs のPRなど。PRに書く） |
| テスト条件：lint の違反・テストの失敗で `ci` が失敗する | 作業用のブランチ（このブランチから作る）で **draft の PR を main 向けに作り**、lint の違反を入れたコミットを push → `check` の失敗を見る → それを戻してテストが失敗するコミットを push → 失敗を見る。確かめたら PR を閉じ、ブランチを消す。結果（実行のURL）をPRに書く |
| 共通：lint・typecheck・test・build・test:e2e が通る、レビューで CRITICAL・HIGH がない | 手元で実行する。code-reviewer エージェント。`yamllint` で `.github/` の YAML も検査される |

## 判断が必要な点

1. **文書だけのPRの扱い**：推奨は `paths-ignore` を使わず、job の中で変更されたファイルを見て、typecheck・test・build・e2e だけを飛ばす。
   理由：公式ドキュメントのとおり、`paths-ignore` で実行されなかったPRは必須のチェックが「Pending」のまま merge できない。また lint（markdownlint）は文書だけのPRこそ必要。
   判定は第三者の Action（`dorny/paths-filter` など）を使わず、`git diff` と小さなスクリプトで行う（依存を増やさない。テストできる）。
2. **CI で2回ビルドすること**：推奨は `pnpm build` の手順を残す（E2E の `webServer` でもう一度ビルドする）。
   理由：ビルドの失敗が「build」の手順として分かりやすく出る。ビルドは手元で約6秒〜数十秒で、分数への影響は小さい。
   代わりの案は `build` の手順を省き、E2E にまとめる（速いが、ビルドの失敗が E2E のサーバーの起動失敗として見える）。
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
8. **CI の時間**：E2E は CI では `workers: 1` で7プロジェクト（今は約60件）を順に回す。Playwright のブラウザのキャッシュは今は入れない（`--with-deps` のシステムのライブラリは毎回入るので、効果が小さい）。
   最初の実行の時間を見て、長ければ後で検討する（例：`workers: 2`）。
9. **確かめるための draft PR**：テスト条件の確認のため、作業用のブランチと draft のPRを作り、確かめた後に閉じて消す。外に見える操作なので、ここで承認を取る。

## 後のタスクへの申し送り（タスクの定義に書き足す）

- T0-05：必須にするチェックの名前は `check` と `gitleaks`。ブランチ保護・Environments（private）には GitHub のプランの変更か public 化が要る。
- T0-06：`preview` job は `needs: check`。文書だけのPRでは `build` を飛ばすので、プレビューも飛ばす（`docs_only` を job の出力にして使う）。
