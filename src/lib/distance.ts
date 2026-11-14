// 東京からの距離（F-CARD-03、開発概要書 7.5）。県庁の緯度経度から、ハバーサイン公式で直線距離を計算する。
// DOM・React・node:fs を使わない純粋な関数。値はビルド時に1回だけ計算し、サーバーコンポーネントで HTML に埋め込む。
// scripts/ から Node.js で直接読み込まれることがあるので、相対の import には .ts を付ける。
import { fillCount } from '../i18n/format.ts';
import type { Lang } from '../i18n/lang.ts';
import { getMessages } from '../i18n/messages.ts';
import type { Prefecture } from './content-schema.generated.ts';

/** 緯度・経度（度）の点 */
export type LatLon = { readonly lat: number; readonly lon: number };

/** 地球の半径（km。7.5） */
export const EARTH_RADIUS_KM = 6371;

/** 距離を丸める単位（km。7.5） */
const ROUND_UNIT_KM = 10;

/** 距離の基準にする県（東京都）のコード。東京都のカードは基準の点なので、距離の行を出さない（F-CARD-03） */
export const TOKYO_CODE = '13';

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** 2点の直線距離（km）。ハバーサイン公式（地球を半径 `EARTH_RADIUS_KM` の球とみなす） */
export function haversineKm(from: LatLon, to: LatLon): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 10km 単位に四捨五入する（395 → 400、394 → 390。7.5） */
export function roundTo10Km(km: number): number {
  return Math.round(km / ROUND_UNIT_KM) * ROUND_UNIT_KM;
}

/**
 * 県コード → 東京都庁からの距離（km。10km 単位）。東京都自身は 0。
 * 東京都（`code: "13"`）がなければ例外（コンテンツの設定の誤り。黙って 0 にしない）。
 * 県コードと県庁の位置だけを読むので、`loadContent()` の結果も `publish()` の結果（`PublishedPrefecture`）も渡せる。
 */
export function distancesFromTokyo(prefectures: readonly Pick<Prefecture, 'code' | 'capital'>[]): ReadonlyMap<string, number> {
  const tokyo = prefectures.find(({ code }) => code === TOKYO_CODE);
  if (tokyo === undefined) throw new Error(`東京都（code: "${TOKYO_CODE}"）がないので、東京からの距離を計算できません`);
  return new Map(prefectures.map(({ code, capital }) => [code, roundTo10Km(haversineKm(tokyo.capital, capital))]));
}

/** 「東京から約 1,550 km」の文（ふりがなの記法つき。`RubyText` で描く）。`km` は 10km 単位に丸めた値 */
export function distanceText(lang: Lang, km: number): string {
  return fillCount(lang, getMessages(lang).card.distance, km);
}
