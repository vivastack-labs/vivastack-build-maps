import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PrefCard } from '@/components/PrefCard';
import { distanceText, durationText } from '@/i18n/cardText';
import { LANGS, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { textWithoutRuby } from './base-text';

const preview = publishedPrefectures(FIXTURE_DIR, 'preview');
const production = publishedPrefectures(FIXTURE_DIR, 'production');

function prefOf(list: readonly PublishedPrefecture[], code: string): PublishedPrefecture {
  const found = list.find(p => p.code === code);
  if (found === undefined) throw new Error(`フィクスチャに県 ${code} がありません`);
  return found;
}

const hokkaido = prefOf(production, '01');
const tokyoPreview = prefOf(preview, '13');
const okinawaPending = prefOf(production, '47');

const renderCard = (lang: Lang, prefecture: PublishedPrefecture, distanceKm: number | null = 830) => render(<PrefCard lang={lang} prefecture={prefecture} distanceKm={distanceKm} />).container;

const text = (element: Element | null): string => textWithoutRuby(element as Element);
const q = (root: ParentNode, selector: string): HTMLElement => root.querySelector(selector) as HTMLElement;

describe('PrefCard', () => {
  test.each(LANGS)('F-CARD-02：見出しに地方名・県名・県庁所在地を出す（%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, hokkaido);

    // Assert
    const messages = getMessages(lang);
    expect(text(q(container, '[data-card-region]'))).toBe(plainText(messages.regions.hokkaido));
    const name = q(container, 'h2[data-card-name]');
    expect(text(name)).toBe(plainText(hokkaido.name[lang]));
    const capital = q(container, '[data-card-capital]');
    expect(text(capital)).toContain(plainText(messages.card.capital));
    expect(text(capital)).toContain(plainText(hokkaido.capital.name[lang]));
  });

  test('F-CARD-03：距離があれば距離の行を出し、null（東京都）なら出さない', () => {
    // Arrange・Act
    const withDistance = renderCard('en', hokkaido, 830);
    const withoutDistance = renderCard('ja', tokyoPreview, null);

    // Assert
    expect(text(q(withDistance, '[data-card-distance]'))).toBe(plainText(distanceText('en', 830)));
    expect(withoutDistance.querySelector('[data-card-distance]')).toBeNull();
    expect(withoutDistance.querySelector('[data-card-name]')).not.toBeNull();
  });

  test.each(LANGS)('F-CARD-04：行き方に絵文字・交通手段・経路・所要時間を出し、「目安」と書く（%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, hokkaido);

    // Assert
    const access = q(container, '[data-card-access]');
    const { access: accessItem } = hokkaido;
    expect(accessItem).toBeDefined();
    expect(text(access.querySelector('h3'))).toContain(plainText(getMessages(lang).card.access));
    const emoji = q(access, '[data-card-emoji]');
    expect(emoji.textContent).toBe('✈️');
    expect(emoji.getAttribute('aria-hidden')).toBe('true');
    expect(text(access)).toContain(plainText(accessItem?.mode[lang] ?? ''));
    expect(text(access)).toContain(plainText(accessItem?.route[lang] ?? ''));
    const duration = q(access, '[data-card-duration]');
    expect(text(duration)).toContain(plainText(getMessages(lang).card.durationLabel));
    expect(text(duration)).toContain(plainText(durationText(lang, 95)));
  });

  test('F-CARD-04：所要時間の目安は「1時間35分」のように出す（日本語）', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    expect(text(q(container, '[data-card-duration]'))).toContain('1時間35分');
    expect(container.querySelector('[data-card-duration] ruby')?.textContent).toContain('時間');
  });

  test.each(LANGS)('F-CARD-05：名物3つの絵文字・名前・解説を出す（%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, hokkaido);

    // Assert
    const section = q(container, '[data-card-specialties]');
    expect(text(section.querySelector('h3'))).toBe(plainText(getMessages(lang).card.specialties));
    const items = [...section.querySelectorAll<HTMLElement>('[data-card-item]')];
    expect(items).toHaveLength(3);
    for (const [i, item] of items.entries()) {
      const source = hokkaido.specialties[i];
      expect(item.getAttribute('data-card-item')).toBe(source?.id);
      expect(q(item, '[data-card-emoji]').textContent).toBe(source?.emoji);
      expect(text(q(item, 'strong'))).toBe(plainText(source?.name[lang] ?? ''));
      expect(text(q(item, '.kids'))).toBe(plainText(source?.description[lang].kids ?? ''));
    }
  });

  test.each(LANGS)('F-CARD-06：名所3つの名前・解説を出す（絵文字は任意。%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, hokkaido);

    // Assert
    const section = q(container, '[data-card-spots]');
    expect(text(section.querySelector('h3'))).toBe(plainText(getMessages(lang).card.spots));
    const items = [...section.querySelectorAll<HTMLElement>('[data-card-item]')];
    expect(items).toHaveLength(3);
    for (const [i, item] of items.entries()) {
      const source = hokkaido.spots[i];
      expect(text(q(item, 'strong'))).toBe(plainText(source?.name[lang] ?? ''));
      expect(text(q(item, '.adult'))).toBe(plainText(source?.description[lang].adult ?? ''));
      // フィクスチャの北海道の名所は絵文字なし。空の絵文字の要素を出さない
      expect(item.querySelector('[data-card-emoji]')).toBeNull();
    }
  });

  test('F-CARD-06：名所に絵文字があれば出す', () => {
    // Arrange：東京都の東京タワーは絵文字つき
    const container = renderCard('ja', tokyoPreview, null);

    // Assert
    const emojis = [...container.querySelectorAll('[data-card-spots] [data-card-emoji]')].map(e => e.textContent);
    expect(emojis).toEqual(['🗼']);
  });

  test('F-MODE-04：解説文はこども向け（.kids）とおとな向け（.adult）の両方を出す', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    const first = q(container, '[data-card-specialties] [data-card-item]');
    expect(text(q(first, '.kids'))).toBe(plainText(hokkaido.specialties[0]?.description.ja.kids ?? ''));
    expect(text(q(first, '.adult'))).toBe(plainText(hokkaido.specialties[0]?.description.ja.adult ?? ''));
    expect(text(q(first, '.kids'))).not.toBe(text(q(first, '.adult')));
  });

  test.each(LANGS)('4.11.4：準備中の県は行き方・名物・名所の代わりに「名物・名所は準備中です」を出す（県名・県庁所在地・距離は出す。%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, okinawaPending, 1550);

    // Assert
    expect(text(q(container, '[data-card-name]'))).toBe(plainText(okinawaPending.name[lang]));
    expect(container.querySelector('[data-card-capital]')).not.toBeNull();
    expect(text(q(container, '[data-card-distance]'))).toBe(plainText(distanceText(lang, 1550)));
    expect(text(q(container, '[data-card-coming-soon] .kids'))).toBe(plainText(getMessages(lang).comingSoon.card.kids));
    expect(text(q(container, '[data-card-coming-soon] .adult'))).toBe(plainText(getMessages(lang).comingSoon.card.adult));
    expect(container.querySelector('[data-card-access]')).toBeNull();
    expect(container.querySelector('[data-card-specialties]')).toBeNull();
    expect(container.querySelector('[data-card-spots]')).toBeNull();
    expect(container.querySelector('[data-card-item]')).toBeNull();
  });

  test('4.11.4：プレビューで名物・名所が空の県（フィクスチャの沖縄県）には、空の見出しと一覧を出さない', () => {
    // Arrange：プレビューは準備中にしないので、名物・名所が空の県は pending ではなく、空の配列のまま渡る
    const okinawaPreview = prefOf(preview, '47');
    expect(okinawaPreview.pending).toBe(false);
    expect(okinawaPreview.specialties).toHaveLength(0);

    // Act
    const container = renderCard('ja', okinawaPreview, 1550);

    // Assert
    expect(container.querySelector('[data-card-specialties]')).toBeNull();
    expect(container.querySelector('[data-card-spots]')).toBeNull();
    expect(container.querySelector('[data-card-access]')).toBeNull();
    expect(container.querySelector('h3')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('[data-card-name]')).not.toBeNull();
    expect(container.querySelector('[data-card-maximize]')).not.toBeNull();
  });

  test('4.11.4：内容を出す県には「準備中」の文を出さない', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    expect(container.querySelector('[data-card-coming-soon]')).toBeNull();
  });

  test('7.1：draft の項目にだけ「下書き」の印を出す（本番の県には出ない）', () => {
    // Arrange・Act：東京都は、名物の2つ目・3つ目と名所の2つ目が reviewed でない（フィクスチャ）
    const draftCard = renderCard('ja', tokyoPreview, null);
    const productionCard = renderCard('ja', hokkaido);

    // Assert
    const marked = [...draftCard.querySelectorAll('[data-card-item]')].map(item => item.querySelector('[data-card-draft]') !== null);
    const expected = [...tokyoPreview.specialties, ...tokyoPreview.spots].map(item => item.draft);
    expect(marked).toEqual(expected);
    expect(marked.filter(Boolean)).toHaveLength(3);
    expect(text(q(draftCard, '[data-card-draft]'))).toBe('下書き');
    expect(productionCard.querySelector('[data-card-draft]')).toBeNull();
  });

  test('7.1：行き方が draft なら、行き方の見出しに「下書き」の印を出す', () => {
    // Arrange
    const access = tokyoPreview.access;
    if (access === undefined) throw new Error('東京都に行き方がありません');
    const drafted: PublishedPrefecture = { ...tokyoPreview, access: { ...access, draft: true } };

    // Act
    const container = renderCard('en', drafted, null);

    // Assert
    expect(text(q(container, '[data-card-access] h3 [data-card-draft]'))).toBe('Draft');
  });

  test.each(LANGS)('F-CARD-08：最大化ボタンを hidden で出し、両方の文言（最大化・元に戻す）を持つ（準備中の県にも出す。%s）', lang => {
    for (const prefecture of [hokkaido, okinawaPending]) {
      // Arrange・Act
      const container = renderCard(lang, prefecture);

      // Assert
      const button = q(container, '[data-card-maximize]');
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('data-card-maximize')).toBe(prefecture.code);
      expect(button.hidden).toBe(true);
      const messages = getMessages(lang);
      expect(text(q(button, '[data-label-maximize]'))).toBe(plainText(messages.card.maximize));
      expect(text(q(button, '[data-label-restore]'))).toBe(plainText(messages.card.restore));
      expect(q(button, '[data-label-maximize]').hidden).toBe(false);
      expect(q(button, '[data-label-restore]').hidden).toBe(true);
    }
  });

  test('6.6 (2)：カードに id="pref-NN" と data-card-pref と hidden を付ける', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    const card = q(container, 'article');
    expect(card.id).toBe('pref-01');
    expect(card.getAttribute('data-card-pref')).toBe('01');
    expect(card.hidden).toBe(true);
  });
});
