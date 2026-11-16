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

  test.each(LANGS)('F-I18N-03：Header に言語切替がある（%s。T3-07）', lang => {
    // Arrange・Act
    const { container } = render(<Header lang={lang} />);

    // Assert
    expect(container.querySelector('header [data-lang-switch]')).not.toBeNull();
    expect(container.querySelectorAll('[data-lang-link]')).toHaveLength(3);
  });

  test.each(['about', 'privacy'] as const)('4.11.7：%s のページでは、サイト名がトップへのリンクで h1 ではない（T4-05）', page => {
    // Arrange・Act
    const { container } = render(<Header lang="en" page={page} />);

    // Assert：1ページに h1 は1つ（ページの題名は main の中）。サイト名は /{lang}/ へのリンク
    expect(container.querySelector('h1')).toBeNull();
    const link = within(screen.getByRole('banner')).getByRole('link', { name: plainText(getMessages('en').siteName) });
    expect(link.getAttribute('href')).toBe('/en/');
  });

  test('4.11.7：page を省くとトップと同じ（サイト名が h1。リンクにしない）', () => {
    // Arrange・Act
    const { container } = render(<Header lang="ja" />);

    // Assert
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('h1 a')).toBeNull();
  });

  test('F-I18N-03：ほかのページの言語切替は、同じページのほかの言語を指す（T4-05）', () => {
    // Arrange・Act
    const { container } = render(<Header lang="zh" page="privacy" />);

    // Assert
    const hrefs = [...container.querySelectorAll('[data-lang-link]')].map(link => link.getAttribute('href'));
    expect(hrefs).toEqual(['/ja/privacy/', '/en/privacy/', '/zh/privacy/']);
  });
});
