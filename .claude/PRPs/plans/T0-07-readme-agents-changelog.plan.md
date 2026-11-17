# T0-07 README・AGENTS.md・CHANGELOG の更新：実装計画

- タスクの定義：`docs/tasks/m0-setup.md` の T0-07
- ブランチ：`docs/T0-07-readme-agents-changelog`
- 参照仕様：開発概要書 6.5、10.1、11.6

この計画は、PR で実際に作った内容に合わせて直してある。承認したときから変えた点は、末尾の「承認後に変えたこと」にある。

## 目的

新しく参加する人とエージェントが、`README.md` と `AGENTS.md` だけを読んで開発を始められるようにする。

## 着手時に分かっていること

- `README.md` は、リポジトリを作ったときの2行だけ（見出しと英語の1文）。6.5 に「本文は M0 でこのアプリ向けに書き直す」とある。
- `CHANGELOG.md` は Keep a Changelog の空のひな形（`## - YYYY-MM-DD` と空の見出し）だけ。
- `AGENTS.md` の「コマンド」は、T0-06 までのタスクで足してきたので、`package.json` のスクリプトとほぼ合っている。`lint:eslint`・`lint:prettier`・`lint:md`・`lint:yaml` は `pnpm lint` の中身なので書いていない。
- T0-07 は計画では M0 の最後だが、T0-06 を後回しにしたので、M1〜M4 と T5-01〜T5-03 はすでに merge 済み。
- `docs/tasks/m0-setup.md`（T0-06 の節）に、「文書だけの PR で `check` が lint だけを実行し、重い手順を飛ばすこと」を、次の文書だけの PR（T0-07 など）で確かめる、とある。今は文書だけの PR では `preview` も飛ぶ（`docs_only`）。
- リポジトリの直下に `cc-v4-pro.sh`（Claude Code を別の API で動かす個人用のスクリプト。秘密は `~/.env` から読み、ファイルには書いていない）がある。アプリとは関係がない。

## 方針

### 1. `README.md`（日本語で書き直す）

人が最初に読むもの。詳しいことは `AGENTS.md` と設計書に任せ、同じ説明をくり返さない。

1. 概要：アプリの説明（47都道府県の名物・名所、ja・en・zh、こども／おとな、ふりがな）、本番の URL、今の状態（M0〜M4 が終わり、コンテンツは47県とも「準備中」）。
2. 必要な環境：Node.js（`.nvmrc` の 26）、corepack と pnpm（`packageManager` の版）、yamllint 1.33.0（`pnpm lint` に要る）、E2E 用の Playwright のブラウザ。Windows では WSL2 で作業する（11.6）。
3. セットアップ：clone → `nvm install` → `npm install -g corepack` → `corepack enable` → `pnpm install` → `screenshots` ブランチを取らない `git config`。
4. よく使うコマンド：`dev`・`lint`・`typecheck`・`test`・`build`・`build:preview`・`wrangler dev`・`test:e2e`・`content:validate`。全部の一覧は `AGENTS.md` へのリンクにする。
5. 開発の流れ：1タスク＝1ブランチ＝1PR → CI → オーナーの承認でプレビュー → merge で本番（手でデプロイしない）。
6. ディレクトリ：主なものだけの短い表（詳しい表は `AGENTS.md`）。
7. 文書：開発概要書・開発計画・タスクの定義・`docs/architecture/`・`content/guidelines/`・`AGENTS.md`・`CHANGELOG.md` へのリンク。

### 2. `AGENTS.md`

- 「コマンド」を `package.json` と1つずつ突き合わせる。足りないもの・名前の違うものを直す（`lint:*` は `pnpm lint` の中身として1行で触れる）。
- 古い記述を直す：「M0 の前」のような、もう当てはまらない書き方を探して直す。デプロイは CI だけで行う（手で `wrangler deploy` しない）ことを書く。
- README と重なる内容は、`AGENTS.md` を正とし、README からリンクする。

### 3. `CHANGELOG.md`

- 空のひな形を消し、`## [Unreleased]` に、これまで merge した内容を書く（判断1）。
- 見出しは Keep a Changelog の Added・Changed・Security のうち、中身があるものだけにする。PR ごとではなく、機能のまとまり（地図・カード・多言語・モードとふりがな・PWA・アクセシビリティ・コンテンツの道具・CI/CD・デプロイ）で書く。

### 4. 設計書・タスクの定義

- 6.5：`README.md` の行の「本文は M0 でこのアプリ向けに書き直す」を、書き直した、に直す。
- 11.6：README の手順と食い違うところを直す（Playwright の入れ方は `AGENTS.md` の「E2E の準備」に合わせる）。
- `docs/tasks/m0-setup.md`：T0-07 で分かったことを書き足す。T0-06 の節の「文書だけの PR で確かめる」に、この PR で確かめた結果を書く。

## 先に書くテスト

なし（タスクの定義どおり、文書だけのため）。判断2で、コマンドの一致を確かめるテストは足さない。代わりに、次の確認をスクラッチパッドのスクリプトで1回だけ行う。

- `README.md`・`AGENTS.md` に出てくる `pnpm <名前>` が、`package.json` のスクリプトか pnpm のコマンド（`install`・`exec`・`vitest` など）である。
- `package.json` のスクリプト（`lint:*` を除く）が、すべて `AGENTS.md` に出てくる。

## 作る・変えるファイル（順番）

1. `README.md`
2. `AGENTS.md`
3. `CHANGELOG.md`
4. `docs/development-overview.md`（6.5・11.6）、`docs/tasks/m0-setup.md`
5. コマンドの一致の確認、`pnpm lint`
6. 別のディレクトリに clone して、README の手順で install → test → build
7. レビュー → push → CI で `check` が lint だけを実行し、`preview` が飛ぶことを確かめる

