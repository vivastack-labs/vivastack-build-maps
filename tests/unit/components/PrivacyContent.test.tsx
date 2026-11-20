import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PrivacyContent } from '@/components/PrivacyContent';
import { formatDate } from '@/i18n/format';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { LABEL_SEPARATOR } from '@/i18n/cardText';
import { plainText } from '@/lib/ruby';
import { PRIVACY_REVISED_DATE } from '@/lib/site';
import { CLOUDFLARE_ANALYTICS_URL, CLOUDFLARE_PRIVACY_URL } from '@/lib/sources';
import { textWithoutRuby } from './base-text';

describe('PrivacyContent', () => {
  test.each(LANGS)('5.6・T6-02：運営者のプロフィールと公開の報告窓口を出す（%s）', lang => {
    render(<PrivacyContent lang={lang} />);

    expect(screen.getByRole('link', { name: 'VivaStack' })).toHaveAttribute('href', 'https://github.com/vivastack');
    expect(screen.getByRole('link', { name: 'GitHub Issues' })).toHaveAttribute('href', 'https://github.com/vivastack-labs/vivastack-build-maps/issues');
  });

  test.each(LANGS)('5.6：Cloudflare Web Analytics を使うこと・Cookie を使わないことと、説明へのリンクを出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<PrivacyContent lang={lang} />);

    // Assert
    const { analytics, cookies } = getMessages(lang).privacy;
    const section = container.querySelector('[data-privacy-section="analytics"]') as HTMLElement;
    expect(textWithoutRuby(section)).toContain('Cloudflare Web Analytics');
    expect(textWithoutRuby(section)).toContain(plainText(analytics.body));
    const link = section.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(CLOUDFLARE_ANALYTICS_URL);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(textWithoutRuby(section)).toBe(plainText(analytics.heading) + plainText(analytics.body) + plainText(analytics.detail.before) + CLOUDFLARE_ANALYTICS_URL + plainText(analytics.detail.after));
    expect(textWithoutRuby(container.querySelector('[data-privacy-section="cookies"]') as HTMLElement)).toContain(plainText(cookies.body));
  });

  test.each(LANGS)('5.6：端末に保存するもの（localStorage と Service Worker のキャッシュ）を出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<PrivacyContent lang={lang} />);

    // Assert
    const { storage } = getMessages(lang).privacy;
    const section = container.querySelector('[data-privacy-section="storage"]') as HTMLElement;
    const items = [...section.querySelectorAll('li')].map(li => textWithoutRuby(li));
    expect(items).toEqual(storage.items.map(plainText));
    expect(items[0]).toContain('localStorage');
    expect(items[1]).toContain('Service Worker');
    expect(textWithoutRuby(section)).toContain(plainText(storage.intro));
    expect(textWithoutRuby(section)).toContain(plainText(storage.note));
  });

  test.each(LANGS)('5.6：配信・外部のサイトの節と、改定日を言語の書式で出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<PrivacyContent lang={lang} />);

    // Assert
    const { delivery, external, revised } = getMessages(lang).privacy;
    const deliverySection = container.querySelector('[data-privacy-section="delivery"]') as HTMLElement;
    expect(textWithoutRuby(deliverySection)).toContain(plainText(delivery.body));
    // 配信のために Cloudflare が IP アドレスなどの通信の情報を扱うこと（保存期間など、確かめていないことは書かない）と、Cloudflare のプライバシーポリシーへのリンク
    expect(textWithoutRuby(deliverySection)).toContain(plainText(delivery.processing));
    expect(textWithoutRuby(deliverySection)).toContain(plainText(delivery.detail.before) + CLOUDFLARE_PRIVACY_URL + plainText(delivery.detail.after));
    const privacyLink = deliverySection.querySelector('a') as HTMLAnchorElement;
    expect(privacyLink.getAttribute('href')).toBe(CLOUDFLARE_PRIVACY_URL);
    expect(privacyLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(textWithoutRuby(container.querySelector('[data-privacy-section="external"]') as HTMLElement)).toContain(plainText(external.body));
    expect(textWithoutRuby(container.querySelector('[data-privacy-revised]') as HTMLElement)).toBe(plainText(revised) + LABEL_SEPARATOR[lang] + formatDate(lang, PRIVACY_REVISED_DATE));
  });

  test.each(LANGS)('4.11.7：題名が h1 で、節の見出しが h2（h1 は1つ。%s）', lang => {
    // Arrange・Act
    const { container } = render(<PrivacyContent lang={lang} />);

    // Assert
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(textWithoutRuby(h1s[0] as Element)).toBe(plainText(getMessages(lang).privacy.title));
    expect(container.querySelectorAll('h2')).toHaveLength(6);
  });

  test('F-MODE-04：日本語はふりがなつき、英語・中国語は付けない。モードの言い分けはしない', () => {
    // Arrange・Act
    const ja = render(<PrivacyContent lang="ja" />).container;
    const en = render(<PrivacyContent lang="en" />).container;

    // Assert
    expect(ja.querySelector('ruby')).not.toBeNull();
    expect(en.querySelector('ruby')).toBeNull();
    expect(ja.querySelector('.kids, .adult')).toBeNull();
  });
});
