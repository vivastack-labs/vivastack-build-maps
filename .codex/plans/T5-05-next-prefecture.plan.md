# T5-05 次の県のコンテンツ制作計画

## 承認済みの範囲

- 対象：島根県（`32-shimane`）。2026-11-18 にオーナーが本計画を承認した。
- 作業場所：`worktrees/T5-05-next-prefecture/`。
- ブランチ：`feat/T5-05-next-prefecture`。基点は `origin/develop` の `61e7f51`。
- PR の宛先：`develop`。元の worktree と鳥取県のブランチは保持する。
- 状態：承認済み。コンテンツ制作・独立検証・PR 作成へ進む。

## タスクと参照仕様

- タスク定義：`docs/tasks/m5-content.md` の T5-05。
- 前提：T5-04 と T3-09 はマージ済み。T5-05 は県ごとに続くため、全体を完了にしない。
- 参照：開発概要書 7.1〜7.3・9.2〜9.4、R2・R8・D22、`docs/architecture/card.md`。
- 執筆・確認：`content/guidelines/writing.md` と `review-checklist.md`。
- 制作：`.agents/skills/gotouchi-content/SKILL.md`。
- 鳥取県は既存ブランチと worktree があるため候補から外す。
- 中国地方の岡山・広島・山口は制作済みのため、未着手の島根県を推奨する。

## 作成・変更するファイルと順番

1. 本計画を承認後にコミットする。開発計画の T5-05 は既に作業中なので、同じ状態への変更や空コミットは作らない。
2. 対象県が島根県なら `content/prefectures/32-shimane.yaml` のみを制作対象にする。
   `id`・`code`・`name`・`region`・`capital`・県庁位置のコメントを保持する。
3. 自治体・観光協会・公的機関・交通機関の公式ページを実際に開き、
   名物3・名所3・東京からの行き方1を選んで、おとな向け日本語と出典を下書きする。
   出典を確認できない項目は確認済みにせず、未確認の理由を記録する。
4. `pnpm content:furigana` を使い、固有名詞や複合語の読みは公式表記と照合する。
5. `gotouchi-source-checker` に、対象 YAML・対象7項目・worktree の絶対パスを渡し、
   おとな向け日本語・出典・経路・所要時間の独立照合を依頼する。
   YAML の修正はメインが行い、本文ごとに照合結果を記録する。
6. 照合後に、こども向け日本語と英語・簡体字中国語の両モードを作る。
   派生版に新しい事実を足さない。
7. `gotouchi-derivative-checker` に全項目の検証を依頼し、翻訳・文体・文字数・ふりがなを直す。
   再検証の回数制限は制作スキルに従う。
8. 両方の独立検証と機械検査を通過した項目だけ `verified` にする。
   未解消・未再検証の項目は `draft` のままにする。
9. 実行結果・対象本文に対応する検証記録・残る判断を本計画へ追記し、
   `code-reviewer` に比較範囲 `origin/develop...HEAD` と未コミット差分のレビューを依頼する。
10. 差分を確認してコミット・push し、日本語本文・英語タイトルの PR を `develop` 向けに作成する。

## テスト条件と確認方法

今回はデータと計画のみを変更し、既存の検証を使う。データの写しを期待値にした新規テストは追加しない。
コード変更が必要になった場合は実装前に計画を更新し、要件IDを持つテストで Red → Green を確認する。

| 条件・要件 | 対象と確認方法 |
| --- | --- |
| T5-05：名物3・名所3・行き方1、スキーマ・出典・文字数 | `pnpm content:validate`。対象県の誤りと警告を確認し、理由のない警告を残さない |
| 7.2：日本語のふりがな | `pnpm content:furigana --check content/prefectures/32-shimane.yaml` と公式表記の照合。辞書との差は理由を記録 |
| 7.1：YAML の書式 | `pnpm lint:yaml`。対象ファイルの直接検査は `yamllint -c content/.yamllint content/prefectures/32-shimane.yaml` |
| T1-08・F-MAP-01・D32・D33：基本情報の保持 | 既存の `tests/data/content.test.ts` を `pnpm vitest run tests/data/content.test.ts` で確認 |
| 9.2・9.3：事実と出典 | `gotouchi-source-checker` が実際に開いた本文と照合。未確認は通過扱いにしない |
| 9.2・9.3：派生版 | `gotouchi-derivative-checker` が基準本文と全言語・全モードを照合 |
| 共通の品質確認 | `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm build`。終了コードとカバレッジを記録 |
| ビルドへの反映 | `pnpm build:preview` の `dist/cards/{ja,en,zh}/32.json` に対象項目があり、本番ビルドでは未承認の内容が出ないことを確認 |
| T5-05：レビュー・reviewed | PR は検証済みの制作物として提出。人のレビュー承認とオーナーによる `reviewed` 変更・merge は残作業として明記 |

