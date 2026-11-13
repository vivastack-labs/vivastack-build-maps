import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardArea } from '@/components/CardArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { loadContent } from '@/lib/content';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = loadContent();

const renderCard = (lang: (typeof LANGS)[number]) =>
  render(
    <MapStateProvider>
      <CardArea lang={lang} prefectures={prefectures} />
    </MapStateProvider>
  );

describe('CardArea', () => {
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
        expect(textWithoutRuby(card)).toBe(plainText(prefecture?.name[lang] ?? ''));
      }
    });
  }
});
