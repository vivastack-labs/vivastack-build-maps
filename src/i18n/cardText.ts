// カードの文の組み立て（F-CARD-03・04）。辞書の文に、距離・所要時間の数を入れる。
// 辞書（`getMessages`）に依存するので `src/i18n/` に置く（`src/lib/distance.ts` は計算だけにする）。
// scripts/ から Node.js で直接読み込むことがあるので、相対の import には .ts を付ける。
import { fillCount } from './format.ts';
import type { Lang } from './lang.ts';
import { getMessages } from './messages.ts';

/** 見出しの項目名と、その値の間の区切り（「県庁所在地：札幌市」「Accessed: …」） */
export const LABEL_SEPARATOR: Readonly<Record<Lang, string>> = { ja: '：', en: ': ', zh: '：' };

/** 1時間の分 */
const MINUTES_PER_HOUR = 60;

/** 日本語の「分」を「ぷん」と読む、数の1の位（1・3・4・6・8・0。10 は「じゅっぷん」）。それ以外は「ふん」 */
const PUN_LAST_DIGITS: ReadonlySet<number> = new Set([0, 1, 3, 4, 6, 8]);

/** 辞書の「分」の読み（`{分|ふん}`） */
const FUN_RUBY = '{分|ふん}';

/** 「東京から約 1,550 km」の文（ふりがなの記法つき。`RubyText` で描く）。`km` は 10km 単位に丸めた値 */
export function distanceText(lang: Lang, km: number): string {
  return fillCount(lang, getMessages(lang).card.distance, km);
}

/**
 * 「1時間35分」「1時間」「45分」の文（ふりがなの記法つき。`RubyText` で描く。F-CARD-04）。
 * 日本語の「分」の読みは、分の数に合わせて「ふん」「ぷん」にする。
 * `minutes` が 1 以上の整数でなければ例外（コンテンツの検証を通った値だけを渡す）。
 */
export function durationText(lang: Lang, minutes: number): string {
  if (!Number.isInteger(minutes) || minutes <= 0) throw new Error(`所要時間は 1 以上の整数（分）にしてください（今の値：${String(minutes)}）`);
  const { hoursMinutes, hours, minutes: minutesOnly } = getMessages(lang).card.duration;
  const h = Math.floor(minutes / MINUTES_PER_HOUR);
  const m = minutes % MINUTES_PER_HOUR;
  const template = h === 0 ? minutesOnly : m === 0 ? hours : hoursMinutes;
  const text = template.replace('%h', String(h)).replace('%m', String(m));
  const reading = PUN_LAST_DIGITS.has(m % 10) ? '{分|ぷん}' : FUN_RUBY;
  return text.replace(FUN_RUBY, reading);
}
