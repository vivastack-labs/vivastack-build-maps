import { describe, expect, test } from 'vitest';
import { checkRuby } from '@/lib/ruby';
import { createLinderaTokenizer, runFurigana } from '../../../scripts/furigana';
import { alignReading, annotate, formatReview, type FuriganaToken, type Tokenize } from '../../../scripts/lib/furigana';

/** 偽のトークナイザー：渡したトークンの並びをそのまま返す（辞書を使わない） */
const fake =
  (...tokens: readonly FuriganaToken[]): Tokenize =>
  () =>
    tokens;

describe('alignReading', () => {
  test('7.2 送り仮名を括弧の外に出す：見える → {見|み}える', () => {
    expect(alignReading('見える', 'ミエル')).toBe('{見|み}える');
  });

  test('7.2 送り仮名を括弧の外に出す：町並み → {町並|まちな}み', () => {
    expect(alignReading('町並み', 'マチナミ')).toBe('{町並|まちな}み');
  });

  test('7.2 送り仮名を括弧の外に出す：焼き魚 → {焼|や}き{魚|ざかな}', () => {
    expect(alignReading('焼き魚', 'ヤキザカナ')).toBe('{焼|や}き{魚|ざかな}');
  });

  test('7.2 読みのカタカナをひらがなにする。長音「ー」は残す', () => {
    expect(alignReading('東京タワー', 'トウキョウタワー')).toBe('{東京|とうきょう}タワー');
    expect(alignReading('場', 'バー')).toBe('{場|ばー}');
  });

  test('7.2 読みと表記を合わせられないときは、語全体を1つのルビにする（八ヶ岳）', () => {
    expect(alignReading('八ヶ岳', 'ヤツガダケ')).toBe('{八ヶ岳|やつがだけ}');
  });

  test('7.2 漢字のない語は、そのまま返す', () => {
    expect(alignReading('ラーメン', 'ラーメン')).toBe('ラーメン');
    expect(alignReading('ひらがな', 'ヒラガナ')).toBe('ひらがな');
  });

  test('7.2 読みの字が ひらがな・長音の外にあるときは、ルビを作れないので undefined', () => {
    expect(alignReading('京都', 'キョウト?')).toBeUndefined();
    expect(alignReading('京都', '')).toBeUndefined();
  });
});

