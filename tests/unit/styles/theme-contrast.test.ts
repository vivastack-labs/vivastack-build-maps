import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { contrastRatio } from '@/lib/contrast';

// 5.2（T4-03）：app/globals.css の色の変数から、文字と塗りのコントラスト比を計算する。色を足す・変えると、ここで自動的に確かめられる。
const CSS = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8');

const TEXT_MIN = 4.5; // WCAG 1.4.3
const SLATE_950 = '#020617'; // Tailwind の text-slate-950

/** `{` の位置から、対応する `}` までの中身を返す */
function blockAfter(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`globals.css に ${marker} がありません`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`globals.css の ${marker} の波括弧が閉じていません`);
}

/** `--color-NAME: #hex;` を、名前（`--color-` を除く）→ 値の Map にする */
function colorsIn(block: string): ReadonlyMap<string, string> {
  return new Map([...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/gu)].map(m => [m[1] as string, m[2] as string]));
}

const light = new Map([...CSS.matchAll(/@theme\s*\{/gu)].flatMap(m => [...colorsIn(blockAfter(CSS.slice(m.index), '@theme'))]));
const dark = new Map([...light, ...colorsIn(blockAfter(CSS, '@media (prefers-color-scheme: dark)'))]);

const REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'] as const;
const MUNI = ['muni-0', 'muni-1', 'muni-2', 'muni-3', 'muni-4', 'muni-hover'] as const;

/** 名前の色を引く。なければ例外 */
function color(theme: ReadonlyMap<string, string>, name: string): string {
  const value = theme.get(name);
  if (value === undefined) throw new Error(`色の変数 --color-${name} がありません`);
  return value;
}

describe.each([
  ['ライト', light],
  ['ダーク', dark]
] as const)('5.2：%s のコントラスト', (_name, theme) => {
  const ratio = (foreground: string, background: string): number => contrastRatio(color(theme, foreground), color(theme, background));

  test.each(REGIONS)('県名ラベルと地方（%s）の塗りが 4.5:1 以上', region => {
    expect(ratio('map-label', `region-${region}`)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('県名ラベルと準備中の地・斜線の線が 4.5:1 以上', () => {
    expect(ratio('map-label', 'map-pending')).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(ratio('map-label', 'map-pending-stripe')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('固定中の県のラベルと固定中の県の塗りが 4.5:1 以上', () => {
    expect(ratio('map-selected-label', 'map-selected')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('固定中の塗りの上の文字（text-slate-950 #020617。切替のボタン・さくいんの項目）が 4.5:1 以上', () => {
    expect(contrastRatio(SLATE_950, color(theme, 'map-selected'))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('海域名と海が 4.5:1 以上', () => {
    expect(ratio('map-sea-label', 'map-sea')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test.each(MUNI)('市区町村のラベルと %s の塗りが 4.5:1 以上', fill => {
    expect(ratio('map-label', fill)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('ツールチップの文字と背景、ページの文字と背景が 4.5:1 以上', () => {
    expect(ratio('tooltip-text', 'tooltip-bg')).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(ratio('page-text', 'page-bg')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('地図の線・枠が海と 3:1 以上（WCAG 1.4.11）', () => {
    expect(ratio('map-border', 'map-sea')).toBeGreaterThanOrEqual(3);
    expect(ratio('map-frame', 'map-sea')).toBeGreaterThanOrEqual(3);
  });
});
