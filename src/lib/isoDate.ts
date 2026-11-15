// 日付（YYYY-MM-DD）の読み取り（9.3：出典の確認日）。scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` を、UTC の 0 時の `Date` にする。形が合わない・存在しない日（`2026-02-30`）は `null`。
 * `Date.UTC` は 0〜99 年を 1900 年代にするので、`setUTCFullYear` で年を入れる。
 */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
