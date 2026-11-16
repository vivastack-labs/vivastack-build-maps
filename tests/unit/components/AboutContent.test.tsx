import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AboutContent } from '@/components/AboutContent';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { GSI_MAPS_URL, N03_SOURCE_URL, SOUMU_CODE_URL } from '@/lib/sources';
import { textWithoutRuby } from './base-text';

/** 出典の文：前の文 + URL + 後の文 */
const sentence = ({ before, after }: { readonly before: string; readonly after: string }, url: string): string => plainText(before) + url + plainText(after);

describe('AboutContent', () => {
  test.each(LANGS)('F-SRC-04・8.3：3つの出典の文と URL のリンクを出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert：8.3 の3つの出典の文（国土数値情報・総務省・地理院地図）
    const messages = getMessages(lang);
    const sources = [
      ['map', messages.footer.mapSource, N03_SOURCE_URL],
      ['soumu', messages.about.reading.soumu, SOUMU_CODE_URL],
      ['gsi', messages.about.reading.gsi, GSI_MAPS_URL]
    ] as const;
    for (const [key, text, url] of sources) {
      const element = container.querySelector(`[data-about-source="${key}"]`) as HTMLElement;
      expect(textWithoutRuby(element)).toBe(sentence(text, url));
      const link = element.querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(url);
      expect(link.textContent).toBe(url);
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  test.each(LANGS)('F-SRC-04：AI で作成して人が確認していること・出典がカードにあること（%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert
    const body = container.querySelector('[data-about-section="content"]') as HTMLElement;
    const text = textWithoutRuby(body);
    expect(text).toContain(plainText(getMessages(lang).about.content.body));
    expect(text).toMatch(/AI/u);
  });

  test.each(LANGS)('F-SRC-04：「名物・名所の文」の説明は、カードの出典欄の見出しと「出典なし」の文言（辞書の card）と同じ言葉を使う（%s）', lang => {
    // Arrange
    const { card, about } = getMessages(lang);

    // Act
    const body = plainText(about.content.body);

    // Assert：カードの文言を変えたら、この説明も直す
    expect(body).toContain(plainText(card.sources));
    expect(body).toContain(plainText(card.noSource));
  });

  test.each(LANGS)('R10：境界が確定していない地域があり、暫定の線をそのまま使っていること（%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert
    const section = container.querySelector('[data-about-section="boundary"]') as HTMLElement;
    expect(textWithoutRuby(section)).toContain(plainText(getMessages(lang).about.boundary.body));
  });

  test.each(LANGS)('8.3：加工したことと、国が作ったものではないことを書く（%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert
    const { mapData } = getMessages(lang).about;
    const section = container.querySelector('[data-about-section="mapData"]') as HTMLElement;
    const text = textWithoutRuby(section);
    for (const item of mapData.processedItems) expect(text).toContain(plainText(item));
    expect(text).toContain(plainText(mapData.notOfficial));
    expect(section.querySelectorAll('ul > li')).toHaveLength(mapData.processedItems.length);
  });

  test.each(LANGS)('7.5：東京からの距離の説明を、読みがな・県庁の位置の節に出す（%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert
    const section = container.querySelector('[data-about-section="reading"]') as HTMLElement;
    expect(textWithoutRuby(section)).toContain(plainText(getMessages(lang).about.reading.distance));
  });

  test.each(LANGS)('4.11.7：題名が h1 で、節の見出しが h2（h1 は1つ。%s）', lang => {
    // Arrange・Act
    const { container } = render(<AboutContent lang={lang} />);

    // Assert
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(textWithoutRuby(h1s[0] as Element)).toBe(plainText(getMessages(lang).about.title));
    expect(container.querySelectorAll('h2')).toHaveLength(5);
  });

  test('F-MODE-04：日本語はふりがなつき、英語・中国語は付けない。モードの言い分けはしない', () => {
    // Arrange・Act
    const ja = render(<AboutContent lang="ja" />).container;
    const en = render(<AboutContent lang="en" />).container;
    const zh = render(<AboutContent lang="zh" />).container;

    // Assert
    expect(ja.querySelector('ruby')).not.toBeNull();
    expect(en.querySelector('ruby')).toBeNull();
    expect(zh.querySelector('ruby')).toBeNull();
    expect(ja.querySelector('.kids, .adult')).toBeNull();
  });
});
