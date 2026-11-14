import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardArea } from '@/components/CardArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { loadContent } from '@/lib/content';
import { distancesFromTokyo, distanceText } from '@/lib/distance';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = loadContent();
const distances = distancesFromTokyo(prefectures);

const renderCard = (lang: (typeof LANGS)[number]) =>
  render(
    <MapStateProvider>
      <CardArea lang={lang} prefectures={prefectures} distances={distances} />
    </MapStateProvider>
  );

describe('CardArea', () => {
  test('F-CARD-03：県の距離がなければ例外（0 km と出さない）', () => {
    // Arrange・Act・Assert
    expect(() =>
      render(
        <MapStateProvider>
          <CardArea lang="ja" prefectures={prefectures} distances={new Map()} />
        </MapStateProvider>
      )
    ).toThrow('東京からの距離がありません');
  });

  for (const lang of LANGS) {
    test(`4.11.1：CardArea は県を選ぶ前の案内文（${lang}、おとな向け）を出す`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const guide = container.querySelector('[data-card-guide]') as HTMLElement;
      expect(guide.hidden).toBe(false);
      expect(textWithoutRuby(guide)).toBe(plainText(getMessages(lang).card.guide.adult));
    });

    test(`F-CARD-01：47県の県名が hidden で出る（${lang}）`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const cards = [...container.querySelectorAll<HTMLElement>('[data-card-pref]')];
      expect(cards).toHaveLength(47);
      for (const [i, card] of cards.entries()) {
        const prefecture = prefectures[i];
        expect(card.getAttribute('data-card-pref')).toBe(prefecture?.code);
        expect(card.hidden).toBe(true);
        expect(textWithoutRuby(card.querySelector<HTMLElement>('[data-card-name]') as HTMLElement)).toBe(plainText(prefecture?.name[lang] ?? ''));
      }
    });

    test(`F-CARD-03：各県のカードに東京からの距離を出す（${lang}）`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const cards = [...container.querySelectorAll<HTMLElement>('[data-card-pref]')];
      expect(cards).toHaveLength(47);
      for (const card of cards) {
        const code = card.getAttribute('data-card-pref') ?? '';
        const distance = card.querySelector<HTMLElement>('[data-card-distance]');
        expect(distance, `${code} に距離の行がない`).not.toBeNull();
        expect(textWithoutRuby(distance as HTMLElement)).toBe(plainText(distanceText(lang, distances.get(code) ?? Number.NaN)));
      }
      // 沖縄県は 1,000km 以上なので、桁区切りが入る
      const okinawa = container.querySelector('[data-card-pref="47"] [data-card-distance]') as HTMLElement;
      expect(okinawa.textContent).toMatch(/1,5\d0/);
    });
  }
});
