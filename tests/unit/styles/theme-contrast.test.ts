import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { contrastRatio } from '@/lib/contrast';
import { parseThemes, type ColorTheme } from '@/lib/cssTheme';

// 5.2（T4-03）：app/globals.css の色の変数から、文字・塗り・線のコントラスト比を計算する。
// 読めない値（var()・oklch() など）があれば、ライトの値で通さず例外にする（`parseThemes`）。
// 自動で確かめるのは、ここに書いた組み合わせだけ。新しい変数や、新しい文字と塗りの組み合わせは、ここに足す。
const { light, dark } = parseThemes(readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8'));

const TEXT_MIN = 4.5; // WCAG 1.4.3
const GRAPHIC_MIN = 3; // WCAG 1.4.11
const SLATE_950 = '#020617'; // Tailwind の text-slate-950

const REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'] as const;
const MUNI = ['muni-0', 'muni-1', 'muni-2', 'muni-3', 'muni-4', 'muni-hover'] as const;

/** 名前の色を引く。なければ例外 */
function color(theme: ColorTheme, name: string): string {
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

  // 固定中の県のラベルは、県の形からはみ出して、海・8地方・準備中の地の上に出ることがある。そのため、
  // 文字（--color-map-selected-label）に、塗り（--color-map-selected）と同じ色の縁取りを付ける（JapanMap の PINNED_LABEL_CLASS）。
  // はみ出した先でも、文字は縁取りの上に載る。だから、固定中のラベルと海・地方・準備中の地の比は検査せず、縁取り（＝塗りの色）との比と、
  // ふつうのラベルと海の比（下）を検査する。固定中の県のラベルが縁取りの外に出ることはない（縁取りは文字のすぐ外側にある）
  test('固定中の県のラベルと、縁取り・塗り（--color-map-selected）が 4.5:1 以上', () => {
    expect(ratio('map-selected-label', 'map-selected')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  test('ふつうの県名ラベルと海が 4.5:1 以上（県の形から、海へはみ出すラベル）', () => {
    expect(ratio('map-label', 'map-sea')).toBeGreaterThanOrEqual(TEXT_MIN);
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

  test('県境の線・枠と、海・ページの背景が 3:1 以上（WCAG 1.4.11。ボタンの枠も map-border）', () => {
    for (const background of ['map-sea', 'page-bg']) {
      expect(ratio('map-border', background)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
      expect(ratio('map-frame', background)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    }
  });

  // 県は1つずつがボタンなので、同じ地方の中の県と県の境は、線の隣が地方の塗りになる
  test.each([...REGIONS.map(region => `region-${region}`), 'map-pending', 'map-selected'])('県境の線と %s の塗りが 3:1 以上（WCAG 1.4.11）', fill => {
    expect(ratio('map-border', fill)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
  });

  test.each(MUNI)('市区町村の境の線と %s の塗りが 3:1 以上（WCAG 1.4.11）', fill => {
    expect(ratio('muni-border', fill)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
  });
});