Node.js は `.nvmrc` の26を使う。依存パッケージはこの worktree に `pnpm install --frozen-lockfile` で準備し、
既存 worktree のビルド成果物を共有しない。検証・ビルドは本 worktree で実行する。

データ整備中は AGENTS.md の規定に従い E2E を実行しない。
画面の部品・ルーティング・テスト用コンテンツは変更しない。
通常のスクリーンショットはフィクスチャで撮影され今回の制作物を表示しないため、
この PR では省略理由と実データのプレビュービルド確認結果を本文に記載する。
将来 `develop` から `main` への統合 PR で CI・E2E・レビューを行う。

## 判断事項と推奨案

| 項目 | 推奨案 | 理由 |
| --- | --- | --- |
| 対象県 | 島根県 | 中国地方をまとめて進め、既存の鳥取県作業と重複しない |
| 実装の範囲 | 名物3・名所3・行き方1と3言語・2モード | T5-05 と制作スキルの1県の単位に合わせる |
| 到達状態 | 両検証通過項目を `verified` として PR 作成 | `reviewed` は人のレビュー後のオーナー判断であり、制作時には変更しない |
| PR の宛先 | `develop` | データ整備中の AGENTS.md の明示規約に合わせる |
| 出典・題材・交通手段 | 公式本文を確認してから選ぶ | 未確認の事実・時間・読みを計画の段階で確定しない |
| 進捗表 | T5-05 を作業中のまま保持 | 県ごとの進捗は YAML の status で管理する規約に合わせる |
| ブランチ整理 | 既存ブランチを保持 | `develop` は統合用、鳥取県は着手済みであり、削除しない |

## 承認後に変えたこと

なし。

## 実装と独立検証の記録

- 2026-11-18 13:04 JST に制作開始。変更は本計画と `32-shimane.yaml` に限定した。
- 名物は出雲そば・しじみ汁・赤天。名所は出雲大社・松江城・石見銀山。
- 行き方は羽田空港 → 出雲空港の飛行機。JAL279便（09:50発・11:15着）から85分。
  対象期間は2026-10-25〜11-30。空港への移動・搭乗手続きは含めず、便・期間・計算をYAMLコメントにも残した。
- メインと独立した `gotouchi-source-checker` が全出典を実際に開いて照合した。
  表示題名・確認日（2026-11-18）・事実・原文の写し・季節・宣伝を確認した。
- ②初回：しじみ汁の本文にパッチ由来の記号と空白が混入した誤り1件、要確認0件。他6項目は通過。
  正しいYAMLの折り返しに直し、②の2回目で通過。事実・出典は変えていない。
- ④初回：石見銀山の英語で坑道が鉱山だったように読める誤り1件、
  出雲大社の英語で神社と神楽殿の主語が曖昧な要確認1件。他5項目は通過。
  英語おとな向けの2文を直し、④の2回目で両項目が通過。おとな向け日本語と出典は変更していない。
- ②④の通過と最終差分をメインが確認後、7項目すべてを `verified` にした。
  人のレビューとオーナーによる `reviewed` への変更・merge は残作業。

### ②で確定した基準本文と出典