## 完了条件の確かめ方

| 完了条件 | 確かめ方 | 結果 |
|---|---|---|
| `README.md`・`AGENTS.md` のコマンドが `package.json` のスクリプトと一致している | 上のスクラッチパッドのスクリプト | 一致（README は10種類、AGENTS.md は20種類。`lint:*` 以外のスクリプトはすべて AGENTS.md にある） |
| markdownlint が通る | `pnpm lint` | 通る |
| README の手順で install → test → build が通る（テスト条件） | スクラッチパッドに `git clone --branch docs/T0-07-readme-agents-changelog <このリポジトリ>` で clone し、README の手順のとおりに `pnpm install` → `pnpm test` → `pnpm build` | 通る（`nvm install` で Node.js v26.13.1 が入った。テスト 2049件、カバレッジ 96.7%）。この端末の nvm と pnpm のストアを使ったので、まっさらな環境ではない。`npm install -g corepack` を飛ばすと `corepack: command not found` で止まる（README の手順どおりなら通る） |
| （T0-06 から引き継いだ確認）文書だけの PR で重い手順を飛ばす | この PR の CI の `check` のログで、typecheck・test・build などが skipped、`preview`・`preview-comment` が skipped | 確かめた（PR #71、run 44032283855）。`check` は Lint だけを実行し、ほかの重い手順は skipped。`preview`・`preview-comment` も skipped。`check`・`gitleaks` は成功 |

## 判断が必要な点

| # | 項目 | 推奨 | 理由 |
|---|---|---|---|
| 1 | CHANGELOG に書く範囲 | `[Unreleased]` に、M0 だけでなく、これまで merge したすべて（M0〜M4、T5-01〜T5-03）を書く | タスクの定義は「M0 の内容」だが、T0-06 を後回しにしたので、M1〜M4 もすでに `main` と本番にある。M0 だけを書くと、すでに入っている機能が CHANGELOG から抜ける。版の番号は、公開（T6）のときに付ける |
| 2 | コマンドの一致を確かめるテスト | 足さない。PR の中で1回だけスクリプトで確かめる | タスクの定義が「自動テストはない」としている。もう1つの理由として、この PR を文書だけにしておくと、T0-04 から確かめられていない「文書だけの PR で重い手順を飛ばす」を、この PR の CI で確かめられる（`.ts` を足すと文書だけでなくなる）。テストが要るなら、後の PR で足せる |
| 3 | README の言語 | 日本語 | `AGENTS.md` の決まり（文書は日本語）。利用者向けのアプリの説明は3言語だが、README は開発する人向け |
| 4 | README と AGENTS.md の分け方 | README は入口（概要・環境・セットアップ・よく使うコマンド・流れ・リンク）。全部のコマンドと細かい注意は `AGENTS.md` だけに書き、README からリンクする | 同じ説明を2か所に書くと、片方だけが古くなる。`AGENTS.md` はエージェントが毎回読むので、そちらを正にする |
| 5 | ライセンス | README に書かない（このタスクでは決めない） | `LICENSE` はまだない。リポジトリを public にしたので、いずれ決める必要がある（コードとコンテンツで分けるかなど）。オーナーの判断なので、別に決める |
| 6 | `cc-v4-pro.sh` | このタスクでは触らず、README にも載せない | アプリとは関係がない個人用のスクリプトで、秘密は含まれていない。消すか残すかはオーナーの判断 |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| `AGENTS.md` の古い記述 | 「M0 の前」などを探して直す | 当てはまらない記述は見つからなかった。足したのは、デプロイは CI だけ（障害時の切り戻しを除く）、README との分け方、`pnpm lint` の中身（`lint:*`）、CHANGELOG を書き足すタイミング | 実物を見た結果 |
| CHANGELOG を書き足すタイミング | 決めていなかった | PR ごとには書かず、マイルストーンが終わったとき（最後のタスクの PR）と公開のときに `[Unreleased]` にまとめて書き足す。`AGENTS.md`・開発概要書 10.1・`CHANGELOG.md` の冒頭に書いた | レビューの指摘：どこにも更新の指示がなく、10.1 の「リリースごと」とも合っていなかった。PR ごとに書くと手間が大きく、リリースごとだけでは公開までずっと空になる |
| CHANGELOG の見出し | Added・Changed・Security | Added・Security（Changed は消した） | レビューの指摘：プレフィックスなしの配信や島の扱いは、出していた状態からの変化ではない |
| 11.6 | Playwright の入れ方を README に合わせる | コードブロックを消し、README の「セットアップ」と AGENTS.md の「コマンド」へのリンクにした（表は残す） | レビューの指摘：README・AGENTS.md と3か所目の重複になっていた |
| 手元からのデプロイの記述 | 触る予定はなかった | 11.2 の「ローカルからのデプロイ作業は `wrangler login` で行う」を、手元からはデプロイしない（切り戻しの `wrangler rollback` だけはオーナーが `wrangler login` で行い、Token を手元に保存しない）に直した。13章にも同じことを書いた | レビューの指摘：「デプロイは CI だけ」と食い違っていた |
| 開発概要書の「版」 | 触る予定はなかった | 0.8 → 0.19 | 更新日の履歴は 0.18 まで進んでいたのに、版の欄が 0.8 のままだった |
| README のセットアップ | clone → nvm → corepack → install → `git config` | `git update-ref -d refs/remotes/origin/screenshots` と、nvm の入れ方のリンクを足した | レビューの指摘：clone の時点で screenshots ブランチを取ってしまう。nvm がない人に入れ方を示す |
