import { htmlLang, LANGS, type Lang } from './lang.ts';

// Intl.NumberFormat は作るのが重いので、言語ごとに1つ作って使い回す。ロケールは <html lang> と同じ値（D27）
const NUMBER_FORMATS: Readonly<Record<Lang, Intl.NumberFormat>> = Object.fromEntries(LANGS.map(lang => [lang, new Intl.NumberFormat(htmlLang(lang))])) as Record<Lang, Intl.NumberFormat>;

/** 数を言語の書式で文字にする（桁区切りなど。D28） */
export function formatNumber(lang: Lang, value: number): string {
  return NUMBER_FORMATS[lang].format(value);
}

/** 文言の件数を入れる位置の印 */
const COUNT_PLACEHOLDER = '%n';

/** 文言（辞書の値）の `%n` に、言語の書式の件数を入れる（括弧など件数のまわりの書き方は、言語ごとに辞書に書く。D28） */
export function fillCount(lang: Lang, template: string, count: number): string {
  return template.replace(COUNT_PLACEHOLDER, formatNumber(lang, count));
}
