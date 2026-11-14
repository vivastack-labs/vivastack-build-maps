import { describe, expect, test } from 'vitest';
import { distanceText, durationText } from '@/i18n/cardText';

describe('distanceText', () => {
  test('F-CARD-03：distanceText は辞書の文に桁区切りの km を入れる（ja/en/zh）', () => {
    // Arrange・Act・Assert
    expect(distanceText('ja', 820)).toBe('{東京|とうきょう}から{約|やく} 820 km');
    expect(distanceText('en', 820)).toBe('About 820 km from Tokyo');
    expect(distanceText('zh', 820)).toBe('距东京约 820 公里');
    expect(distanceText('ja', 1550)).toBe('{東京|とうきょう}から{約|やく} 1,550 km');
    expect(distanceText('en', 1550)).toBe('About 1,550 km from Tokyo');
    expect(distanceText('zh', 1550)).toBe('距东京约 1,550 公里');
  });
});

describe('durationText', () => {
  test('F-CARD-04：durationText は 95 分を「1時間35分」、60 分を「1時間」、45 分を「45分」にする（ja/en/zh）', () => {
    // Arrange・Act・Assert
    expect(durationText('ja', 95)).toBe('1{時間|じかん}35{分|ふん}');
    expect(durationText('ja', 60)).toBe('1{時間|じかん}');
    expect(durationText('ja', 45)).toBe('45{分|ふん}');
    expect(durationText('en', 95)).toBe('1 hr 35 min');
    expect(durationText('en', 60)).toBe('1 hr');
    expect(durationText('en', 45)).toBe('45 min');
    expect(durationText('zh', 95)).toBe('1小时35分钟');
    expect(durationText('zh', 60)).toBe('1小时');
    expect(durationText('zh', 45)).toBe('45分钟');
  });

  test('F-CARD-04：日本語の「分」は、数に合わせて「ふん」「ぷん」を読みにする', () => {
    // Arrange・Act・Assert
    expect(durationText('ja', 1)).toBe('1{分|ぷん}');
    expect(durationText('ja', 3)).toBe('3{分|ぷん}');
    expect(durationText('ja', 5)).toBe('5{分|ふん}');
    expect(durationText('ja', 10)).toBe('10{分|ぷん}');
    expect(durationText('ja', 120 + 20)).toBe('2{時間|じかん}20{分|ぷん}');
  });

  test('F-CARD-04：durationText は 0 以下・整数でない分を例外にする', () => {
    // Arrange・Act・Assert
    expect(() => durationText('ja', 0)).toThrow('所要時間');
    expect(() => durationText('ja', -5)).toThrow('所要時間');
    expect(() => durationText('en', 12.5)).toThrow('所要時間');
    expect(() => durationText('zh', Number.NaN)).toThrow('所要時間');
  });
});
