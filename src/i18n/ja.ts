import type { Prefecture } from '@/lib/content-schema.generated';

/** 地方のキー。コンテンツの region と同じ（ずれたら型で落ちる） */
type Region = Prefecture['region'];

/** こども向け・おとな向けで言い方を変える文（F-MODE-04）。`ModeText` で両方を出力する */
export type ModeTextValue = { readonly kids: string; readonly adult: string };

/** 関数はそのまま、オブジェクトは入れ子まで読み取り専用にする */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/**
 * 日本語の辞書の元（基準。en・zh は `Messages`（この辞書の形）を満たす。D28）。
 * 文言はふりがなの記法 `{漢字|よみ}` で書き、`RubyText` で描く（7.2）。
 * `{ kids, adult }` は、こども向け・おとな向けで言い方を変える文（F-MODE-04）。
 * `as const` は付けない。付けると文字列リテラルの型になり、en・zh が同じ文を求められるため。
 */
const jaSource = {
  siteName: 'ご{当地|とうち}めいぶつ{日本地図|にほんちず}',
  map: {
    label: '{日本地図|にほんちず}'
  },
  zoom: {
    in: '+',
    inLabel: '{拡大|かくだい}',
    out: '−',
    outLabel: '{縮小|しゅくしょう}',
    reset: '{全体|ぜんたい}'
  },
  regions: {
    hokkaido: '{北海道|ほっかいどう}{地方|ちほう}',
    tohoku: '{東北|とうほく}{地方|ちほう}',
    kanto: '{関東|かんとう}{地方|ちほう}',
    chubu: '{中部|ちゅうぶ}{地方|ちほう}',
    kinki: '{近畿|きんき}{地方|ちほう}',
    chugoku: '{中国|ちゅうごく}{地方|ちほう}',
    shikoku: '{四国|しこく}{地方|ちほう}',
    kyushu: '{九州|きゅうしゅう}{地方|ちほう}'
  } satisfies Record<Region, string>,
  seas: {
    japanSea: '{日本海|にほんかい}',
    pacific: '{太平洋|たいへいよう}'
  },
  card: {
    guide: {
      kids: '{県|けん}にマウスをのせるか、タップしてね',
      adult: '{県|けん}にマウスをのせるか、タップしてください'
    } satisfies ModeTextValue,
    distance: '{東京|とうきょう}から{約|やく} %n km',
    maximize: '{大|おお}きくして{市区町村|しくちょうそん}を{見|み}る',
    restore: '{元|もと}の{大|おお}きさにもどす',
    capital: '{県庁所在地|けんちょうしょざいち}',
    access: '{東京|とうきょう}からの{行|い}き{方|かた}',
    durationLabel: '{所要時間|しょようじかん}の{目安|めやす}',
    // %h・%m に時間・分の数を入れる。「分」の読みは、数に合わせて cardText.ts が「ふん」「ぷん」にする
    duration: {
      hoursMinutes: '%h{時間|じかん}%m{分|ふん}',
      hours: '%h{時間|じかん}',
      minutes: '%m{分|ふん}'
    },
    specialties: '{名物|めいぶつ}',
    spots: '{名所|めいしょ}',
    draft: '{下書|したが}き',
    sources: '{出典|しゅってん}',
    noSource: '{出典|しゅってん}なし',
    accessed: '{確認日|かくにんび}'
  },
  comingSoon: {
    label: '{準備中|じゅんびちゅう}',
    indexSuffix: '（{準備中|じゅんびちゅう}）',
    card: {
      kids: '{名物|めいぶつ}・{名所|めいしょ}は{準備中|じゅんびちゅう}だよ',
      adult: '{名物|めいぶつ}・{名所|めいしょ}は{準備中|じゅんびちゅう}です'
    } satisfies ModeTextValue
  },
  muni: {
    loading: '{読|よ}み{込|こ}み{中|ちゅう}',
    loadFailed: {
      kids: '{市区町村|しくちょうそん}を{読|よ}み{込|こ}めなかったよ',
      adult: '{市区町村|しくちょうそん}を{読|よ}み{込|こ}めませんでした'
    } satisfies ModeTextValue,
    offline: {
      kids: 'インターネットにつながっていないので、{表示|ひょうじ}できないよ',
      adult: 'オフラインのため{表示|ひょうじ}できません'
    } satisfies ModeTextValue,
    retry: {
      kids: 'もう{一度|いちど}',
      adult: '{再試行|さいしこう}'
    } satisfies ModeTextValue,
    listSummary: '{市区町村|しくちょうそん}の{一覧|いちらん}（%n）'
  },
  footer: {
    // URL（リンク）の前後の文。URL は Footer.tsx の定数で、before と after の間に入る（8.3）
    mapSource: {
      before: '{出典|しゅってん}：「{国土数値情報|こくどすうちじょうほう}（{行政区域|ぎょうせいくいき}データ）」（{国土交通省|こくどこうつうしょう}）（',
      after: '）を{加工|かこう}して{作成|さくせい}'
    },
    ai: 'AIで{作成|さくせい}し、{人|ひと}が{確認|かくにん}しています'
  },
  // T3-05：モード・ふりがなの切替ボタン。モードによらず同じ文言（押したボタンが分かるように）
  display: {
    label: 'モード',
    kids: 'こども',
    adult: 'おとな',
    ruby: 'ふりがな'
  },
  index: {
    heading: '{県名|けんめい}さくいん'
  },
  notFound: {
    title: 'ページが{見|み}つかりません',
    backToTop: 'トップページへ'
  }
};

/** UI文言の辞書の形（日本語の辞書が基準。キーが足りない言語は型で落ちる。D28） */
export type Messages = DeepReadonly<typeof jaSource>;

/** 日本語の辞書。ふりがなの記法つき（`RubyText` で描く） */
export const ja: Messages = jaSource;
