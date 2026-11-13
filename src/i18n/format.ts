import { htmlLang, LANGS, type Lang } from './lang.ts';

// Intl.NumberFormat は作るのが重いので、言語ごとに1つ作って使い回す。ロケールは <html lang> と同じ値（D27）
const NUMBER_FORMATS: Readonly<Record<Lang, Intl.NumberFormat>> = Object.fromEntries(LANGS.map(lang => [lang, new Intl.NumberFormat(htmlLang(lang))])) as Record<Lang, Intl.NumberFormat>;

/** 数を言語の書式で文字にする（桁区切りなど。D28） */
export function formatNumber(lang: Lang, value: number): string {
  return NUMBER_FORMATS[lang].format(value);
}
