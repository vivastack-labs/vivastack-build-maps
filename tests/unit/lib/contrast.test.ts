import { describe, expect, test } from 'vitest';

import { contrastRatio, parseHexColor } from '@/lib/contrast';

// 5.2（T4-03）：色の組み合わせのコントラスト比（WCAG 2.x の相対輝度）
describe('contrastRatio', () => {
  test('5.2：contrastRatio は白と黒で 21、同じ色で 1 を返す', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#0f172a', '#0f172a')).toBe(1);
  });

  test('5.2：WCAG の例の値と合う（#777777 と白は約 4.48）', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  test('5.2：#rgb の3桁と、大文字小文字の違いを同じ色として読む', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 5);
  });

  test('5.2：ダークの固定中の塗り #d97706 と白に近い #f8fafc は 4.5 に足りない（3.04）', () => {
    expect(contrastRatio('#f8fafc', '#d97706')).toBeCloseTo(3.04, 2);
  });

  test('5.2：形が正しくない色は例外にする', () => {
    expect(() => parseHexColor('red')).toThrow(/色/u);
    expect(() => parseHexColor('#12345')).toThrow(/色/u);
    expect(() => contrastRatio('#gggggg', '#ffffff')).toThrow(/色/u);
  });
});
