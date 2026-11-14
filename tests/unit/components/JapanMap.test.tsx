import { cleanup, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { JapanMap } from '@/components/JapanMap';
import { LABEL_FONT_SIZE } from '@/features/map/prefPaths';
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

  test('F-KB-01：県のパスは北海道だけ tabindex=0、ほかは -1（サーバーの出力。Tab の停止位置が1つ）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const paths = [...container.querySelectorAll('path[data-pref]')];
    expect(paths).toHaveLength(47);
    for (const path of paths) {
      expect(path.getAttribute('tabindex')).toBe(path.getAttribute('data-pref') === '01' ? '0' : '-1');
    }
  });

  test('2.4.7：県のパスに focus-visible の outline のクラスがある（太さは倍率で割る）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const className = container.querySelector('path[data-pref="13"]')?.getAttribute('class') ?? '';
    expect(className).toContain('focus-visible:outline-solid');
    expect(className).toContain('focus-visible:outline-slate-900');
    expect(className).toContain('dark:focus-visible:outline-slate-50');
    expect(className).toContain('var(--zoom-k');
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

describe('JapanMap の拡大しても変わらない大きさ（T2-06）', () => {
  const pattern = (px: number) => new RegExp(`^calc\\(${px}px / var\\(--zoom-k, 1\\)\\)$`, 'u');

  test('F-ZOOM-01：県名ラベル・海域名の文字の大きさは、言語ごとの基準を --zoom-k で割る（倍率1・JavaScript なしでは今と同じ）', () => {
    for (const lang of LANGS) {
      const { container } = render(<JapanMap lang={lang} prefectures={prefectures} />);

      const labels = container.querySelector('[data-pref-labels]') as SVGGElement;
      expect(labels.style.fontSize).toMatch(pattern(LABEL_FONT_SIZE[lang]));
      for (const sea of container.querySelectorAll<SVGTextElement>('[data-sea-label]')) {
        expect(sea.style.fontSize).toMatch(pattern(24));
      }
      cleanup();
    }
  });

  test('F-ZOOM-01：県境の線と沖縄の枠の太さは、--zoom-k で割る（画面の上の太さを保つ）', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const borders = container.querySelector('[data-map-layer] > g.stroke-map-border') as SVGGElement;
    expect(borders.style.strokeWidth).toMatch(pattern(0.8));
    expect((container.querySelector('[data-okinawa-frame]') as SVGRectElement).style.strokeWidth).toMatch(pattern(1.5));
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

  test('T2-08：children は地図の層（data-map-layer）の最後（県名ラベルの上）に置かれる', () => {
    const { container } = render(
      <JapanMap lang="ja" prefectures={prefectures}>
        <g data-test-child />
      </JapanMap>
    );

    const layer = container.querySelector('[data-map-layer]') as SVGGElement;
    expect(layer.lastElementChild?.hasAttribute('data-test-child')).toBe(true);
  });

  test('F-MUNI-04：県のパスは、最大化中は最大化した県以外を薄くするクラスを持つ', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={prefectures} />);

    const path = container.querySelector('path[data-pref]') as SVGPathElement;
    expect(path.getAttribute('class')).toContain('opacity-40');
    expect(container.querySelector('[data-pref-label]')?.getAttribute('class')).toContain('data-[state=maximized]:hidden');
  });
});
