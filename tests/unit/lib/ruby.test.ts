import { describe, expect, test } from 'vitest';

import { checkRuby, parseRuby, plainText } from '@/lib/ruby';

// 7.2：ふりがなの記法 {漢字|よみ} のパーサー（T1-06）
describe('parseRuby', () => {
  test('7.2：{北海道|ほっかいどう} はルビの部分1つになる', () => {
    expect(parseRuby('{北海道|ほっかいどう}')).toEqual([
      { kind: 'ruby', base: '北海道', reading: 'ほっかいどう' }
    ]);
  });

  test('7.2：記法のない文字列は文字の部分1つになる', () => {
    expect(parseRuby('じゃがいも')).toEqual([{ kind: 'text', text: 'じゃがいも' }]);
  });

  test('7.2：記法と文字が混ざった文は、現れた順の配列になる', () => {
    expect(parseRuby('{生産量|せいさんりょう}は{日本一|にほんいち}。')).toEqual([
      { kind: 'ruby', base: '生産量', reading: 'せいさんりょう' },
      { kind: 'text', text: 'は' },
      { kind: 'ruby', base: '日本一', reading: 'にほんいち' },
      { kind: 'text', text: '。' }
    ]);
  });

  test('7.2：空の文字列は空の配列になる', () => {
    expect(parseRuby('')).toEqual([]);
  });

  test('7.2：括弧の外の | はただの文字として扱う', () => {
    expect(parseRuby('A | B')).toEqual([{ kind: 'text', text: 'A | B' }]);
  });

  test('7.2：parseRuby は記法の誤りがあれば、位置を含むエラーを投げる', () => {
    expect(() => parseRuby('あ{北海道|ほっかいどう')).toThrow(/2文字目/);
  });
});

describe('checkRuby の誤り', () => {
  test('7.2：閉じ括弧がなければ誤りにする', () => {
    const { errors } = checkRuby('{北海道|ほっかいどう');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('閉じ括弧');
  });

  test('7.2：括弧の中に | がなければ誤りにする', () => {
    const { errors } = checkRuby('{北海道}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('|');
  });

  test('7.2：対応しない閉じ括弧は誤りにする', () => {
    const { errors } = checkRuby('北海道}です');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('閉じ括弧');
  });

  test('7.2：括弧の中の括弧は誤りにする', () => {
    const { errors } = checkRuby('{北{海|かい}道|ほっかいどう}');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]?.message).toContain('括弧の中');
  });

  test('7.2：括弧の中に | が2つあれば誤りにする', () => {
    const { errors } = checkRuby('{北海道|ほっかい|どう}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('|');
  });

  test('7.2：読みが空なら誤りにする', () => {
    const { errors } = checkRuby('{北海道|}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('読みが空');
  });

  test('7.2：親文字が空なら誤りにする', () => {
    const { errors } = checkRuby('{|ほっかいどう}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('親文字が空');
  });

  test('7.2：読みにカタカナがあれば誤りにする', () => {
    const { errors } = checkRuby('{北海道|ホッカイドウ}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('ひらがな');
  });

  test('7.2：読みに漢字があれば誤りにする', () => {
    const { errors } = checkRuby('{北海道|北かいどう}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('ひらがな');
  });

  test('7.2：読みの空白・ゝ も誤りにする', () => {
    expect(checkRuby('{北海道|ほっかい どう}').errors).toHaveLength(1);
    expect(checkRuby('{人々|ひとゝ}').errors).toHaveLength(1);
  });

  test('7.2：読みの長音記号「ー」は許す', () => {
    expect(checkRuby('{珈琲|こーひー}').errors).toEqual([]);
  });

  test('7.2：誤りには、文字列の中の位置が入る', () => {
    // 「あい」の後の { は 2 番目（0始まり）
    expect(checkRuby('あい{北海道|}').errors[0]?.index).toBe(2);
    // 対応しない } はその位置
    expect(checkRuby('あい}').errors[0]?.index).toBe(2);
  });
});

describe('checkRuby の警告', () => {
  test('7.2：ふりがなの付いていない漢字は警告にする（続いた漢字は1件）', () => {
    const { errors, warnings } = checkRuby('{北海道|ほっかいどう}の名物は牛乳です');
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ index: 13 });
    expect(warnings[0]?.message).toContain('名物');
    expect(warnings[1]?.message).toContain('牛乳');
  });

  test('7.2：「々」もふりがなの付いていない漢字として警告にする', () => {
    const { warnings } = checkRuby('人々が集まる');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.message).toContain('人々');
    expect(warnings[1]?.message).toContain('集');
  });

  test('7.2：誤りがあっても、括弧の外の漢字は警告にする', () => {
    const { errors, warnings } = checkRuby('名物は{牛乳|}');
    expect(errors).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('名物');
  });

  test('7.2：正しい文は誤りも警告もない', () => {
    expect(checkRuby('{生産量|せいさんりょう}は{日本一|にほんいち}。')).toEqual({
      errors: [],
      warnings: []
    });
  });
});

describe('plainText', () => {
  test('7.3：plainText は読みを除く（{日本一|にほんいち}の → 日本一の）', () => {
    expect(plainText('{日本一|にほんいち}の')).toBe('日本一の');
  });

  test('7.3：plainText は記法のない文字列をそのまま返す', () => {
    expect(plainText('Potatoes')).toBe('Potatoes');
  });
});
