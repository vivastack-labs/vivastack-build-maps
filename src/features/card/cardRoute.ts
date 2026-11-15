// `app/cards/[lang]/[file]/route.ts`（カードの JSON を静的に出力する Route Handler。T3-09、D38）の、検証と選び方。
// Route Handler の `params` は境界なので、言語は `isLang`、ファイル名は県コードの許可リストで確かめる。純粋関数で、テストできるように route.ts から分けている。
import { isLang, LANGS } from '../../i18n/lang.ts';
import type { PublishedPrefecture } from '../../lib/publish.ts';
import { PREF_CODE_PATTERN } from '../map/projection.ts';
import { cardData, type CardData } from './cardData.ts';

const CARD_FILE_PATTERN = /^(\d{2})\.json$/u;

/**
 * ファイル名（`01.json`）から県コードを取り出す。県コードの許可リスト（01〜47）にない値は `null`。
 */
export function parseCardFile(file: string): string | null {
  const code = CARD_FILE_PATTERN.exec(file)?.[1];
  return code !== undefined && PREF_CODE_PATTERN.test(code) ? code : null;
}

/**
 * 出力するカードの JSON の `params`（`generateStaticParams` の戻り値）。47県を3言語ぶん出す。
 * 「準備中」の県も、内容が空の JSON を出す（クライアントは読み込まない）。Next.js の静的出力は経路が1つ以上要るので、
 * 全部が準備中の本物のコンテンツでも空にならないようにする。
 */
export function cardStaticParams(prefectures: readonly PublishedPrefecture[]): { lang: string; file: string }[] {
  return prefectures.flatMap(({ code }) => LANGS.map(lang => ({ lang, file: `${code}.json` })));
}

/**
 * リクエストの `params` から、返すカードの内容を求める。言語・ファイル名が許可リストにない、県がないときは `null`（404 にする）。
 */
export function cardForRequest(prefectures: readonly PublishedPrefecture[], lang: string, file: string): CardData | null {
  const code = parseCardFile(file);
  if (!isLang(lang) || code === null) return null;
  const prefecture = prefectures.find(item => item.code === code);
  return prefecture === undefined ? null : cardData(prefecture, lang);
}
