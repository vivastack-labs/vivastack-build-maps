import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardArea } from '@/components/CardArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { distanceText } from '@/i18n/cardText';
import { distancesFromTokyo, TOKYO_CODE } from '@/lib/distance';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = publishedPrefectures();
const distances = distancesFromTokyo(prefectures);

const renderCard = (lang: (typeof LANGS)[number]) =>
  render(
    <MapStateProvider>
      <CardArea lang={lang} prefectures={prefectures} distances={distances} />
    </MapStateProvider>
  );

describe('CardArea', () => {
  test.each(LANGS)('4.11.1・4.11.7（T3-06）：768px 未満でパネルが閉じている間に地図の下へ出す案内文（%s）。こども向け・おとな向けの両方で、パネルの前にある', lang => {
    // Arrange・Act
    const { container } = renderCard(lang);

    // Assert
    const guide = container.querySelector('[data-sheet-guide]') as HTMLElement;
    const messages = getMessages(lang).card.guide;
    expect(textWithoutRuby(guide.querySelector('.kids') as Element)).toBe(plainText(messages.kids));
    expect(textWithoutRuby(guide.querySelector('.adult') as Element)).toBe(plainText(messages.adult));
    // パネル（<section data-area="card">）の兄弟で、その前にある
    const section = container.querySelector('section[data-area="card"]') as HTMLElement;
    expect(guide.nextElementSibling).toBe(section);
    // パネルの中の案内文（data-card-guide）とは別の要素
    expect(section.contains(guide)).toBe(false);
  });

  test('F-CARD-03：県の距離がなければ例外（0 km と出さない）', () => {
    // Arrange・Act・Assert
    expect(() =>
      render(
        <MapStateProvider>
          <CardArea lang="ja" prefectures={prefectures} distances={new Map()} />
        </MapStateProvider>
      )
    ).toThrow('東京からの距離がありません');
  });

  test('6.6 (2)：47県のカードは CardSwitch の中の article#pref-NN で、最大化ボタンが1枚に1つある（T3-03）', () => {
    // Arrange・Act
    const { container } = renderCard('ja');

    // Assert
    const root = container.querySelector('[data-card-switch]') as HTMLElement;
    const cards = [...root.querySelectorAll<HTMLElement>('article[data-card-pref]')];
    expect(cards).toHaveLength(47);
    expect(cards.map(card => card.id)).toEqual(prefectures.map(({ code }) => `pref-${code}`));
    expect(cards.every(card => card.querySelectorAll('[data-card-maximize]').length === 1)).toBe(true);
    expect(root.querySelector('[data-card-guide]')).not.toBeNull();
  });

  test('T3-03・T3-09：「準備中」の県（本番）は準備中の文を出し、内容のある県は内容の差し込み先だけを出す（内容は JSON から描く）', () => {
    // Arrange・Act：本番の絞り込み。フィクスチャの北海道だけが内容を持つ
    const production = publishedPrefectures(FIXTURE_DIR, 'production');
    const { container } = render(
      <MapStateProvider>
        <CardArea lang="ja" prefectures={production} distances={distancesFromTokyo(production)} />
      </MapStateProvider>
    );

    // Assert：内容の差し込み先（JSON から描く。T3-09）は、準備中でない北海道だけ
    expect(container.querySelectorAll('[data-card-coming-soon]')).toHaveLength(46);
    expect(container.querySelectorAll('[data-card-body]')).toHaveLength(1);
    expect(container.querySelector('[data-card-pref="01"] [data-card-body="01"]')).not.toBeNull();
    expect(container.querySelector('[data-card-pref="01"] [data-card-sources-slot="01"]')).not.toBeNull();
    expect(container.querySelector('[data-card-pref="01"] [data-card-coming-soon]')).toBeNull();
    expect(container.querySelector('[data-card-item]')).toBeNull();
  });

  for (const lang of LANGS) {
    test(`4.11.1・F-MODE-04：CardArea は県を選ぶ前の案内文（${lang}）を、こども向け・おとな向けの両方で kids・adult のクラスをつけて出す`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const guide = container.querySelector('[data-card-guide]') as HTMLElement;
      expect(guide.hidden).toBe(false);
      expect(textWithoutRuby(guide.querySelector('.kids') as HTMLElement)).toBe(plainText(getMessages(lang).card.guide.kids));
      expect(textWithoutRuby(guide.querySelector('.adult') as HTMLElement)).toBe(plainText(getMessages(lang).card.guide.adult));
    });

    test(`F-CARD-01：47県の県名が hidden で出る（${lang}）`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const cards = [...container.querySelectorAll<HTMLElement>('[data-card-pref]')];
      expect(cards).toHaveLength(47);
      for (const [i, card] of cards.entries()) {
        const prefecture = prefectures[i];
        expect(card.getAttribute('data-card-pref')).toBe(prefecture?.code);
        expect(card.hidden).toBe(true);
        expect(textWithoutRuby(card.querySelector<HTMLElement>('[data-card-name]') as HTMLElement)).toBe(plainText(prefecture?.name[lang] ?? ''));
      }
    });

    test(`F-CARD-03：東京都以外の46県のカードに東京からの距離を出す（${lang}）`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const cards = [...container.querySelectorAll<HTMLElement>('[data-card-pref]')].filter(card => card.getAttribute('data-card-pref') !== TOKYO_CODE);
      expect(cards).toHaveLength(46);
      for (const card of cards) {
        const code = card.getAttribute('data-card-pref') ?? '';
        const distance = card.querySelector<HTMLElement>('[data-card-distance]');
        expect(distance, `${code} に距離の行がない`).not.toBeNull();
        expect(textWithoutRuby(distance as HTMLElement)).toBe(plainText(distanceText(lang, distances.get(code) ?? Number.NaN)));
      }
      // 沖縄県は 1,000km 以上なので、桁区切りが入る
      const okinawa = container.querySelector('[data-card-pref="47"] [data-card-distance]') as HTMLElement;
      expect(okinawa.textContent).toMatch(/1,5\d0/);
    });

    test(`F-CARD-03：東京都のカードには距離の行を出さない（基準の点。${lang}）`, () => {
      // Arrange・Act
      const { container } = renderCard(lang);

      // Assert
      const tokyo = container.querySelector(`[data-card-pref="${TOKYO_CODE}"]`) as HTMLElement;
      expect(tokyo.querySelector('[data-card-name]')).not.toBeNull();
      expect(tokyo.querySelector('[data-card-distance]')).toBeNull();
    });
  }
});
