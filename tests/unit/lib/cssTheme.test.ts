import { describe, expect, test } from 'vitest';

import { parseThemes, readColors } from '@/lib/cssTheme';

// 5.2（T4-03）：globals.css の色の変数を読む。読めない値を黙って捨てない
describe('readColors', () => {
  test('5.2：#rgb・#rrggbb の宣言を、名前（--color- を除く）→ 値で読む', () => {
    const colors = readColors('--color-a: #fff; --color-b-c:#0F172A;');

    expect([...colors]).toEqual([
      ['a', '#fff'],
      ['b-c', '#0F172A']
    ]);
  });

  test.each(['#0f172acc', 'var(--color-b)', 'oklch(0.5 0.1 200)', 'color-mix(in srgb, #fff, #000)', 'red'])('5.2：読めない値（%s）があれば例外にする', value => {
    expect(() => readColors(`--color-a: #ffffff; --color-b: ${value};`)).toThrow(/読めたのは 1 件/u);
  });
});

describe('parseThemes', () => {
  const css = `
    /* --color-comment: oklch(0 0 0); コメントの中は数えない */
    @theme { --color-a: #111111; --color-b: #222222; }
    @theme { --color-c: #333333; }
    @media (prefers-color-scheme: dark) { :root { --color-a: #eeeeee; } }
  `;

  test('5.2：ダークは、ライトの値をダークの値で上書きしたもの（@theme が複数あっても全部読む）', () => {
    const { light, dark } = parseThemes(css);

    expect(light.get('a')).toBe('#111111');
    expect(light.get('c')).toBe('#333333');
    expect(dark.get('a')).toBe('#eeeeee');
    expect(dark.get('b')).toBe('#222222');
  });

  test('5.2：ダークの値が読めなければ、ライトの値で通さず例外にする', () => {
    const broken = css.replace('#eeeeee', 'oklch(0.9 0 0)');

    expect(() => parseThemes(broken)).toThrow(/読めたのは 0 件/u);
  });

  test('5.2：ダークの @media が2つあれば例外にする（後ろの値が読まれないため）', () => {
    const twice = `${css}\n@media (prefers-color-scheme: dark) { :root { --color-b: #000000; } }`;

    expect(() => parseThemes(twice)).toThrow(/1つだけ.*2 個/u);
  });

  test('5.2：ダークの @media がなければ例外にする', () => {
    expect(() => parseThemes('@theme { --color-a: #111111; }')).toThrow(/0 個/u);
  });

  test('5.2：@theme がなければ例外にする', () => {
    expect(() => parseThemes('@media (prefers-color-scheme: dark) { :root { --color-a: #111111; } }')).toThrow(/@theme/u);
  });

  test('5.2：波括弧が閉じていなければ例外にする', () => {
    expect(() => parseThemes('@theme { --color-a: #111111;')).toThrow(/閉じていません/u);
  });

  test('5.2：実際の app/globals.css が読める（宣言の数と読めた数が合う）', async () => {
    const { readFileSync } = await import('node:fs');
    const { light, dark } = parseThemes(readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8'));

    expect(light.size).toBeGreaterThan(20);
    expect(dark.size).toBeGreaterThanOrEqual(light.size);
  });
});
