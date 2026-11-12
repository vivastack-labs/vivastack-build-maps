// コンテンツの内容のルール（T1-07、開発概要書 7.1〜7.3・9.3）。形（JSON Schema）が通った県だけを見る。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import type { Prefecture, Sources, Specialty, Spot } from './content-schema.generated.ts';
import { characterNumber, checkRuby, plainText } from './ruby.ts';

/** YAML の中の場所（例：['specialties', 0, 'description', 'ja', 'kids']） */
export type ContentPath = readonly (string | number)[];

/** 1県の中の誤り・警告 */
export type RuleIssue = { readonly path: ContentPath; readonly message: string };

export type RuleResult = { readonly errors: readonly RuleIssue[]; readonly warnings: readonly RuleIssue[] };

type Item = Specialty | Spot;
type Lang = 'ja' | 'en' | 'zh';
type Mode = 'kids' | 'adult';
type Range = readonly [min: number, max: number];

/** 7.3：解説文の文字数（英語は語数）の範囲 */
export const LENGTH_RANGES: Readonly<Record<'specialties' | 'spots', Record<Lang, Record<Mode, Range>>>> = {
  specialties: {
    ja: { kids: [20, 35], adult: [30, 50] },
    en: { kids: [10, 20], adult: [12, 25] },
    zh: { kids: [15, 30], adult: [20, 40] }
  },
  spots: {
    ja: { kids: [15, 25], adult: [25, 40] },
    en: { kids: [8, 15], adult: [8, 18] },
    zh: { kids: [12, 22], adult: [15, 30] }
  }
};

const LANGS: readonly Lang[] = ['ja', 'en', 'zh'];
const MODES: readonly Mode[] = ['kids', 'adult'];
const ITEM_LISTS = ['specialties', 'spots'] as const;

const itemsOf = (pref: Prefecture): readonly (readonly [ContentPath, Item])[] => ITEM_LISTS.flatMap(list => pref[list].map((item, i): readonly [ContentPath, Item] => [[list, i], item]));

/** ファイル名が `${code}-${id}.yaml` と合うか */
export function checkFileName(fileName: string, pref: Prefecture): readonly RuleIssue[] {
  const expected = `${pref.code}-${pref.id}.yaml`;
  return fileName === expected ? [] : [{ path: [], message: `ファイル名が code・id と合いません。ファイル名を ${expected} にするか、code・id を直してください` }];
}

/** 県の中で、名物・名所の id が重複しないか（名物と名所を合わせて見る） */
export function checkItemIds(pref: Prefecture): readonly RuleIssue[] {
  const items = itemsOf(pref);
  return items.flatMap(([path, item], i) => {
    const first = items.findIndex(([, other]) => other.id === item.id);
    return first < i ? [{ path: [...path, 'id'], message: `id「${item.id}」が ${formatPath(items[first]?.[0] ?? [])} と重複しています` }] : [];
  });
}

type PathText = readonly [ContentPath, string];

/** ある言語の文をすべて、場所と一緒に返す（出典のタイトルは出典の表記のままなので入れない） */
function textsOf(pref: Prefecture, lang: Lang): readonly PathText[] {
  const access = pref.access;
  const accessTexts: readonly PathText[] = access
    ? [
        [['access', 'mode', lang], access.mode[lang]],
        [['access', 'route', lang], access.route[lang]]
      ]
    : [];
  const itemTexts = itemsOf(pref).flatMap(([path, item]): readonly PathText[] => [
    [[...path, 'name', lang], item.name[lang]],
    ...MODES.map((mode): PathText => [[...path, 'description', lang, mode], item.description[lang][mode]])
  ]);
  return [[['name', lang], pref.name[lang]], [['capital', 'name', lang], pref.capital.name[lang]], ...accessTexts, ...itemTexts];
}

/** ふりがなの記法（{…|…}）らしい部分 */
const RUBY_NOTATION = /\{[^{}]*\|[^{}]*\}/u;

/** 7.2・D2：ふりがなの誤り（誤り）と、ふりがなの付いていない漢字（警告）。日本語の文だけを見る。英語・中国語に記法があれば誤り */
export function checkFurigana(pref: Prefecture): RuleResult {
  const results = textsOf(pref, 'ja').map(([path, text]) => {
    const { errors, warnings } = checkRuby(text);
    const toIssue = ({ index, message }: { index: number; message: string }): RuleIssue => ({ path, message: `${characterNumber(text, index)}文字目：${message}` });
    return { errors: errors.map(toIssue), warnings: warnings.map(toIssue) };
  });
  const misplaced = (['en', 'zh'] as const)
    .flatMap(lang => textsOf(pref, lang))
    .filter(([, text]) => RUBY_NOTATION.test(text))
    .map(([path]) => ({ path, message: 'ふりがなの記法（{漢字|よみ}）は、日本語の文にだけ書けます' }));
  return { errors: [...results.flatMap(r => r.errors), ...misplaced], warnings: results.flatMap(r => r.warnings) };
}

/** 7.3：日本語・中国語は空白を除いた字数（日本語は読みを除く）、英語は語数 */
export function countLength(text: string, lang: Lang): number {
  if (lang === 'en') return text.split(/\s+/u).filter(word => word !== '').length;
  const plain = lang === 'ja' ? plainText(text) : text;
  return [...plain.replace(/\s/gu, '')].length;
}

/** 7.3：解説文の文字数が範囲外なら警告。ふりがなに誤りがある日本語の文は数えない（誤りとして別に出る） */
export function checkLengths(pref: Prefecture): readonly RuleIssue[] {
  return ITEM_LISTS.flatMap(list =>
    pref[list].flatMap((item, i) =>
      LANGS.flatMap(lang => MODES.flatMap(mode => lengthIssue([list, i, 'description', lang, mode], item.description[lang][mode], lang, LENGTH_RANGES[list][lang][mode])))
    )
  );
}

/** 1つの解説文の文字数（英語は語数）が範囲外なら、警告を1つ返す */
function lengthIssue(path: ContentPath, text: string, lang: Lang, [min, max]: Range): readonly RuleIssue[] {
  if (lang === 'ja' && checkRuby(text).errors.length > 0) return [];
  const length = countLength(text, lang);
  if (length >= min && length <= max) return [];
  const [label, unit] = lang === 'en' ? ['語数', '語'] : ['文字数', '字'];
  return [{ path, message: `${label}が範囲外です（${length}${unit}。${min}〜${max}${unit}）` }];
}

/** 9.3：出典が空なら警告（画面には「出典なし」と出る） */
export function checkSources(pref: Prefecture): readonly RuleIssue[] {
  const lists: readonly (readonly [ContentPath, Sources])[] = [
    ...(pref.access ? [[['access'], pref.access.sources] as const] : []),
    ...itemsOf(pref).map(([path, item]) => [path, item.sources] as const)
  ];
  return lists.filter(([, sources]) => sources.length === 0).map(([path]) => ({ path: [...path, 'sources'], message: '出典がありません（画面には「出典なし」と出ます）' }));
}

/** 1県分の内容のルールをまとめて見る（ファイルをまたぐ重複は content.ts で見る） */
export function checkPrefecture(fileName: string, pref: Prefecture): RuleResult {
  const furigana = checkFurigana(pref);
  return {
    errors: [...checkFileName(fileName, pref), ...checkItemIds(pref), ...furigana.errors],
    warnings: [...furigana.warnings, ...checkLengths(pref), ...checkSources(pref)]
  };
}

/** 場所を `specialties[0].description.ja.kids` の形にする */
export function formatPath(path: ContentPath): string {
  return path.map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? key : `.${key}`)).join('');
}
