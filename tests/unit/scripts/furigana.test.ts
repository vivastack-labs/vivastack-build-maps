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
    const tokenize = fake({ surface: '京', reading: 'キョウ', partOfSpeechSubcategory1: '固有名詞' }, { surface: '京', reading: 'キョウ', partOfSpeechSubcategory1: '固有名詞' });

    expect(annotate('京京', tokenize).reviews).toHaveLength(1);
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

  test('7.2 実際の辞書：辞書にない漢字は、そのまま残して要確認に入れる', () => {
    const tokenize = createLinderaTokenizer();

    const result = annotate('麒麟麟', tokenize);

    expect(result.text).toBe('{麒麟|きりん}麟');
    expect(result.reviews).toContainEqual({ surface: '麟', kind: 'unknown' });
  });
});
