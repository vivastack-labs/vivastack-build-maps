/** F-I18N-01・D7：対応する言語（URL の /{lang}/ の部分） */
export const LANGS = ['ja', 'en', 'zh'] as const;

/** 対応する言語のコード */
export type Lang = (typeof LANGS)[number];

// 6.2 D27：<html lang> の値。中国語は簡体字なので zh-Hans にする
const HTML_LANG: Readonly<Record<Lang, string>> = {
  ja: 'ja',
  en: 'en',
  zh: 'zh-Hans'
};

/** URL から取った値が対応する言語か確かめる（params は境界なので、使う前に確かめる） */
export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** <html lang> に書く値を返す（D27） */
export function htmlLang(lang: Lang): string {
  return HTML_LANG[lang];
}

/** app/[lang]/layout.tsx の generateStaticParams の戻り値 */
export function langStaticParams(): { lang: Lang }[] {
  return LANGS.map(lang => ({ lang }));
}

/**
 * 言語切替のリンクに書く、言語の名前（F-I18N-03）。その言語で書き、どのページでも同じ文字にする
 * （読めない言語のページに来た人が、自分の言語を見つけられるように）。辞書には入れない。
 */
export const LANG_NAMES: Readonly<Record<Lang, string>> = {
  ja: '日本語',
  en: 'English',
  zh: '中文'
};
