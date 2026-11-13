import { en } from './en.ts';
import type { Lang } from './lang.ts';
import { ja, type Messages } from './ja.ts';
import { zh } from './zh.ts';

export type { Messages, ModeTextValue } from './ja.ts';

const MESSAGES: Readonly<Record<Lang, Messages>> = { ja, en, zh };

/** 言語ごとのUI文言の辞書を返す（D28）。日本語の文言はふりがなの記法つき（`RubyText` で描く） */
export function getMessages(lang: Lang): Messages {
  return MESSAGES[lang];
}
