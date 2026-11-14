import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapStateProvider } from '@/components/MapStateProvider';
import { MapTooltip } from '@/components/MapTooltip';
import { publishedPrefectures } from '../lib/published-helpers';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { textWithoutRuby } from './base-text';

// フィクスチャ（北海道：名物3つ、沖縄県：名物なし）で確かめる
const prefectures = publishedPrefectures(FIXTURE_DIR);

const renderTips = (lang: 'ja' | 'en' | 'zh' = 'ja') =>
  render(
    <MapStateProvider>
      <MapTooltip lang={lang} prefectures={prefectures} />
    </MapStateProvider>
  );

const tipOf = (container: HTMLElement, code: string) => container.querySelector(`[data-tip-pref="${code}"]`) as HTMLElement;

describe('MapTooltip', () => {
  test('F-TIP-01: 47県ぶんの中身を hidden で出す', () => {
    const { container } = renderTips();

    const tips = [...container.querySelectorAll<HTMLElement>('[data-tip-pref]')];
    expect(tips).toHaveLength(47);
    expect(tips.every(tip => tip.hidden)).toBe(true);
  });

  test('F-TIP-01: 県名と名物3つの名前を出し、解説文・絵文字は出さない', () => {
    const { container } = renderTips();

    const hokkaido = prefectures.find(pref => pref.code === '01');
    const tip = tipOf(container, '01');
    expect(textWithoutRuby(tip.querySelector('[data-tip-name]') as Element)).toBe(plainText(hokkaido?.name.ja ?? ''));
    const items = [...tip.querySelectorAll('li')].map(item => textWithoutRuby(item));
    expect(items).toEqual((hokkaido?.specialties ?? []).map(specialty => plainText(specialty.name.ja)));
    expect(items).toHaveLength(3);
    for (const specialty of hokkaido?.specialties ?? []) {
      expect(tip.textContent).not.toContain(specialty.emoji);
      expect(tip.textContent).not.toContain(plainText(specialty.description.ja.adult).slice(0, 8));
    }
  });

  test('F-I18N-05: 英語のページは英語の県名・名物の名前', () => {
    const { container } = renderTips('en');

    const tip = tipOf(container, '01');
    expect(tip.querySelector('[data-tip-name]')?.textContent).toBe('Hokkaido');
    expect([...tip.querySelectorAll('li')].map(item => item.textContent)).toEqual(['Potatoes', 'Milk', expect.any(String)]);
  });

  test('4.11.4: 名物がない県は県名だけ（名物の一覧を出さない）', () => {
    const { container } = renderTips();

    const tip = tipOf(container, '47');
    expect(textWithoutRuby(tip)).toBe('沖縄県');
    expect(tip.querySelector('ul')).toBeNull();
  });

  test('ふりがなの記法は <ruby> で描く（ふりがなの ON/OFF は CSS で効く）', () => {
    const { container } = renderTips();

    expect(tipOf(container, '47').querySelector('ruby rt')?.textContent).toBe('おきなわけん');
  });

  test('4.11.4: 準備中の県（publish の本番の結果）は県名だけ。名物の名前は1つも出ない（北海道は出る）', () => {
    const { container } = render(
      <MapStateProvider>
        <MapTooltip lang="ja" prefectures={publishedPrefectures(FIXTURE_DIR, 'production')} />
      </MapStateProvider>
    );

    const tokyo = tipOf(container, '13');
    expect(textWithoutRuby(tokyo.querySelector('[data-tip-name]') as Element)).toBe('東京都');
    expect(tokyo.querySelectorAll('li')).toHaveLength(0);
    expect(tokyo.textContent).not.toContain('つくだ煮');
    expect(tipOf(container, '47').querySelectorAll('li')).toHaveLength(0);
    expect(tipOf(container, '01').querySelectorAll('li')).toHaveLength(3);
  });
});
