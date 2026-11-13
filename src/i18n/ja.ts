import type { Prefecture } from '@/lib/content-schema.generated';

/** 地方のキー。コンテンツの region と同じ（ずれたら型で落ちる） */
type Region = Prefecture['region'];

/**
 * 日本語の辞書（基準。en・zh は `Messages`（この辞書の形）を満たす。D28）。
 * 文言はふりがなの記法 `{漢字|よみ}` で書き、`RubyText` で描く（7.2）。
 * `{ kids, adult }` は、こども向け・おとな向けで言い方を変える文（F-MODE-04）。
 * `as const` は付けない。付けると文字列リテラルの型になり、en・zh が同じ文を求められるため。
 */
export const ja = {
  siteName: 'ご{当地|とうち}めいぶつ{日本地図|にほんちず}',
  map: {
    label: '{日本地図|にほんちず}'
  },
  zoom: {
    in: '＋',
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
    },
    maximize: '{大|おお}きくして{市区町村|しくちょうそん}を{見|み}る',
    restore: '{元|もと}の{大|おお}きさにもどす'
  },
  comingSoon: {
    label: '{準備中|じゅんびちゅう}',
    card: {
      kids: '{名物|めいぶつ}・{名所|めいしょ}は{準備中|じゅんびちゅう}だよ',
      adult: '{名物|めいぶつ}・{名所|めいしょ}は{準備中|じゅんびちゅう}です'
    }
  },
  muni: {
    loading: '{読|よ}み{込|こ}み{中|ちゅう}',
    loadFailed: {
      kids: '{市区町村|しくちょうそん}を{読|よ}み{込|こ}めなかったよ',
      adult: '{市区町村|しくちょうそん}を{読|よ}み{込|こ}めませんでした'
    },
    offline: {
      kids: 'インターネットにつながっていないので、{表示|ひょうじ}できないよ',
      adult: 'オフラインのため{表示|ひょうじ}できません'
    },
    retry: {
      kids: 'もう{一度|いちど}',
      adult: '{再試行|さいしこう}'
    },
    listSummary: '{市区町村|しくちょうそん}の{一覧|いちらん}'
  },
  index: {
    heading: '{県名|けんめい}さくいん'
  },
  notFound: {
    title: 'ページが{見|み}つかりません',
    backToTop: 'トップページへ'
  }
};
