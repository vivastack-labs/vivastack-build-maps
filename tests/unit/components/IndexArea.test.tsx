import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { IndexArea } from '@/components/IndexArea';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

describe('IndexArea', () => {
  for (const lang of LANGS) {
    test(`F-IDX：IndexArea は県名さくいんの見出し（${lang}）を level 2 で出す`, () => {
      // Arrange・Act
      render(<IndexArea lang={lang} />);

      // Assert
      const heading = screen.getByRole('heading', { level: 2 });
      expect(textWithoutRuby(heading)).toBe(plainText(getMessages(lang).index.heading));
    });
  }
});
