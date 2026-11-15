import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Header } from '@/components/Header';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

// 4.11.7：Header はサイト名を h1 に出す
describe('Header', () => {
  test('4.11.7：Header は banner の中にサイト名を h1 で出す（ja はふりがなつき）', () => {
    // Arrange・Act
    render(<Header lang="ja" />);

    // Assert
    const heading = within(screen.getByRole('banner')).getByRole('heading', { level: 1 });
    expect(heading.querySelector('ruby')).not.toBeNull();
  });

  for (const lang of LANGS) {
    test(`4.11.7：Header の h1 は ${lang} のサイト名である`, () => {
      // Arrange・Act
      render(<Header lang={lang} />);

      // Assert
      const heading = screen.getByRole('heading', { level: 1 });
      expect(textWithoutRuby(heading)).toBe(plainText(getMessages(lang).siteName));
    });
  }

  test('4.11.7：Header に切替のボタンがある（ja はふりがなも。T3-05）', () => {
    // Arrange・Act
    const ja = render(<Header lang="ja" />);

    // Assert
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'こども' })).toBeInTheDocument();
    expect(ja.container.querySelector('[data-ruby-button]')).not.toBeNull();
    ja.unmount();
    const en = render(<Header lang="en" />);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Kids' })).toBeInTheDocument();
    expect(en.container.querySelector('[data-ruby-button]')).toBeNull();
  });
});
