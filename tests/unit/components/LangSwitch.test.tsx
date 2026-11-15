import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { LangSwitch } from '@/components/LangSwitch';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';

describe('LangSwitch', () => {
  test.each(LANGS)('F-I18N-03：3言語のリンクがあり、今の言語（%s）だけに aria-current="page"', lang => {
    // Arrange・Act
    render(<LangSwitch lang={lang} />);

    // Assert
    const links = within(screen.getByRole('list', { name: plainText(getMessages(lang).langSwitch.label) })).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/ja/', '/en/', '/zh/']);
    expect(links.map(link => link.textContent)).toEqual(['日本語', 'English', '中文']);
    const current = links.filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.getAttribute('data-lang-link'))).toEqual([lang]);
  });

  test('F-I18N-03：リンクに hreflang と lang（言語の名前をその言語で読み上げる）', () => {
    // Arrange・Act
    const { container } = render(<LangSwitch lang="ja" />);

    // Assert
    const attrs = [...container.querySelectorAll('a[data-lang-link]')].map(link => [link.getAttribute('hreflang'), link.getAttribute('lang')]);
    expect(attrs).toEqual([
      ['ja', 'ja'],
      ['en', 'en'],
      ['zh-Hans', 'zh-Hans']
    ]);
  });

  test('4.11.7：ランドマークを増やさない（nav を使わない）', () => {
    // Arrange・Act
    const { container } = render(<LangSwitch lang="en" />);

    // Assert
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('[data-lang-switch]')).not.toBeNull();
  });
});
