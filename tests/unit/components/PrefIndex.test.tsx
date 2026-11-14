import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PrefIndex } from '@/components/PrefIndex';
import { REGIONS } from '@/features/map/regions';
import { LANGS, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = publishedPrefectures();

const renderIndex = (lang: Lang) => render(<PrefIndex lang={lang} prefectures={prefectures} />);

describe('PrefIndex', () => {
  for (const lang of LANGS) {
    test(`F-IDX-01: 8地方の見出し（h3）を地方の順に出す（${lang}）`, () => {
      // Arrange・Act
      const { container } = renderIndex(lang);

      // Assert
      const headings = [...container.querySelectorAll('h3')];
      expect(headings.map(heading => textWithoutRuby(heading))).toEqual(REGIONS.map(region => plainText(getMessages(lang).regions[region])));
      expect(container.querySelectorAll('[data-index-region]')).toHaveLength(8);
    });

    test(`項目の県名は言語ごとの名前（${lang}）`, () => {
      const { container } = renderIndex(lang);

      for (const prefecture of prefectures) {
        const item = container.querySelector(`a[data-pref="${prefecture.code}"]`);
        expect(item).not.toBeNull();
        expect(textWithoutRuby(item as Element)).toBe(plainText(prefecture.name[lang]));
      }
    });
  }

  test('F-IDX-01: 47県の項目を、地方ごとに県コードの順に出す', () => {
    const { container } = renderIndex('ja');

    for (const region of REGIONS) {
      const section = container.querySelector(`[data-index-region="${region}"]`) as Element;
      const codes = [...section.querySelectorAll('a[data-pref]')].map(item => item.getAttribute('data-pref'));
      const expected = prefectures.filter(prefecture => prefecture.region === region).map(prefecture => prefecture.code);
      expect(codes).toEqual(expected);
      expect(codes.length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('a[data-pref]')).toHaveLength(47);
  });

  test('6.6 (2): 項目は href="#pref-NN" の a で、role="button"・aria-pressed="false"・data-pref・tabindex="0" を持つ', () => {
    const { container } = renderIndex('ja');

    for (const item of container.querySelectorAll('a[data-pref]')) {
      const code = item.getAttribute('data-pref');
      expect(item.getAttribute('href')).toBe(`#pref-${code}`);
      expect(item.getAttribute('role')).toBe('button');
      expect(item.getAttribute('aria-pressed')).toBe('false');
      expect(item.getAttribute('tabindex')).toBe('0');
    }
  });

  test('色見本は飾りなので、スクリーンリーダーには読ませない', () => {
    const { container } = renderIndex('ja');

    for (const region of REGIONS) {
      const swatch = container.querySelector(`[data-index-region="${region}"] [data-swatch]`);
      expect(swatch?.getAttribute('class')).toContain(`bg-region-${region}`);
      expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  describe('準備中の県（T3-02、4.11.4）', () => {
    const production = publishedPrefectures(FIXTURE_DIR, 'production');

    for (const lang of LANGS) {
      test(`4.11.4: 準備中の県のボタンに（準備中）が付く（${lang}）`, () => {
        const { container } = render(<PrefIndex lang={lang} prefectures={production} />);

        const tokyo = production.find(prefecture => prefecture.code === '13');
        const item = container.querySelector('a[data-pref="13"]') as HTMLElement;
        const suffix = item.querySelector('[data-index-pending]');
        expect(suffix).not.toBeNull();
        expect(textWithoutRuby(suffix as Element)).toBe(plainText(getMessages(lang).comingSoon.indexSuffix));
        expect(textWithoutRuby(item)).toBe(`${plainText(tokyo?.name[lang] ?? '')}${plainText(getMessages(lang).comingSoon.indexSuffix)}`);
      });
    }

    test('4.11.4: 準備中でない県（北海道）には付かない。プレビューではどの県にも付かない', () => {
      const { container, unmount } = render(<PrefIndex lang="ja" prefectures={production} />);
      expect(container.querySelector('a[data-pref="01"] [data-index-pending]')).toBeNull();
      expect(container.querySelectorAll('[data-index-pending]')).toHaveLength(46);
      unmount();

      const preview = render(<PrefIndex lang="ja" prefectures={publishedPrefectures(FIXTURE_DIR, 'preview')} />);
      expect(preview.container.querySelectorAll('[data-index-pending]')).toHaveLength(0);
    });
  });
});
