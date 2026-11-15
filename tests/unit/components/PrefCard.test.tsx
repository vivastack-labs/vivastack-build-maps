import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PrefCard } from '@/components/PrefCard';
import { distanceText } from '@/i18n/cardText';
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
  test('4.11.6（T3-06）：県名の h2 は tabIndex=-1（パネルを開いたときにフォーカスを受ける）', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    expect(q(container, 'h2[data-card-name]').getAttribute('tabindex')).toBe('-1');
  });

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

  test('4.11.4：内容を出す県には「準備中」の文を出さない', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    expect(container.querySelector('[data-card-coming-soon]')).toBeNull();
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

  test('D38：サーバーの HTML に、行き方・名物・名所・出典の内容を入れない（JSON から描く差し込み先だけを出す）', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    for (const selector of ['[data-card-access]', '[data-card-specialties]', '[data-card-spots]', '[data-card-item]', '[data-card-sources]', 'h3', 'ul']) {
      expect(container.querySelector(selector), selector).toBeNull();
    }
    const html = container.innerHTML;
    for (const item of [...hokkaido.specialties, ...hokkaido.spots]) expect(html).not.toContain(item.description.ja.adult);
    expect(html).not.toContain(hokkaido.access?.route.ja ?? '');
  });

  test('D38：内容を出す県には、行き方などの差し込み先（data-card-body）と出典の差し込み先（data-card-sources-slot）を出す', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert：差し込み先は data-sheet-detail（パネルが一部だけ見える状態で隠す。T3-06）
    const body = q(container, '[data-card-body]');
    const sources = q(container, '[data-card-sources-slot]');
    expect(body.getAttribute('data-card-body')).toBe('01');
    expect(sources.getAttribute('data-card-sources-slot')).toBe('01');
    expect(body.hasAttribute('data-sheet-detail')).toBe(true);
    expect(sources.hasAttribute('data-sheet-detail')).toBe(true);
    expect(sources.children).toHaveLength(0);
  });

  test('4.11.7：差し込み先の並びは「距離 → 内容 → 最大化ボタン → 出典」（出典は最大化ボタンの後。F-SRC-01）', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert
    const order = [...q(container, 'article').children].map(child => child.getAttributeNames().find(name => name.startsWith('data-card-')));
    expect(order).toEqual(['data-card-region', 'data-card-name', 'data-card-capital', 'data-card-distance', 'data-card-body', 'data-card-maximize', 'data-card-sources-slot']);
  });

  test.each(LANGS)('5.3：JavaScript がないときのために、内容の差し込み先に「JavaScript を有効にすると読めます」の文を出す（こども向け・おとな向け。%s）', lang => {
    // Arrange・Act
    const container = renderCard(lang, hokkaido);

    // Assert
    const message = q(container, '[data-card-body] [data-card-needs-script]');
    const { needsScript } = getMessages(lang).card;
    expect(text(q(message, '.kids'))).toBe(plainText(needsScript.kids));
    expect(text(q(message, '.adult'))).toBe(plainText(needsScript.adult));
  });

  test('5.3：「JavaScript を有効にすると読めます」の文は、JavaScript が無効のとき（scripting: none）だけ見せる（noscript: のバリアント。JavaScript が有効な人にハイドレーション前に見せない）', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);

    // Assert：ふだんは hidden、noscript のときだけ block
    const classes = q(container, '[data-card-needs-script]').className.split(' ');
    expect(classes).toContain('hidden');
    expect(classes).toContain('noscript:block');
  });

  test('4.11.4：準備中の県には差し込み先を出さない（読み込まない）', () => {
    // Arrange・Act
    const container = renderCard('ja', okinawaPending);

    // Assert
    expect(container.querySelector('[data-card-body]')).toBeNull();
    expect(container.querySelector('[data-card-sources-slot]')).toBeNull();
    expect(container.querySelector('[data-card-needs-script]')).toBeNull();
  });

  test('4.11.4：プレビューで名物・名所が空の県にも差し込み先を出す（JSON は空の内容になり、何も描かない）', () => {
    // Arrange：プレビューは準備中にしない
    const okinawaPreview = prefOf(preview, '47');
    expect(okinawaPreview.pending).toBe(false);

    // Act
    const container = renderCard('ja', okinawaPreview, 1550);

    // Assert
    expect(container.querySelector('[data-card-body]')).not.toBeNull();
    expect(container.querySelector('[data-card-name]')).not.toBeNull();
    expect(container.querySelector('[data-card-maximize]')).not.toBeNull();
  });

  test('4.11.7（T3-06）：パネルが一部だけ見える状態で隠す部分（内容・出典の差し込み先・「準備中」の文）に data-sheet-detail を付け、見出しと最大化ボタンには付けない', () => {
    // Arrange・Act
    const container = renderCard('ja', hokkaido);
    const pending = renderCard('ja', okinawaPending);

    // Assert
    const detailKeys = [...container.querySelectorAll('[data-sheet-detail]')].map(element => element.getAttributeNames().find(name => name.startsWith('data-card-')));
    expect(detailKeys).toEqual(['data-card-body', 'data-card-sources-slot']);
    for (const selector of ['[data-card-region]', '[data-card-name]', '[data-card-capital]', '[data-card-distance]', '[data-card-maximize]']) {
      expect(q(container, selector).hasAttribute('data-sheet-detail'), selector).toBe(false);
    }
    expect(q(pending, '[data-card-coming-soon]').hasAttribute('data-sheet-detail')).toBe(true);
  });
});
