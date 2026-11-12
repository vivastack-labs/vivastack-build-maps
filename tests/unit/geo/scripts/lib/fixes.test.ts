import { describe, expect, test } from 'vitest';
import { parseFixTable } from '../../../../../geo/scripts/lib/fixes';

// 7.4.1・D33：機械的に作ると間違う読み・ローマ字を、団体コードで引く修正表（geo/sources/*.csv）で直す
describe('parseFixTable', () => {
  test('D33：修正表の CSV をコードで引ける表にする', () => {
    // Arrange
    const csv = 'code,name,before,kana\n06428,庄内町,しようないまち,しょうないまち\n11206,行田市,ぎようだし,ぎょうだし\n';

    // Act
    const table = parseFixTable(csv, 'kana');

    // Assert
    expect(table.size).toBe(2);
    expect(table.get('06428')).toEqual({ code: '06428', name: '庄内町', before: 'しようないまち', after: 'しょうないまち' });
  });

  test('D33：空の行は読み飛ばし、見出しだけなら空の表にする', () => {
    // Act
    const table = parseFixTable('code,name,before,stem\n\n', 'stem');

    // Assert
    expect(table.size).toBe(0);
  });

  test.each([
    ['見出しが違う', 'code,name,before,kana\n', 'stem'],
    ['列の数が違う行', 'code,name,before,stem\n12218,勝浦市,Katsura\n', 'stem'],
    ['5桁でないコード', 'code,name,before,stem\n1221,勝浦市,Katsura,Katsuura\n', 'stem'],
    ['コードの重複', 'code,name,before,stem\n12218,勝浦市,Katsura,Katsuura\n12218,勝浦市,Katsura,Katsuura\n', 'stem'],
    ['直す前と後が同じ', 'code,name,before,stem\n12218,勝浦市,Katsuura,Katsuura\n', 'stem'],
    ['空の値', 'code,name,before,stem\n12218,勝浦市,,Katsuura\n', 'stem']
  ])('D33：%s はエラーにする', (_label, csv, column) => {
    // Act / Assert
    expect(() => parseFixTable(csv, column)).toThrow();
  });
});
