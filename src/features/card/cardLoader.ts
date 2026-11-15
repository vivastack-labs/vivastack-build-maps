// カードの JSON（`/cards/{lang}/NN.json`）の読み込み（T3-09、D38、4.11.5）。市区町村と同じ共通の部品（`createResourceLoader`）に、URL と検証を渡す。
// DOM・React は使わない。fetch・オンラインの判定・タイマーは外から受け取る（単体テストで置き換えるため）。
import { isLang, type Lang } from '../../i18n/lang.ts';
import { BROWSER_LOADER_DEPS, createResourceLoader, type LoaderDeps, type ResourceLoader } from '../loader/resourceLoader.ts';
import { PREF_CODE_PATTERN } from '../map/projection.ts';
import type { CardData } from './cardData.ts';
import { validateCardData } from './cardValidate.ts';

/** カードの JSON を置いているパス（`{lang}/NN.json` を続ける。`app/cards/[lang]/[file]/route.ts` が出力する） */
export const CARD_BASE_PATH = '/cards/';

/** カードの JSON の読み込み部品。キーは県コード */
export type CardLoader = ResourceLoader<CardData>;

/**
 * カードの JSON の URL（`/cards/ja/01.json`）。URL に自由な文字列を入れないよう、言語は `isLang`、県コードは県コードの許可リストで確かめ、合わなければ例外にする。
 */
export function cardUrl(lang: Lang, code: string): string {
  if (!isLang(lang)) throw new Error(`言語ではありません：${String(lang)}`);
  if (!PREF_CODE_PATTERN.test(code)) throw new Error(`県コードではありません：${code}`);
  return `${CARD_BASE_PATH}${lang}/${code}.json`;
}

/** その言語のカードの JSON の読み込み部品を作る。言語でなければ例外にする。県コードの形は読み込むとき（境界）に確かめる */
export function createCardLoader(lang: Lang, deps: LoaderDeps): CardLoader {
  if (!isLang(lang)) throw new Error(`言語ではありません：${String(lang)}`);
  return createResourceLoader<CardData>(
    {
      url: code => cardUrl(lang, code),
      isKey: code => PREF_CODE_PATTERN.test(code),
      invalidKeyMessage: code => `県コードではありません：${code}`,
      validate: validateCardData
    },
    deps
  );
}

/** 言語ごとの、ブラウザの `fetch` を使う読み込み部品（成功のキャッシュを、言語ごとに1つ持つ） */
const browserLoaders = new Map<Lang, CardLoader>();

/** ブラウザで使う、その言語の読み込み部品（アプリで言語ごとに1つ。ページの言語は変わらない） */
export function browserCardLoader(lang: Lang): CardLoader {
  const existing = browserLoaders.get(lang);
  if (existing) return existing;
  const created = createCardLoader(lang, BROWSER_LOADER_DEPS);
  browserLoaders.set(lang, created);
  return created;
}
