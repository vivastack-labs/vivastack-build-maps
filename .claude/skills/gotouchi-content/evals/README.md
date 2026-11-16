# 評価：誤りを入れた YAML

`gotouchi-source-checker`・`gotouchi-derivative-checker` が、わざと入れた誤りを指摘するかを確かめる（T5-02）。
エージェントの指示を直したときに、同じ評価をやり直せるようにしておく。LLM の出力なので、自動テストにはしない。

`seeded-errors/26-kyoto.yaml` は、京都府の試行で作った YAML に、誤りを入れた写し。**誤りを含むので、コンテンツに使わない**（`content/` に置かない）。

## やり方

1. 2つのエージェントに、この YAML のパスを渡す（`gotouchi-content` スキルの②・④と同じ依頼。項目の指定はしない）。
   - `gotouchi-source-checker`：出典の URL を実際に開いて照合する。
   - `gotouchi-derivative-checker`：`content:validate` と `pnpm content:furigana --check` を使う。`CONTENT_DIR` は `.claude/skills/gotouchi-content/evals/seeded-errors`。
2. 下の表の誤りが、**すべて**指摘されるかを確かめる。見逃したものがあれば、エージェントの指示を直して、やり直す。
3. 結果（誤りごとに、指摘されたか）は、PR に書く。この文書には書かない。

確かめるコマンド：

```bash
source ~/.nvm/nvm.sh && nvm use >/dev/null
yamllint .claude/skills/gotouchi-content/evals/seeded-errors/26-kyoto.yaml
CONTENT_DIR=.claude/skills/gotouchi-content/evals/seeded-errors pnpm content:validate
pnpm content:furigana --check .claude/skills/gotouchi-content/evals/seeded-errors/26-kyoto.yaml
```

`content:validate` は、誤り 0 件・警告 1 件（5 の文字数）になる。

## 入れた誤りと、指摘されるべきもの

| # | 入れた誤り | 場所 | 見つけるべき所 |
|---|---|---|---|
| 1 | 出典と違う数値（約3万社 → 約5万社） | `spots/fushimi-inari-taisha` の `description.ja.adult` | ②（出典と違う）・④（派生版と数字が違う） |
| 2 | 派生版で足した事実（产量居日本第一） | `specialties/uji-tea` の `description.zh.adult` | ④（足した事実） |
| 3 | ふりがなの読みの誤り（清水寺 → しみずでら） | `spots/kiyomizu-dera` の `name.ja` | ④ |
| 4 | ふりがなの読みの誤り（聖護院 → せいごいん。正しくは しょうごいん） | `specialties/senmaizuke` の `description.ja.adult` | ④（`--check` で） |
| 5 | 文字数の超過（43字。範囲は20〜35字） | `specialties/senmaizuke` の `description.ja.kids` | `content:validate` の警告・④ |

## `--check` の期待する出力

`pnpm content:furigana --check` は、8件の違いを出す（18文、比べられない0件）。エージェントは、1件ずつ、どちらが正しいかを判断する。

| 行 | 場所 | 表記 | YAML の読み／辞書の読み | 正しいのは | エージェントの扱い |
|---|---|---|---|---|---|
| 49 | `specialties/senmaizuke` の `description.ja.adult` | 聖護院 | せいごいん／しょうごいん | 辞書（しょうごいん） | **指摘する**（誤り #4） |
| 84 | `spots/kiyomizu-dera` の `name.ja` | 清水寺 | しみずでら／きよみずでら | 辞書（きよみずでら） | **指摘する**（誤り #3） |
| 48 | `specialties/senmaizuke` の `description.ja.kids` | 月 | がつ／つき | YAML（11月 → がつ） | 指摘しない（辞書が誤り） |
| 49 | `specialties/senmaizuke` の `description.ja.adult` | 月 | がつ／つき | YAML | 指摘しない（辞書が誤り） |
| 68 | `specialties/nishijin-ori` の `description.ja.adult` | 西軍 | せいぐん／にしぐん | YAML（せいぐん） | 指摘しない（辞書が誤り） |
| 88 | `spots/kiyomizu-dera` の `description.ja.adult` | 懸造 | かけづく／かかつく | YAML（懸造り → かけづくり） | 指摘しない（辞書が誤り） |
| 123 | `spots/amanohashidate` の `description.ja.adult` | 阿蘇海 | あそかい／あそうみ | YAML | 指摘しない（辞書が誤り） |
| 123 | `spots/amanohashidate` の `description.ja.adult` | 日本三景 | にほんさんけい／にっぽんさんけい | YAML | 指摘しない（辞書が誤り） |

行番号は、`seeded-errors/26-kyoto.yaml` の行。YAML を直したら、番号は変わる。

## 注意

- 上の誤り以外に、試行の YAML に元からあった問題が見つかることがある。表の誤りが見つかったかどうかだけを見る。