describe('annotate', () => {
  test('7.2 漢字のない語（ひらがな・カタカナ・数字・記号）にはふりがなを付けない', () => {
    // Arrange
    const tokenize = fake({ surface: 'ラーメン', reading: 'ラーメン' }, { surface: 'を' }, { surface: '3', reading: '3' }, { surface: '。', reading: '。' });

    // Act
    const result = annotate('ラーメンを3。', tokenize);

    // Assert
    expect(result).toEqual({ text: 'ラーメンを3。', reviews: [] });
  });

  test('7.2 漢字を含む語にふりがなを付ける', () => {
    const tokenize = fake({ surface: '見える', reading: 'ミエル' }, { surface: '。', reading: '。' });

    expect(annotate('見える。', tokenize).text).toBe('{見|み}える。');
  });

  test('7.2 すでにある {漢字|よみ} は変えず、同じ文の中の付いていない漢字にだけ付ける', () => {
    // Arrange：括弧の外だけをトークナイザーに渡す
    const seen: string[] = [];
    const tokenize: Tokenize = text => {
      seen.push(text);
      return [
        { surface: 'と', reading: 'ト' },
        { surface: '町', reading: 'マチ' }
      ];
    };

    // Act
    const result = annotate('{京都|きょうと}と町', tokenize);

    // Assert
    expect(result.text).toBe('{京都|きょうと}と{町|まち}');
    expect(seen).toEqual(['と町']);
  });

  test('7.2 辞書にない語（読みがない）は、そのまま残して、要確認に入れる', () => {
    const tokenize = fake({ surface: '麟' }, { surface: 'の', reading: 'ノ' });

    const result = annotate('麟の', tokenize);

    expect(result.text).toBe('麟の');
    expect(result.reviews).toEqual([{ surface: '麟', kind: 'unknown' }]);
  });

  test('7.2 読みを合わせられない語は、語全体を1つのルビにして、要確認に入れる', () => {
    const tokenize = fake({ surface: '八ヶ岳', reading: 'ヤツガダケ' });

    const result = annotate('八ヶ岳', tokenize);

    expect(result.text).toBe('{八ヶ岳|やつがだけ}');
    expect(result.reviews).toEqual([{ surface: '八ヶ岳', reading: 'やつがだけ', kind: 'misaligned' }]);
  });

  test('7.2 読みの字がルビに使えない語は、そのまま残して、要確認に入れる', () => {
    const tokenize = fake({ surface: '京都', reading: 'キョウト?' });

    const result = annotate('京都', tokenize);

    expect(result.text).toBe('京都');
    expect(result.reviews).toEqual([{ surface: '京都', kind: 'unknown' }]);
  });

  test('7.2 固有名詞を要確認に入れる（付けた読みも知らせる）', () => {
    const tokenize = fake({ surface: '函館山', reading: 'ハコダテサン', partOfSpeech: '名詞', partOfSpeechSubcategory1: '固有名詞' });

    const result = annotate('函館山', tokenize);

    expect(result.text).toBe('{函館山|はこだてさん}');
    expect(result.reviews).toEqual([{ surface: '函館山', reading: 'はこだてさん', kind: 'proper-noun' }]);
  });

  test('7.2 同じ語・同じ理由の要確認は、1件にまとめる', () => {
    const tokenize = fake(
      { surface: '京', reading: 'キョウ', partOfSpeechSubcategory1: '固有名詞' },
      { surface: 'の', reading: 'ノ' },
      { surface: '京', reading: 'キョウ', partOfSpeechSubcategory1: '固有名詞' }
    );

    expect(annotate('京の京', tokenize).reviews).toHaveLength(1);
  });

  describe('語が分かれた漢字（split-compound）', () => {
    test('7.2 漢字の続きが2つの語に分かれたら、並び全体と付けた読みを要確認に入れる（出力の文は変えない）', () => {
      // Arrange：IPADIC の実際の出力。正しい読みは「もんおりもの」
      const tokenize = fake({ surface: '紋織', reading: 'モンオリ' }, { surface: '物', reading: 'ブツ' });

      // Act
      const result = annotate('紋織物', tokenize);

      // Assert
      expect(result.text).toBe('{紋織|もんおり}{物|ぶつ}');
      expect(result.reviews).toEqual([{ surface: '紋織物', reading: 'もんおりぶつ', kind: 'split-compound' }]);
    });

    test('7.2 読みが合っていても（総本宮）、分かれていれば要確認に入れる', () => {
      const tokenize = fake({ surface: '総', reading: 'ソウ' }, { surface: '本宮', reading: 'ホングウ' });

      expect(annotate('総本宮', tokenize).reviews).toEqual([{ surface: '総本宮', reading: 'そうほんぐう', kind: 'split-compound' }]);
    });

    test('7.2 送り仮名で終わる語に漢字が続くときも、並び全体（送り仮名を含む）を出す（先染め・懸造り）', () => {
      const first = fake({ surface: '先', reading: 'サキ' }, { surface: '染め', reading: 'ゾメ' });
      const second = fake({ surface: '懸', reading: 'カカ' }, { surface: '造り', reading: 'ツクリ' });

      expect(annotate('先染め', first).reviews).toEqual([{ surface: '先染め', reading: 'さきぞめ', kind: 'split-compound' }]);
      expect(annotate('懸造り', second).text).toBe('{懸|かか}{造|つく}り');
      expect(annotate('懸造り', second).reviews).toEqual([{ surface: '懸造り', reading: 'かかつくり', kind: 'split-compound' }]);
    });

    test('7.2 3つ以上の語に分かれたときは、並び全体で1件にする', () => {
      const tokenize = fake({ surface: '東', reading: 'ヒガシ' }, { surface: '山', reading: 'ヤマ' }, { surface: '道', reading: 'ミチ' });

      expect(annotate('東山道', tokenize).reviews).toEqual([{ surface: '東山道', reading: 'ひがしやまみち', kind: 'split-compound' }]);
    });

    test('7.2 前の語が漢字で終わらない（送り仮名で終わる）ときや、間に別の語があるときは、要確認に入れない', () => {
      const kana = fake({ surface: '焼き', reading: 'ヤキ' }, { surface: '魚', reading: 'サカナ' });
      const apart = fake({ surface: '京', reading: 'キョウ' }, { surface: 'の', reading: 'ノ' }, { surface: '町', reading: 'マチ' });

      expect(annotate('焼き魚', kana).reviews).toEqual([]);
      expect(annotate('京の町', apart).reviews).toEqual([]);
    });

    test('7.2 読みのない語（辞書にない語）が混じるときは、読みを付けずに並び全体を出す', () => {
      const tokenize = fake({ surface: '麒', reading: 'キ' }, { surface: '麟' });

      const { reviews } = annotate('麒麟', tokenize);

      expect(reviews).toContainEqual({ surface: '麒麟', kind: 'split-compound' });
      expect(reviews).toContainEqual({ surface: '麟', kind: 'unknown' });
    });

    test('7.2 同じ並びが何回出ても、要確認は1件にまとめる', () => {
      const tokenize = fake(
        { surface: '西', reading: 'ニシ' },
        { surface: '軍', reading: 'グン' },
        { surface: 'と', reading: 'ト' },
        { surface: '西', reading: 'ニシ' },
        { surface: '軍', reading: 'グン' }
      );

      expect(annotate('西軍と西軍', tokenize).reviews).toEqual([{ surface: '西軍', reading: 'にしぐん', kind: 'split-compound' }]);
    });
  });

  describe('数字の後の漢字（after-digit）', () => {
    test('7.2 直前が数字の語に漢字があれば、数字を含めて要確認に入れる（出力の文は変えない）', () => {
      // Arrange：IPADIC の実際の出力。正しい読みは「がつ」
      const tokenize = fake({ surface: '11' }, { surface: '月', reading: 'ツキ' });

      // Act
      const result = annotate('11月', tokenize);

      // Assert
      expect(result.text).toBe('11{月|つき}');
      expect(result.reviews).toEqual([{ surface: '11月', reading: 'つき', kind: 'after-digit' }]);
    });

    test('7.2 全角の数字でも要確認に入れる', () => {
      const tokenize = fake({ surface: '１２' }, { surface: '社', reading: 'シャ' });

      expect(annotate('１２社', tokenize).reviews).toEqual([{ surface: '１２社', reading: 'しゃ', kind: 'after-digit' }]);
    });

    test('7.2 数字と漢字が1つの語になっているときも、要確認に入れる', () => {
      const tokenize = fake({ surface: '3日', reading: 'ミッカ' });

      expect(annotate('3日', tokenize).reviews).toContainEqual({ surface: '3日', reading: 'みっか', kind: 'after-digit' });
    });

    test('7.2 数字の後に漢字がない（ひらがな・カタカナ）、または、数字が前にないときは、要確認に入れない', () => {
      const kana = fake({ surface: '3' }, { surface: 'ひき', reading: 'ヒキ' });
      const none = fake({ surface: '月', reading: 'ツキ' });

      expect(annotate('3ひき', kana).reviews).toEqual([]);
      expect(annotate('月', none).reviews).toEqual([]);
    });

    test('7.2 読みのない語（辞書にない語）が数字の後にあれば、読みを付けずに出す', () => {
      const tokenize = fake({ surface: '2' }, { surface: '麟' });

      expect(annotate('2麟', tokenize).reviews).toContainEqual({ surface: '2麟', kind: 'after-digit' });
    });
  });

  test('7.2 空の文は、そのまま返す', () => {
    expect(annotate('', fake())).toEqual({ text: '', reviews: [] });
  });
});

