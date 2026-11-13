import { en } from './en.ts';
import type { Lang } from './lang.ts';
import { ja } from './ja.ts';
import { zh } from './zh.ts';

/** 配列・関数以外を、入れ子まで読み取り専用にする */
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };

/** UI文言の辞書の形（日本語の辞書が基準。キーが足りない言語は型で落ちる。D28） */
export type Messages = DeepReadonly<typeof ja>;

/** こども向け・おとな向けで言い方を変える文（F-MODE-04）。`ModeText` で両方を出力する */
export type ModeTextValue = { readonly kids: string; readonly adult: string };

const MESSAGES: Readonly<Record<Lang, Messages>> = { ja, en, zh };

/** 言語ごとのUI文言の辞書を返す（D28）。日本語の文言はふりがなの記法つき（`RubyText` で描く） */
export function getMessages(lang: Lang): Messages {
  return MESSAGES[lang];
}
