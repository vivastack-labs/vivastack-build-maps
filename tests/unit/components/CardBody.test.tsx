import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardBody } from '@/components/CardBody';
import { cardData } from '@/features/card/cardData';
import { cardDetailLabels, durationText } from '@/i18n/cardText';
import { LANGS, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { textWithoutRuby } from './base-text';

const preview = publishedPrefectures(FIXTURE_DIR, 'preview');
const production = publishedPrefectures(FIXTURE_DIR, 'production');
const prefOf = (list: readonly PublishedPrefecture[], code: string) => list.find(p => p.code === code) as PublishedPrefecture;

const hokkaido = prefOf(production, '01');
const tokyoPreview = prefOf(preview, '13');
const okinawaPreview = prefOf(preview, '47');

const renderBody = (lang: Lang, prefecture: PublishedPrefecture) => render(<CardBody data={cardData(prefecture, lang)} labels={cardDetailLabels(lang)} />).container;

const text = (element: Element | null): string => textWithoutRuby(element as Element);
const q = (root: ParentNode, selector: string): HTMLElement => root.querySelector(selector) as HTMLElement;

// 行き方・名物・名所は、JSON（cardData）から描く（T3-09、D38）。サーバーの HTML には入らない
describe('CardBody', () => {
  test.each(LANGS)('F-CARD-04：行き方に絵文字・交通手段・経路・所要時間を出し、「目安」と書く（%s）', lang => {
    // Arrange・Act
    const container = renderBody(lang, hokkaido);

    // Assert
    const access = q(container, '[data-card-access]');
    const { access: accessItem } = hokkaido;
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
    const container = renderBody('ja', hokkaido);

    expect(text(q(container, '[data-card-duration]'))).toContain('1時間35分');
    expect(container.querySelector('[data-card-duration] ruby')?.textContent).toContain('時間');
  });

  test.each(LANGS)('F-CARD-05：名物3つの絵文字・名前・解説を出す（%s）', lang => {
    // Arrange・Act
    const container = renderBody(lang, hokkaido);

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
    const container = renderBody(lang, hokkaido);

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
    const container = renderBody('ja', tokyoPreview);

    const emojis = [...container.querySelectorAll('[data-card-spots] [data-card-emoji]')].map(e => e.textContent);
    expect(emojis).toEqual(['🗼']);
  });

  test('F-MODE-04：解説文はこども向け（.kids）とおとな向け（.adult）の両方を出す', () => {
    const container = renderBody('ja', hokkaido);

    const first = q(container, '[data-card-specialties] [data-card-item]');
    expect(text(q(first, '.kids'))).toBe(plainText(hokkaido.specialties[0]?.description.ja.kids ?? ''));
    expect(text(q(first, '.adult'))).toBe(plainText(hokkaido.specialties[0]?.description.ja.adult ?? ''));
    expect(text(q(first, '.kids'))).not.toBe(text(q(first, '.adult')));
  });

  test('4.11.4：プレビューで名物・名所が空の県（フィクスチャの沖縄県）には、空の見出しと一覧を出さない', () => {
    const container = renderBody('ja', okinawaPreview);

    expect(container.innerHTML).toBe('');
  });

  test('7.1：draft の項目にだけ「下書き」の印を出す（本番の県には出ない）', () => {
    // Arrange・Act：東京都は、名物の2つ目・3つ目と名所の2つ目が reviewed でない（フィクスチャ）
    const draftBody = renderBody('ja', tokyoPreview);
    const productionBody = renderBody('ja', hokkaido);

    // Assert
    const marked = [...draftBody.querySelectorAll('[data-card-item]')].map(item => item.querySelector('[data-card-draft]') !== null);
    const expected = [...tokyoPreview.specialties, ...tokyoPreview.spots].map(item => item.draft);
    expect(marked).toEqual(expected);
    expect(marked.filter(Boolean)).toHaveLength(3);
    expect(text(q(draftBody, '[data-card-draft]'))).toBe('下書き');
    expect(productionBody.querySelector('[data-card-draft]')).toBeNull();
  });

  test('7.1：行き方が draft なら、行き方の見出しに「下書き」の印を出す', () => {
    // Arrange
    const data = cardData(tokyoPreview, 'en');
    const drafted = { ...data, access: { ...(data.access as NonNullable<typeof data.access>), draft: true } };

    // Act
    const { container } = render(<CardBody data={drafted} labels={cardDetailLabels('en')} />);

    // Assert
    expect(text(q(container, '[data-card-access] h3 [data-card-draft]'))).toBe('Draft');
  });

  test('D38：ふりがなの記法の誤りを含む JSON は、描くときに例外になる（黙って壊れた表示にしない）', () => {
    const data = cardData(hokkaido, 'ja');
    const broken = { ...data, specialties: data.specialties.map(item => ({ ...item, name: '{壊れ' })) };

    expect(() => render(<CardBody data={broken} labels={cardDetailLabels('ja')} />)).toThrow();
  });
});
