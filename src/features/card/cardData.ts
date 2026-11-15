// カードの内容（行き方・名物・名所・出典）の JSON の形と、その作り方（T3-09、D38、6.6 (2)）。
// ビルド時に `app/cards/[lang]/[file]/route.ts` が、県ごと・言語ごとに `/cards/{lang}/NN.json` として出力する。
// 純粋関数で、node:fs・React を使わない。scripts/ から Node.js で直接読み込むことがあるので、相対の import には .ts を付ける。
import { durationText } from '../../i18n/cardText.ts';
import { formatDate } from '../../i18n/format.ts';
import type { Lang } from '../../i18n/lang.ts';
import type { Source } from '../../lib/content-schema.generated.ts';
import type { Drafted, PublishedPrefecture } from '../../lib/publish.ts';
import { parseRuby, plainText } from '../../lib/ruby.ts';

/** こども向け・おとな向けの文（F-MODE-04）。日本語はふりがなの記法つき */
export type CardModes = { readonly kids: string; readonly adult: string };

/** 出典1件（F-SRC-02）。確認日は言語の書式の文字にしてある */
export type CardSource = {
  readonly title: string;
  readonly url: string;
  readonly accessedText: string;
};

/** 東京からの行き方（F-CARD-04）。所要時間は言語の文（ふりがなの記法つき）にしてある */
export type CardAccess = {
  readonly draft: boolean;
  readonly emoji: string;
  readonly mode: string;
  readonly route: string;
  readonly durationText: string;
  readonly sources: readonly CardSource[];
};

/** 名物・名所の1件（F-CARD-05・06）。`emoji` は名所だけ任意 */
export type CardItem = {
  readonly id: string;
  readonly draft: boolean;
  readonly emoji?: string;
  readonly name: string;
  readonly description: CardModes;
  readonly sources: readonly CardSource[];
};

/**
 * 1県・1言語ぶんのカードの内容（`/cards/{lang}/NN.json` の中身）。
 * 行き方がない県（プレビューの未作成の県）は `access` を持たない。ほかの言語の文は含まない（D38）。
 */
export type CardData = {
  readonly code: string;
  readonly access?: CardAccess;
  readonly specialties: readonly CardItem[];
  readonly spots: readonly CardItem[];
};

/** JSON に入れる文。ふりがなの記法に誤り（記法でない { } など）があれば例外にする（ブラウザの `RubyText` が例外になり、ページ全体が消えるため。`content:validate` が先に止める） */
function checked(text: string): string {
  parseRuby(text);
  return text;
}

/** 出典1件を、その言語の JSON の形にする。タイトルのふりがなは ja だけ（ほかの言語の文は記法を使わない）。確認日は言語の書式にする */
function toSource(lang: Lang, { title, url, accessed }: Source): CardSource {
  return { title: lang === 'ja' ? checked(title) : plainText(title), url, accessedText: formatDate(lang, accessed) };
}

/** 名物・名所1件を、その言語の JSON の形にする（`emoji` がなければキーごと含めない） */
function toItem(lang: Lang, item: Drafted<{ id: string; emoji?: string; name: Record<Lang, string>; description: Record<Lang, CardModes>; sources: readonly Source[] }>): CardItem {
  return {
    id: item.id,
    draft: item.draft,
    ...(item.emoji === undefined ? {} : { emoji: item.emoji }),
    name: checked(item.name[lang]),
    description: { kids: checked(item.description[lang].kids), adult: checked(item.description[lang].adult) },
    sources: item.sources.map(source => toSource(lang, source))
  };
}

/**
 * 絞り込みの後（`publish()` の結果）の県から、その言語のカードの内容を作る（D38）。
 * 「準備中」の県は、`publish()` が内容を外している（行き方なし・名物・名所は空）ので、空の内容になる（クライアントは読み込まない）。
 * 確認日の形が誤っていれば `formatDate` が例外にする。
 */
export function cardData(prefecture: PublishedPrefecture, lang: Lang): CardData {
  const { code, access, specialties, spots } = prefecture;
  return {
    code,
    ...(access === undefined
      ? {}
      : {
          access: {
            draft: access.draft,
            emoji: access.emoji,
            mode: checked(access.mode[lang]),
            route: checked(access.route[lang]),
            durationText: durationText(lang, access.durationMin),
            sources: access.sources.map(source => toSource(lang, source))
          }
        }),
    specialties: specialties.map(item => toItem(lang, item)),
    spots: spots.map(item => toItem(lang, item))
  };
}