| 項目 | 基準本文（ふりがなを除く） | 実際に開いた出典 | ② | ④ |
| --- | --- | --- | --- | --- |
| access | 飛行機／羽田空港 → 出雲空港／85分 | [就航路線・時刻表](https://www.izumo-airport.co.jp/flight/flight-time) | 初回通過 | 初回通過 |
| specialties/izumo-soba | 殻ごと挽いたそば粉で作るため、色が濃く香りも強めです。つゆを直接かけて食べます。 | [そば](https://www.kankou-shimane.com/gourmet/soba) | 初回通過 | 初回通過 |
| specialties/shijimi-soup | 宍道湖などの海水と淡水が混じる湖で育つヤマトシジミを使い、水から煮てだしを引き出します。 | [しじみ](https://www.kankou-shimane.com/gourmet/shijimi) | 2回目通過 | 初回通過 |
| specialties/akaten | 浜田の名物で、魚のすり身に唐辛子を加えて揚げたものです。ピリッとした辛さがあります。 | [赤天の記事](https://www.kankou-shimane.com/bihadaken-uruoi/report/souvenir/41/) | 初回通過 | 初回通過 |
| spots/izumo-oyashiro | 人との縁を結ぶ神様をまつります。神楽殿には大きなしめ縄があります。 | [出雲大社](https://www.kankou-shimane.com/destination/20240) | 初回通過 | 2回目通過 |
| spots/matsue-castle | 1611年に完成した天守が残っています。2015年に国宝に指定されました。 | [松江城天守の国宝指定](https://www.pref.shimane.lg.jp/life/bunka/bunkazai/event/kokuhou/) | 初回通過 | 初回通過 |
| spots/iwami-ginzan | 銀を採っていた鉱山で、龍源寺間歩の壁にはノミで掘った跡が残ります。 | [龍源寺間歩（石見銀山）](https://www.kankou-shimane.com/destination/20238) | 初回通過 | 2回目通過 |

### 文字数・語数

各セルは「こども／おとな」。既存の `countLength` で数え、全36文が7.3の範囲内。

| 項目 | ja（字） | en（語） | zh（字） |
| --- | --- | --- | --- |
| 出雲そば | 28／40 | 13／20 | 23／33 |
| しじみ汁 | 25／44 | 15／23 | 24／31 |
| 赤天 | 26／42 | 13／16 | 22／30 |
| 出雲大社 | 17／33 | 10／16 | 16／24 |
| 松江城 | 23／37 | 9／16 | 18／27 |
| 石見銀山 | 24／33 | 12／16 | 19／28 |

### ふりがな・固有語・絵文字の確認

- `--check` は20文・差分7件・比較不可0件。YAML誤り0件、未確認の読み0件。
- 「混じる」は「まじる」、味の「辛い・辛さ」は「からい・からさ」。辞書の「こん・つら」は文脈に合わない。
- 出雲大社「いずもおおやしろ」と龍源寺間歩「りゅうげんじまぶ」は上表の出典のカナ表記。
- 神楽殿「かぐらでん」は[公式観光記事](https://www.kankou-shimane.com/pickup/36835.html)の②節で確認。
- 宍道湖「しんじこ」は[公式観光スポット](https://www.kankou-shimane.com/destination/20270)のカナ表記で確認。
- 英語公式名は[出雲大社](https://www.kankou-shimane.com/en/destinations/9282)・
  [松江城](https://www.kankou-shimane.com/en/destinations/9289)・
  [龍源寺間歩](https://www.kankou-shimane.com/en/destinations/9280)で確認。
- ヤマトシジミの簡体字「大和蚬」は[松江市公式観光中国語](https://cn.visit-matsue.com/discover/city_centre/lake_shinji)で確認。
- 使用絵文字はすべて Emoji 1.0（2015年）。ZWJ・国旗は使わない。
  Emojipedia の[🍜](https://emojipedia.org/steaming-bowl/)・[🐚](https://emojipedia.org/spiral-shell)・
  [🐟](https://emojipedia.org/fish)・[✈️](https://emojipedia.org/airplane)を開いて確認。

### 機械検査・ビルド

- `pnpm content:validate`：47県、誤り0件・警告0件。`verified` への変更後も成功。
- `pnpm content:furigana --check content/prefectures/32-shimane.yaml`：上記7件の差分は確認済み。
- `yamllint -c content/.yamllint content/prefectures/32-shimane.yaml`：誤り・警告0件。
- `pnpm lint`：成功。既存の `.yamllint` と `.agents/skills/playwright/agents/openai.yaml` に文書開始記号がない警告が各1件。
  今回の変更外にある既存警告のため設定は変えない。
- `pnpm typecheck`：成功。`pnpm vitest run tests/data/content.test.ts`：54件成功。
- `pnpm test`：98ファイル・2,048件成功。全体の statements 96.72%・branches 93.97%・functions 96.70%・lines 96.94%。
  全体80%・ドメイン90%の設定をすべて通過。
- テスト初回はsandbox内のgit子プロセスが `EPERM` で2件失敗。必要な権限で標準コマンドを再実行して成功した。
- `pnpm build`：成功。本番の3言語の `dist/cards/{ja,en,zh}/32.json` は名物・名所が空で、行き方を含まない。
  未承認コンテンツが本番に出ないことを確認した。
- ビルド初回は内部のローカルポート利用が `EPERM` で失敗。権限を得た再実行でも失敗が残り、
  失敗時の `.next` を `/tmp` に退避後、標準コマンドを必要な権限で実行すると成功した。
  同梱のTurbopackキャッシュ資料を確認した。追跡対象の設定は変えていない。
- `pnpm build:preview`：成功。3言語とも行き方1・名物3・名所3を出力し、7項目が `draft: true`、HTMLが `noindex` であることを確認。
- E2Eはデータ整備中の規約に従い未実行。スクリーンショットは承認済みの省略方針どおりで、実データのJSONを検査した。
- ①〜④と内容の機械確認は13:04〜13:17 JST（約13分）。
- 最終の `pnpm lint`・`pnpm typecheck`・`pnpm content:validate` と、`verified` の最終差分での `pnpm test` も成功。
  テスト件数とカバレッジは上記と同じ。
- `code-reviewer` の独立した最終レビューは指摘なし（CRITICAL・HIGH・MEDIUM・LOW 各0件）。
  基本情報、status、本番の絞り込み、プレビュー3言語、検証記録と最終テスト結果の一致を確認した。
  ブラウザでの実表示・E2E・人によるコンテンツレビューは未確認。出典の再照合は専門検証役の記録を採用した。
