import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardArea } from '@/components/CardArea';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

describe('CardArea', () => {
  for (const lang of LANGS) {
    test(`4.11.1：CardArea は県を選ぶ前の案内文（${lang}、おとな向け）を出す`, () => {
      // Arrange・Act
      const { container } = render(<CardArea lang={lang} />);

      // Assert
      expect(textWithoutRuby(container)).toBe(plainText(getMessages(lang).card.guide.adult));
    });
  }
});
