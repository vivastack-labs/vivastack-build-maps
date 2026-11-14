import { cleanup, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { JapanMap } from '@/components/JapanMap';
import { LABEL_FONT_SIZE } from '@/features/map/prefPaths';
import { VIEWBOX } from '@/features/map/projection';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { plainText } from '@/lib/ruby';
import { textWithoutRuby } from './base-text';

const prefectures = publishedPrefectures();

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

describe('JapanMap の「準備中」の県（T3-02、4.11.4）', () => {
  // フィクスチャを本番の絞り込みにかける：北海道は内容を出す。東京都（混在）・沖縄県（未作成）などの46県は準備中
  const production = publishedPrefectures(FIXTURE_DIR, 'production');
  const pathOf = (container: HTMLElement, code: string) => container.querySelector(`path[data-pref="${code}"]`) as SVGPathElement;

  test('4.11.4: 準備中の県は斜線（pattern）で塗り、data-pending と aria-label の（準備中）が付く', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={production} />);

    for (const code of ['13', '47']) {
      const path = pathOf(container, code);
      expect(path.getAttribute('class')).toContain('fill-[url(#pref-pending-hatch)]');
      expect(path.getAttribute('class')).not.toContain('fill-region-');
      expect(path.hasAttribute('data-pending')).toBe(true);
    }
    expect(pathOf(container, '13').getAttribute('aria-label')).toBe('東京都（準備中）');
  });

  for (const lang of LANGS) {
    test(`4.11.4: 準備中の県の aria-label は「県名＋準備中の言い方」（${lang}）`, () => {
      const { container } = render(<JapanMap lang={lang} prefectures={production} />);

      const tokyo = production.find(prefecture => prefecture.code === '13');
      const suffix = plainText(getMessages(lang).comingSoon.indexSuffix);
      expect(pathOf(container, '13').getAttribute('aria-label')).toBe(`${plainText(tokyo?.name[lang] ?? '')}${suffix}`);
    });
  }

  test('4.11.4: 準備中でない県は地方の色で、data-pending も（準備中）もない', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={production} />);

    const hokkaido = pathOf(container, '01');
    expect(hokkaido.getAttribute('class')).toContain('fill-region-hokkaido');
    expect(hokkaido.getAttribute('class')).not.toContain('pending');
    expect(hokkaido.hasAttribute('data-pending')).toBe(false);
    expect(hokkaido.getAttribute('aria-label')).toBe('北海道');
  });

  test('4.11.4: 斜線の pattern が1つあり、地と線の色は @theme の変数のクラス', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={production} />);

    const patterns = container.querySelectorAll('defs pattern#pref-pending-hatch');
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.getAttribute('patternUnits')).toBe('userSpaceOnUse');
    expect(patterns[0]?.querySelector('rect')?.getAttribute('class')).toContain('fill-map-pending');
    expect(patterns[0]?.querySelector('line')?.getAttribute('class')).toContain('stroke-map-pending-stripe');
  });

  test('4.11.4: プレビュー（準備中の県がない）でも pattern は1つ、どの県も data-pending を持たない', () => {
    const { container } = render(<JapanMap lang="ja" prefectures={publishedPrefectures(FIXTURE_DIR, 'preview')} />);

    expect(container.querySelectorAll('path[data-pending]')).toHaveLength(0);
    expect(container.querySelectorAll('pattern#pref-pending-hatch')).toHaveLength(1);
    for (const path of container.querySelectorAll('path[data-pref]')) {
      expect(path.getAttribute('class')).not.toContain('fill-[url(');
    }
  });
});
