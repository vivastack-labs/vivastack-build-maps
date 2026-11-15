import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardSources } from '@/components/CardSources';
import { cardData } from '@/features/card/cardData';
import { cardDetailLabels } from '@/i18n/cardText';
import { formatDate } from '@/i18n/format';
import { LANGS, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { textWithoutRuby } from './base-text';

const production = publishedPrefectures(FIXTURE_DIR, 'production');
const hokkaido = production.find(p => p.code === '01') as PublishedPrefecture;
const okinawa = publishedPrefectures(FIXTURE_DIR, 'preview').find(p => p.code === '47') as PublishedPrefecture;

const renderSources = (lang: Lang, prefecture: PublishedPrefecture = hokkaido) => render(<CardSources data={cardData(prefecture, lang)} labels={cardDetailLabels(lang)} />).container;

const text = (element: Element | null): string => textWithoutRuby(element as Element);
const q = (root: ParentNode, selector: string): HTMLElement => root.querySelector(selector) as HTMLElement;
const itemOf = (root: ParentNode, key: string): HTMLElement => q(root, `[data-source-item="${key}"]`);

// 出典欄は、JSON（cardData）から描く（T3-09、D38）
describe('CardSources', () => {
  test('F-SRC-02：出典のある項目は、タイトル・URL・確認日を表示する', () => {
    const container = renderSources('ja');

    const sources = [...itemOf(container, 'access').querySelectorAll<HTMLElement>('[data-source]')];
    expect(sources).toHaveLength(2);
    const [first, second] = sources as [HTMLElement, HTMLElement];
    const link = q(first, 'a');
    expect(link.getAttribute('href')).toBe('https://example.com/hokkaido/access-a');
    expect(text(link)).toBe('空の旅のガイド（テスト用）');
    expect(link.querySelector('ruby')).not.toBeNull();
    expect(text(q(first, '[data-source-url]'))).toBe('https://example.com/hokkaido/access-a');
    expect(text(q(first, '[data-source-accessed]'))).toBe('確認日：2026年11月15日');
    expect(text(q(second, '[data-source-accessed]'))).toBe('確認日：2026年10月1日');
  });

  test('F-SRC-03：sources: [] の項目は「出典なし」と表示する', () => {
    const container = renderSources('ja');

    const milk = itemOf(container, 'specialties/milk');
    expect(text(q(milk, '[data-source-none]'))).toBe('出典なし');
    expect(milk.querySelector('a')).toBeNull();
    expect(milk.querySelector('[data-source]')).toBeNull();
    expect(itemOf(container, 'specialties/potato').querySelector('[data-source-none]')).toBeNull();
  });

  test('F-SRC-01：「出典」欄は、最初は閉じている', () => {
    const container = renderSources('ja');

    const details = q(container, 'details[data-card-sources]');
    expect(details.hasAttribute('open')).toBe(false);
    expect(text(q(details, 'summary'))).toBe('出典');
  });

  test('判断4：外部へのリンクに rel="noopener noreferrer" と target="_blank" を付ける', () => {
    const container = renderSources('en');

    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  test.each(LANGS)('F-SRC-02：行き方・名物・名所の順に、項目の名前で並べる（%s）', lang => {
    const container = renderSources(lang);

    const items = [...container.querySelectorAll<HTMLElement>('[data-source-item]')];
    const keys = [...hokkaido.specialties.map(s => `specialties/${s.id}`), ...hokkaido.spots.map(s => `spots/${s.id}`)];
    expect(items.map(item => item.getAttribute('data-source-item'))).toEqual(['access', ...keys]);
    expect(items).toHaveLength(7);
    const heading = (item: HTMLElement) => text(q(item, '[data-source-item-name]'));
    expect(heading(items[0] as HTMLElement)).toBe(plainText(getMessages(lang).card.access));
    expect(heading(items[1] as HTMLElement)).toBe(plainText(hokkaido.specialties[0]?.name[lang] ?? ''));
    expect(heading(items[4] as HTMLElement)).toBe(plainText(hokkaido.spots[0]?.name[lang] ?? ''));
  });

  test('F-SRC-02：英語のページは英語の文言と書式で出す', () => {
    const container = renderSources('en');

    expect(text(q(container, 'summary'))).toBe('Sources');
    expect(text(q(itemOf(container, 'specialties/milk'), '[data-source-none]'))).toBe('No source');
    expect(text(q(itemOf(container, 'specialties/potato'), '[data-source-accessed]'))).toBe('Accessed: November 3, 2026');
    expect(formatDate('en', '2026-11-03')).toBe('November 3, 2026');
  });

  test('中国語のページは中国語の文言で出す', () => {
    const container = renderSources('zh');

    expect(text(q(container, 'summary'))).toBe('出处');
    expect(text(q(itemOf(container, 'specialties/milk'), '[data-source-none]'))).toBe('无出处');
    expect(text(q(itemOf(container, 'specialties/potato'), '[data-source-accessed]'))).toBe('确认日期：2026年11月3日');
  });

  test('4.11.4：項目が1つもなければ何も出さない', () => {
    expect(renderSources('ja', okinawa).innerHTML).toBe('');
  });

  test('行き方がなく名物・名所だけの県でも出す', () => {
    const data = cardData(hokkaido, 'ja');
    const withoutAccess = { code: data.code, specialties: data.specialties, spots: data.spots };

    const { container } = render(<CardSources data={{ ...withoutAccess, spots: [] }} labels={cardDetailLabels('ja')} />);

    expect(container.querySelector('[data-source-item="access"]')).toBeNull();
    expect(container.querySelectorAll('[data-source-item]')).toHaveLength(3);
  });

  test.each(['en', 'zh'] as const)('F-SRC-02：ja 以外のページでは、出典のタイトルは読みなしの文字（%s）', lang => {
    const container = renderSources(lang);

    const link = q(itemOf(container, 'access'), 'a');
    expect(link.textContent).toBe('空の旅のガイド（テスト用）');
    expect(container.querySelector('ruby, rt')).toBeNull();
  });
});
