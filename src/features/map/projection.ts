/**
 * 地図の投影法（T1-03、6.6 (1)、F-MAP-02）。
 *
 * ビルド時（都道府県の形。T2-04）と実行時（市区町村の形。T2-08）は、どちらもこのモジュールだけを使う。
 * 設定値は実行時にデータから計算し直さず、定数で持つ。データに合わせて計算すると、
 * 都道府県と市区町村で入力が違うため結果がずれ、県境と市区町村の境界が合わなくなる。
 *
 * - 投影法：ランベルト正角円錐図法（`geoConicConformal`）。学校の地図帳の日本全図に近い形になり
 *   （北海道が右に、九州が左に少し傾く）、日本の南北（約27°〜46°）で縮尺の違いが小さい。
 *   正角なので、県を最大化しても形がゆがまない。メルカトルでは北海道（43°N）が九州（32°N）より
 *   約1.3倍の広さに描かれるので使わない。
 * - 中央経線 137°E（本州の中ほど）、中心の緯度 37°N、標準緯線 33°N・44°N（九州〜北海道の南北の範囲の内側）。
 * - 縮尺 3300・位置 (468, 544)・viewBox 1000×1130：N03 2026年版の形の外接矩形
 *   （沖縄県と小笠原村を除く。対馬・五島、北方領土、竹島、奄美群島・与論島、伊豆諸島の南の岩礁まで）が、
 *   上下左右に約20の余白で入るように、T1-03 で試算して丸めた値。
 * - 小笠原村（父島・南鳥島・沖ノ鳥島）は viewBox の外に出る。扱いは U16（T2-04 で決める）。
 * - 沖縄県（尖閣諸島・大東諸島を含む）は、等倍のまま左上の点線枠に移す（F-MAP-02）。
 *   等倍なら他の県と大きさを比べられ、左上（日本海の西側）には陸地がないので等倍でも収まる。
 *   与論島（鹿児島県）と伊平屋島（沖縄県）は近く、座標では区別できないので、移すかどうかは県コードで決める。
 */
import { geoConicConformal, type GeoProjection } from 'd3-geo';

/** 経緯度（度） */
export type LonLat = readonly [longitude: number, latitude: number];
/** 投影した後の SVG の座標（viewBox の中） */
export type Point = readonly [x: number, y: number];

/** 地図の SVG の viewBox の大きさ */
export const VIEWBOX = { width: 1000, height: 1130 } as const;

const PROJECTION = {
  centralMeridian: 137,
  centerLatitude: 37,
  parallels: [33, 44],
  scale: 3300,
  translate: [468, 544]
} as const;

/** 左上の点線枠に移す県（沖縄県）のコード */
export const OKINAWA_PREF_CODE = '47';

/** 沖縄県の点を、本体の投影の後で p' = scale·p + (dx, dy) に移す */
export const OKINAWA_TRANSFORM = { scale: 1, dx: 326, dy: -978 } as const;

/** 沖縄県を入れる点線枠（viewBox の座標） */
export const OKINAWA_FRAME = { x: 20, y: 20, width: 500, height: 305 } as const;

const PREF_CODE = /^(0[1-9]|[1-3][0-9]|4[0-7])$/;
const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;

/**
 * 県の形を描く投影を作る。沖縄県（47）は点線枠に移る。
 * d3 の投影は設定を変えられるので、呼ぶたびに新しく作る（返した投影を変えても、ほかに影響しない）。
 */
export function createProjection(prefCode: string): GeoProjection {
  assertPrefCode(prefCode);
  const { scale, translate } = prefCode === OKINAWA_PREF_CODE ? okinawaPlacement() : PROJECTION;
  return geoConicConformal()
    .rotate([-PROJECTION.centralMeridian, 0])
    .center([0, PROJECTION.centerLatitude])
    .parallels([...PROJECTION.parallels])
    .scale(scale)
    .translate([...translate]);
}

/**
 * 経緯度を viewBox の座標にする（県名ラベルの位置など、1点ずつの変換用）。沖縄県（47）は点線枠に移る。
 * 呼ぶたびに投影を作るので、形を描くときは `createProjection` を県ごとに1回呼んで `geoPath` に渡す。
 */
export function projectPoint(lonLat: LonLat, prefCode: string): Point {
  assertLonLat(lonLat);
  const point = createProjection(prefCode)([lonLat[0], lonLat[1]]);
  // d3 の型は null を含む。円錐図法は有限の経緯度なら null を返さないが、型を絞るために確かめる
  if (point === null) {
    throw new Error(`経緯度を投影できません（${lonLat.join(', ')}）`);
  }
  return [point[0], point[1]];
}

// p' = k·(S·raw + t) + d = (k·S)·raw + (k·t + d) なので、縮尺と位置を変えた同じ投影で表せる
function okinawaPlacement(): { readonly scale: number; readonly translate: Point } {
  const { scale: k, dx, dy } = OKINAWA_TRANSFORM;
  const [tx, ty] = PROJECTION.translate;
  return { scale: PROJECTION.scale * k, translate: [k * tx + dx, k * ty + dy] };
}

function assertPrefCode(prefCode: string): void {
  if (!PREF_CODE.test(prefCode)) {
    throw new Error(`県コードは 01〜47 の2桁で指定してください（${prefCode}）`);
  }
}

function assertLonLat([longitude, latitude]: LonLat): void {
  const isValid = Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= MAX_LONGITUDE && Math.abs(latitude) <= MAX_LATITUDE;
  if (!isValid) {
    throw new Error(`経緯度が正しくありません（${longitude}, ${latitude}）`);
  }
}
