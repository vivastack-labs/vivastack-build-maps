import { readFileSync } from 'node:fs';
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

// geo/sources/ の修正表は pnpm geo:build を手で動かすときにしか読まれないので、壊れた編集を CI で見つける
describe('geo/sources の修正表', () => {
  const read = (file: string): string => readFileSync(new URL(`../../../../../geo/sources/${file}`, import.meta.url), 'utf8');

  test('D33：読みの修正表が読め、直した読みはひらがなだけ', () => {
    // Act
    const table = parseFixTable(read('kana-fixes.csv'), 'kana');

    // Assert
    expect(table.size).toBeGreaterThan(0);
    [...table.values()].forEach(fix => expect(fix.after).toMatch(/^[ぁ-ゖ]+$/));
  });

  test('D33：ローマ字の修正表が読め、直した語幹は「大文字で始まる語」をハイフンでつないだもの', () => {
    // Act
    const table = parseFixTable(read('romaji-fixes.csv'), 'stem');

    // Assert
    expect(table.size).toBeGreaterThan(0);
    [...table.values()].forEach(fix => expect(fix.after).toMatch(/^[A-Z][a-z]+(-[A-Z][a-z]+)*$/));
  });
});