describe('formatReview', () => {
  test('7.2 要確認の理由ごとに、語・読み・確かめることを1行にする', () => {
    expect(formatReview({ surface: '函館山', reading: 'はこだてさん', kind: 'proper-noun' })).toBe('函館山（はこだてさん）：固有名詞。読みを公式の表記で確かめる');
    expect(formatReview({ surface: '八ヶ岳', reading: 'やつがだけ', kind: 'misaligned' })).toBe('八ヶ岳（やつがだけ）：送り仮名で区切れず、語全体に読みを付けた。区切りと読みを確かめる');
    expect(formatReview({ surface: '麟', kind: 'unknown' })).toBe('麟：辞書にない語（読みを付けていない）。読みを調べて手で付ける');
    expect(formatReview({ surface: '紋織物', reading: 'もんおりぶつ', kind: 'split-compound' })).toBe('紋織物（もんおりぶつ）：漢字の続きが語に分かれた。複合語の読みを確かめる');
    expect(formatReview({ surface: '麒麟', kind: 'split-compound' })).toBe('麒麟：漢字の続きが語に分かれた。複合語の読みを確かめる');
    expect(formatReview({ surface: '11月', reading: 'つき', kind: 'after-digit' })).toBe('11月（つき）：数字の後の漢字。数え方の読みを確かめる');
  });
});

