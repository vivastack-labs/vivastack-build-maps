// カードの JSON（`/cards/{lang}/NN.json`）を読み込んだときの検証（T3-09、D38、4.11.5）。境界なので、中身の形をすべて確かめる。
// DOM・React は使わない。scripts/ から Node.js で直接読み込むことがあるので、相対の import には .ts を付ける。
import type { CardData } from './cardData.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

/** 出典のリンクに使える URL（`javascript:`・`data:` などを入れない） */
const HTTP_URL_PATTERN = /^https?:\/\//u;

const isSource = (value: unknown): boolean => isRecord(value) && isString(value.title) && isString(value.url) && HTTP_URL_PATTERN.test(value.url) && isString(value.accessedText);
const isSources = (value: unknown): boolean => Array.isArray(value) && value.every(isSource);

function isAccess(value: unknown): boolean {
  return isRecord(value) && typeof value.draft === 'boolean' && isString(value.emoji) && isString(value.mode) && isString(value.route) && isString(value.durationText) && isSources(value.sources);
}

function isItem(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.id) || typeof value.draft !== 'boolean' || !isString(value.name)) return false;
  if (value.emoji !== undefined && !isString(value.emoji)) return false;
  const { description } = value;
  return isRecord(description) && isString(description.kids) && isString(description.adult) && isSources(value.sources);
}

const isItems = (value: unknown): boolean => Array.isArray(value) && value.every(isItem);

/**
 * 読み込んだ JSON が、使う形のカードの内容かを確かめる（`code` が読み込んだ県と同じ・項目の欠けや型の違い・出典の URL が http(s) でないもの）。
 * 合えば受け取った値をそのまま、合わなければ `null` を返す。
 */
export function validateCardData(json: unknown, code: string): CardData | null {
  if (!isRecord(json) || json.code !== code || !isItems(json.specialties) || !isItems(json.spots)) return null;
  if ('access' in json && json.access !== undefined && !isAccess(json.access)) return null;
  return json as unknown as CardData;
}
