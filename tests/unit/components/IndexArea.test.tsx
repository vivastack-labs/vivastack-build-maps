import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { IndexArea } from '@/components/IndexArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { loadContent } from '@/lib/content';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = loadContent();

describe('IndexArea', () => {
  for (const lang of LANGS) {
    test(`F-IDX：IndexArea は県名さくいんの見出し（${lang}）を level 2 で出す`, () => {
      // Arrange・Act
      render(
        <MapStateProvider>
          <IndexArea lang={lang} prefectures={prefectures} />
        </MapStateProvider>
      );

      // Assert
      const heading = screen.getByRole('heading', { level: 2 });
      expect(textWithoutRuby(heading)).toBe(plainText(getMessages(lang).index.heading));
    });
  }

  test('F-IDX-01：見出しの下に、8地方の見出し（h3）と47の県名の項目が入る', () => {
    // Arrange・Act
    const { container } = render(
      <MapStateProvider>
        <IndexArea lang="ja" prefectures={prefectures} />
      </MapStateProvider>
    );

    // Assert
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8);
    expect(container.querySelectorAll('section[data-area="index"] a[data-pref]')).toHaveLength(47);
  });
});