describe('runFurigana', () => {
  const tokenize: Tokenize = text => (text === '町' ? [{ surface: '町', reading: 'マチ' }] : [{ surface: text, reading: 'ト' }]);

  test('7.2 CLI：行ごとに変換して標準出力に出し、要確認の一覧を標準エラーに出す', () => {
    // Arrange
    const out: string[] = [];
    const err: string[] = [];

    // Act
    const code = runFurigana(
      ['町', '', 'ひと'],
      tokenize,
      line => out.push(line),
      line => err.push(line)
    );

    // Assert
    expect(code).toBe(0);
    expect(out).toEqual(['{町|まち}', '', 'ひと']);
    expect(err).toEqual([]);
  });

  test('7.2 CLI：要確認があれば、標準エラーに出す（終了コードは0）', () => {
    const out: string[] = [];
    const err: string[] = [];

    const code = runFurigana(
      ['麟'],
      () => [{ surface: '麟' }],
      line => out.push(line),
      line => err.push(line)
    );

    expect(code).toBe(0);
    expect(out).toEqual(['麟']);
    expect(err).toEqual(['要確認（1件）：', '  麟：辞書にない語（読みを付けていない）。読みを調べて手で付ける']);
  });

  test('7.2 CLI：空の入力でも失敗しない', () => {
    const out: string[] = [];
    const err: string[] = [];

    const code = runFurigana(
      [],
      tokenize,
      line => out.push(line),
      line => err.push(line)
    );

    expect(code).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });
});

describe('createLinderaTokenizer（実際の辞書）', () => {
  test('7.2 出力は checkRuby で誤りなし。読みを付けた漢字の警告も出ない', { timeout: 30_000 }, () => {
    // Arrange
    const tokenize = createLinderaTokenizer();
    const sentences = ['清水寺の舞台から、京都の町並みを一望できます。', '焼き魚や今日の献立、一日中楽しめます。', '羽田空港から新千歳空港まで飛行機で行きます。', '八ヶ岳は、スゴイ山です。'];

    sentences.forEach(sentence => {
      // Act
      const { text } = annotate(sentence, tokenize);
      const { errors, warnings } = checkRuby(text);

      // Assert：辞書にない語（麟のような字）がなければ、付け忘れもない
      expect(errors, text).toEqual([]);
      expect(warnings, text).toEqual([]);
    });
  });

  test('7.2 実際の辞書：清水寺・町並みに正しい読みを付ける', () => {
    const tokenize = createLinderaTokenizer();

    expect(annotate('清水寺の町並み', tokenize).text).toBe('{清水寺|きよみずでら}の{町並|まちな}み');
  });

  test('7.2 実際の辞書：数字の後の漢字と、分かれた複合語を要確認に入れる', () => {
    const tokenize = createLinderaTokenizer();

    const { reviews } = annotate('11月に紋織物を見ます。', tokenize);

    expect(reviews).toContainEqual(expect.objectContaining({ surface: '11月', kind: 'after-digit' }));
    expect(reviews).toContainEqual(expect.objectContaining({ surface: '紋織物', kind: 'split-compound' }));
  });

  test('7.2 実際の辞書：辞書にない漢字は、そのまま残して要確認に入れる', () => {
    const tokenize = createLinderaTokenizer();

    const result = annotate('麒麟麟', tokenize);

    expect(result.text).toBe('{麒麟|きりん}麟');
    expect(result.reviews).toContainEqual({ surface: '麟', kind: 'unknown' });
  });
});
