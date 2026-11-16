// app/globals.css の色の変数（`--color-*`）を読む（5.2、T4-03）。コントラストの単体テスト（tests/unit/styles/theme-contrast.test.ts）が使う。
// 読めない値（8桁の hex・var()・oklch()・color-mix() など）を黙って捨てると、ダークの値が読まれず、ライトの値で検査が通ってしまう。
// そこで、宣言の数と読めた数が合わなければ例外にする。

/** 色の変数名（`--color-` を除く）→ `#rgb`・`#rrggbb` の値 */
export type ColorTheme = ReadonlyMap<string, string>;

const COMMENT = /\/\*[\s\S]*?\*\//gu;
const COLOR_DECLARATION = /--color-[a-z0-9-]+\s*:/gu;
const HEX_COLOR_DECLARATION = /--color-([a-z0-9-]+)\s*:\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\s*;/gu;
/** `@media screen and (prefers-color-scheme : dark) and (…) {` など、ふつうの書き方をすべて数える */
const DARK_MARKER = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/gu;
/** `@theme {`・`@theme inline {`・`@theme static {` */
const THEME_MARKER = /@theme\b[^{]*\{/gu;

/** `open` の位置の `{` から、対応する `}` の位置を返す。閉じていなければ例外 */
function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return i;
  }
  throw new Error('波括弧が閉じていません');
}

/**
 * ブロックの中の `--color-NAME: #hex;` を読む。`--color-` の宣言のうち、読めなかったもの（hex でない値など）が1つでもあれば例外にする。
 * 同じ名前が2回あれば、あとのものが勝つ（CSS と同じ）。
 */
export function readColors(block: string): ColorTheme {
  const declared = block.match(COLOR_DECLARATION)?.length ?? 0;
  const entries = [...block.matchAll(HEX_COLOR_DECLARATION)].map(match => [match[1] as string, match[2] as string] as const);
  if (entries.length !== declared) throw new Error(`色の変数 ${declared} 件のうち、#rgb・#rrggbb として読めたのは ${entries.length} 件です（var()・oklch()・8桁の hex などは読めません）`);
  return new Map(entries);
}

type Block = { readonly start: number; readonly open: number; readonly end: number };

/** 正規表現に合うブロック（`start`：マーカーの先頭、`open`：`{`、`end`：`}`）を、出てきた順にすべて返す */
function blocksOf(css: string, marker: RegExp): readonly Block[] {
  return [...css.matchAll(marker)].map(match => {
    const start = match.index as number;
    const open = start + match[0].length - 1;
    return { start, open, end: closingBrace(css, open) };
  });
}

const bodyOf = (css: string, block: Block): string => css.slice(block.open + 1, block.end);

/** ブロックの範囲を除いた文字列 */
function without(css: string, blocks: readonly Block[]): string {
  return [...blocks].sort((a, b) => b.start - a.start).reduce((rest, block) => rest.slice(0, block.start) + rest.slice(block.end + 1), css);
}

/**
 * `app/globals.css` の文字列から、ライト（`@theme`・`@theme inline` など。複数あれば全部）とダーク（`@media … (prefers-color-scheme: dark)` の中。
 * ライトの値を、ダークの値で上書きしたもの）の色を読む。次のときは例外にする。
 * - `@theme` がない。ダークの `@media` が1つでない。読めない色の宣言がある。
 * - 読むブロックの外に `--color-` の宣言がある（`:root { --color-… }` での上書きなどを、黙って捨てないため）。
 */
export function parseThemes(css: string): { readonly light: ColorTheme; readonly dark: ColorTheme } {
  const source = css.replace(COMMENT, '');
  const themes = blocksOf(source, THEME_MARKER);
  if (themes.length === 0) throw new Error('@theme がありません');
  const darks = blocksOf(source, DARK_MARKER);
  if (darks.length !== 1) throw new Error(`@media (prefers-color-scheme: dark) は1つだけにしてください（${darks.length} 個あります）`);
  const outside = without(source, [...themes, ...darks]).match(COLOR_DECLARATION)?.length ?? 0;
  if (outside > 0) throw new Error(`@theme・ダークの @media の外に --color- の宣言が ${outside} 件あります（読まれないので、検査に使われません）`);
  const light = new Map(themes.flatMap(block => [...readColors(bodyOf(source, block))]));
  const dark = new Map([...light, ...readColors(bodyOf(source, darks[0] as Block))]);
  return { light, dark };
}
