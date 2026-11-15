import { parseIsoDate } from '../lib/isoDate.ts';
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

// 確認日は UTC の暦で書式にする。端末のタイムゾーンで日がずれないため
const DATE_FORMATS: Readonly<Record<Lang, Intl.DateTimeFormat>> = Object.fromEntries(
  LANGS.map(lang => [lang, new Intl.DateTimeFormat(htmlLang(lang), { dateStyle: 'long', timeZone: 'UTC' })])
) as Record<Lang, Intl.DateTimeFormat>;

/**
 * `YYYY-MM-DD` の日付を、言語の書式の文字にする（出典の確認日。F-SRC-02、D28）。
 * ja・zh は「2026年11月15日」、en は「November 15, 2026」。
 * 形が合わない・存在しない日（`2026-02-30`）は例外にして、ビルドを止める（コンテンツの誤りを黙って出さない。`content:validate` も同じ判定で誤りにする）。
 */
export function formatDate(lang: Lang, isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (date === null) throw new Error(`日付は実在する YYYY-MM-DD にしてください（今の値：${JSON.stringify(isoDate)}）`);
  return DATE_FORMATS[lang].format(date);
}
