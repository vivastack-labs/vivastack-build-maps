import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Footer } from '@/components/Footer';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const N03_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html';

describe('Footer', () => {
  test.each(LANGS)('4.11.7：Footer は contentinfo のランドマークである（%s）', lang => {
    // Arrange・Act
    render(<Footer lang={lang} page="home" />);

    // Assert
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });

  test.each(LANGS)('説明ページに地図データの出典と AI の明記を出す（F-SRC-04。%s）', lang => {
    // Arrange・Act
    const { container } = render(<Footer lang={lang} page="privacy" />);

    // Assert：文は「前 + URL + 後」。リンクは URL の文字で、同じタブで開く
    const messages = getMessages(lang).footer;
    const source = container.querySelector('[data-footer-map-source]') as HTMLElement;
    expect(textWithoutRuby(source)).toBe(plainText(messages.mapSource.before) + N03_URL + plainText(messages.mapSource.after));
    const link = source.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(N03_URL);
    expect(link.textContent).toBe(N03_URL);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.hasAttribute('target')).toBe(false);
    expect(textWithoutRuby(container.querySelector('[data-footer-ai]') as HTMLElement)).toBe(plainText(messages.ai));
  });

  test('F-SRC-04：日本語はふりがなつきで、「国土数値情報」と「AIで作成し、人が確認しています」を含む', () => {
    // Arrange・Act
    const { container } = render(<Footer lang="ja" page="privacy" />);

    // Assert
    expect(container.querySelector('[data-footer-map-source] ruby')).not.toBeNull();
    expect(textWithoutRuby(container.querySelector('[data-footer-map-source]') as HTMLElement)).toContain('国土数値情報（行政区域データ）');
    expect(textWithoutRuby(container.querySelector('[data-footer-ai]') as HTMLElement)).toBe('AIで作成し、人が確認しています');
  });

  test('F-SRC-04：英語・中国語の文言', () => {
    // Arrange・Act
    const en = render(<Footer lang="en" page="privacy" />).container;
    const zh = render(<Footer lang="zh" page="privacy" />).container;

    // Assert
    expect(en.querySelector('[data-footer-ai]')?.textContent).toBe('Created with AI and checked by people');
    expect(zh.querySelector('[data-footer-ai]')?.textContent).toBe('由 AI 制作，并经人工确认');
    expect(en.querySelector('[data-footer-map-source]')?.textContent).toContain('National Land Numerical Information');
    expect(zh.querySelector('[data-footer-map-source]')?.textContent).toContain('国土数值信息');
  });

  test.each(LANGS)('F-SRC-04：トップのフッターには説明ページへのリンクを出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<Footer lang={lang} page="home" />);

    // Assert
    const messages = getMessages(lang).footer;
    const about = container.querySelector('a[data-footer-link="about"]') as HTMLAnchorElement;
    const privacy = container.querySelector('a[data-footer-link="privacy"]') as HTMLAnchorElement;
    expect(about.getAttribute('href')).toBe(`/${lang}/about/`);
    expect(textWithoutRuby(about)).toBe(plainText(messages.about));
    expect(privacy.getAttribute('href')).toBe(`/${lang}/privacy/`);
    expect(textWithoutRuby(privacy)).toBe(plainText(messages.privacy));
    expect(container.querySelector('[data-footer-map-source]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-footer-ai]')).not.toBeInTheDocument();
  });

  test.each([
    ['home', null],
    ['about', 'about'],
    ['privacy', 'privacy']
  ] as const)('F-SRC-04：%s のページでは、今のページのリンクだけに aria-current="page"（T4-05）', (page, current) => {
    // Arrange・Act
    const { container } = render(<Footer lang="en" page={page} />);

    // Assert
    const marked = [...container.querySelectorAll('a[data-footer-link][aria-current="page"]')].map(link => link.getAttribute('data-footer-link'));
    expect(marked).toEqual(current === null ? [] : [current]);
  });
});
