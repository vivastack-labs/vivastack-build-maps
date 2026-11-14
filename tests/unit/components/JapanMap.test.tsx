import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { JapanMap } from '@/components/JapanMap';
import { VIEWBOX } from '@/features/map/projection';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { loadContent } from '@/lib/content';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = loadContent();

describe('JapanMap', () => {
  for (const lang of LANGS) {
    test(`5.2：県のパスが47個あり、role="button" と aria-label（ふりがなを除いた県名）を持つ（${lang}）`, () => {
      // Arrange・Act
      const { container } = render(<JapanMap lang={lang} prefectures={prefectures} />);

      // Assert
      const paths = [...container.querySelectorAll('path[data-pref]')];
      expect(paths).toHaveLength(47);
      for (const [i, path] of paths.entries()) {
        const prefecture = prefectures[i];
        expect(path.getAttribute('data-pref')).toBe(prefecture?.code);
        expect(path.getAttribute('role')).toBe('button');
        expect(path.getAttribute('aria-label')).toBe(plainText(prefecture?.name[lang] ?? ''));
        expect(path.getAttribute('d')).toMatch(/^M/u);
      }
    });
  }

  test('5.2：県のパスはどれも aria-pressed="false" で始まる（固定の状態はクライアントが書き換える）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const paths = [...container.querySelectorAll('path[data-pref]')];
    expect(paths).toHaveLength(47);
    for (const path of paths) {
      expect(path.getAttribute('aria-pressed')).toBe('false');
      expect(path.hasAttribute('data-state')).toBe(false);
    }
  });

  test('D26：県のパスに、ホバー・固定の見た目のクラスがある', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const className = container.querySelector('path[data-pref="13"]')?.getAttribute('class') ?? '';
    expect(className).toContain('cursor-pointer');
    expect(className).toContain('hover:opacity-80');
    expect(className).toContain('aria-pressed:fill-map-selected');
  });

  test('F-MAP-01：県のパスの data-region がコンテンツの地方と同じである', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    for (const prefecture of prefectures) {
      const path = container.querySelector(`path[data-pref="${prefecture.code}"]`);
      expect(path?.getAttribute('data-region')).toBe(prefecture.region);
      expect(path?.getAttribute('class')).toContain(`fill-region-${prefecture.region}`);
    }
  });

  test('5.2：地図の svg は viewBox と、言語ごとの名前（ふりがなを除く）を持つ', () => {
    for (const lang of LANGS) {
      const { container, unmount } = render(<JapanMap lang={lang} prefectures={prefectures} />);

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);
      expect(svg?.getAttribute('role')).toBe('group');
      expect(svg?.getAttribute('aria-label')).toBe(plainText(getMessages(lang).map.label));
      expect(svg?.querySelector('[data-map-layer]')).not.toBeNull();
      unmount();
    }
  });

  test('F-MAP-06：海域名（日本海・太平洋）を、その言語で出す', () => {
    for (const lang of LANGS) {
      const { container, unmount } = render(<JapanMap lang={lang} prefectures={prefectures} />);

      const seas = [...container.querySelectorAll('[data-sea-label]')];
      const { japanSea, pacific } = getMessages(lang).seas;
      expect(seas.map(sea => textWithoutRuby(sea))).toEqual([plainText(japanSea), plainText(pacific)]);
      unmount();
    }
  });

  test('F-MAP-02：沖縄県の点線枠がある', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const frame = container.querySelector('[data-okinawa-frame]');
    expect(frame?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(frame?.getAttribute('fill')).toBe('none');
  });

  test('5.2：県名ラベルは aria-hidden である（パスの aria-label と重複するため）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const labels = container.querySelector('[data-pref-labels]');
    expect(labels?.getAttribute('aria-hidden')).toBe('true');
    expect(labels?.querySelectorAll('text')).toHaveLength(47);
  });

  test('F-MAP-01：県名ラベルは「都・府・県」（中国語は「县」）を省き、北海道はそのまま出す', () => {
    const label = (lang: 'ja' | 'en' | 'zh', code: string) => {
      const { container, unmount } = render(<JapanMap lang={lang} prefectures={prefectures} />);
      const text = container.querySelector(`[data-pref-label="${code}"]`)?.textContent;
      unmount();
      return text;
    };

    expect(label('ja', '01')).toBe('北海道');
    expect(label('ja', '13')).toBe('東京');
    expect(label('ja', '26')).toBe('京都');
    expect(label('ja', '27')).toBe('大阪');
    expect(label('ja', '02')).toBe('青森');
    expect(label('zh', '13')).toBe('东京');
    expect(label('zh', '02')).toBe('青森');
    expect(label('en', '13')).toBe('Tokyo');
  });

  test('F-MAP-01：県名ラベルは幅820px以下で隠す（max-map-label:hidden）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    expect(container.querySelector('[data-pref-labels]')?.getAttribute('class')).toContain('max-map-label:hidden');
  });
});

describe('JapanMap のタッチ操作', () => {
  test('4.11.3：<svg> は touch-action: none（touch-none）で、指のドラッグ・ピンチをブラウザのスクロール・拡大に取られない', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('touch-none');
  });
});

describe('JapanMap の入力の確かめ', () => {
  test('F-MAP-01：コンテンツの県コードからパスを引けないときは、パスのない県を描かずに例外にする', () => {
    // Arrange：県コードの形は正しいが、地図のデータにない県（99）
    const first = prefectures[0];
    if (!first) throw new Error('県がない');
    const unknown = { ...first, code: '99' } as unknown as (typeof prefectures)[number];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act・Assert
    expect(() => render(<JapanMap lang="ja" prefectures={[...prefectures, unknown]} />)).toThrow(/99/u);
    vi.restoreAllMocks();
  });
});
