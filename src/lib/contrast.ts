// 色のコントラスト比（WCAG 2.x。5.2、T4-03）。色の変数（app/globals.css）から計算する単体テストで使う。

/** 0〜255 の赤・緑・青 */
export type Rgb = readonly [number, number, number];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;

/**
 * `#rgb`・`#rrggbb`（大文字小文字は問わない）を 0〜255 の赤・緑・青にする。
 * 形が合わなければ例外にする。
 */
export function parseHexColor(hex: string): Rgb {
  if (!HEX_COLOR.test(hex)) throw new Error(`色の形が正しくありません: ${hex}`);
  const digits = hex.length === 4 ? [...hex.slice(1)].map(c => c + c).join('') : hex.slice(1);
  const value = (offset: number): number => Number.parseInt(digits.slice(offset, offset + 2), 16);
  return [value(0), value(2), value(4)];
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x の相対輝度（0〜1） */
function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * 2色のコントラスト比（1〜21。順序は問わない）を返す。WCAG 2.x の式 `(明るい方 + 0.05) / (暗い方 + 0.05)`。
 * 通常の文字は 4.5 以上（1.4.3）、図形・大きな文字は 3 以上（1.4.11）。
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(parseHexColor(foreground));
  const b = relativeLuminance(parseHexColor(background));
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
