/**
 * 市区町村のラベルを選ぶ（T2-08、F-MUNI-02、F-I18N-05）。DOM を使わない純粋関数だけを置く。
 *
 * ラベルの文字の大きさは、地図の表示幅・拡大の倍率にかかわらず、画面の上で一定にする（#147）。
 * ここでの倍率 `p`（ラベルの倍率）は「viewBox の1単位が画面の何 px か」＝ 拡大の倍率 × 地図の幅 ÷ viewBox の幅（`labelScale`）。
 * ラベルの倍率 `p` のとき、ラベルの箱は viewBox の単位で `文字の幅 ÷ p` × `文字の高さ ÷ p` になる。
 * 倍率を上げると箱は小さくなるので、小さい市区町村にもラベルが入り、重なっていたラベルも離れる。
 */
import type { Lang } from '@/i18n/lang';
import type { MuniProperties } from './muniLoader';
import { VIEWBOX } from './projection';
import { MAX_ZOOM_SCALE } from './viewport';

/** ラベルの文字の大きさ（画面の上の px。地図の幅・拡大の倍率によらない）。スマートフォンでも読める大きさにする（#147） */
export const MUNI_LABEL_FONT_SIZE = 12;
/** ラベルの箱の高さ（文字の大きさに対する倍率）。行間を含む */
const LINE_HEIGHT = 1.2;
/** 英語の1字の幅（文字の大きさに対する倍率）。日本語・中国語は1字＝1倍 */
const LATIN_CHAR_WIDTH = 0.6;
/** ラベルの箱の余白（文字の大きさに対する倍率。重なりの判定に使い、ラベル同士がくっつかないようにする） */
const BOX_MARGIN = 0.3;
/** ラベルの倍率の段（下限から上限まで、この比で上げていく）。小さい段から順に選び、前の段で選んだラベルを残す */
const SCALE_STEP_RATIO = 1.19;
/** 1 より小さい段の数。下限は 1.19 の −8 乗（約 0.25）で、幅 360px の画面の地図（1単位が約 0.33px）で県を最大化したときより小さい */
const STEPS_BELOW_ONE = 8;
/** 地図の1単位の画面の大きさ（px）の想定の上限。地図の幅 2000px まで */
const MAX_PIXELS_PER_UNIT = 2;
/** ラベルの倍率の上限。拡大の上限（`MAX_ZOOM_SCALE`）× 地図の1単位の画面の大きさの上限 */
const MAX_LABEL_SCALE = MAX_ZOOM_SCALE * MAX_PIXELS_PER_UNIT;

/** ラベルの候補。座標は viewBox の座標。`width`・`height` は、いちばん大きなポリゴンの外接矩形 */
export type LabelCandidate = {
  readonly code: string;
  readonly text: string;
  /** ラベルの中心 */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 優先の順（大きいほど先に選ぶ）に使う面積 */
  readonly area: number;
};

/** 選ばれたラベル。ラベルの倍率（`labelScale`）が `minScale` 以上のときに出す */
export type PlacedLabel = {
  readonly code: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly minScale: number;
};

/**
 * ラベルの倍率（viewBox の1単位が画面の何 px か）＝ 拡大の倍率 × 地図の幅（画面の px）÷ viewBox の幅（#147）。
 * 地図の幅が分からない（0 以下・数でない）ときは、拡大の倍率だけで決める（1単位＝1px とみなす）。
 */
export function labelScale(zoomScale: number, mapWidth: number): number {
  return Number.isFinite(mapWidth) && mapWidth > 0 ? (zoomScale * mapWidth) / VIEWBOX.width : zoomScale;
}

/** 文字の幅の推定。DOM を使わない（日本語・中国語は1字＝文字の大きさ、英語は0.6倍） */
export function estimateLabelWidth(text: string, lang: Lang, fontSize: number): number {
  const charWidth = lang === 'en' ? LATIN_CHAR_WIDTH : 1;
  return [...text].length * fontSize * charWidth;
}

/**
 * 地図のラベルの文言（F-I18N-05）。区は区名だけにする（「札幌市中央区」→「中央区」、「Chuo-ku, Sapporo-shi」→「Chuo-ku」）。
 * 中国語のページは日本語の漢字表記（`name.ja`）。
 */
export function muniLabelText({ name, cityName }: MuniProperties, lang: Lang): string {
  if (lang === 'en') return name.en.split(', ')[0] ?? name.en;
  if (cityName !== undefined && name.ja.startsWith(cityName) && name.ja.length > cityName.length) return name.ja.slice(cityName.length);
  return name.ja;
}

type Box = { readonly halfWidth: number; readonly halfHeight: number };

/** ラベルの倍率 `k` でのラベルの箱の半分の大きさ（viewBox の単位） */
function boxAt(text: string, lang: Lang, k: number): Box {
  return { halfWidth: estimateLabelWidth(text, lang, MUNI_LABEL_FONT_SIZE) / k / 2, halfHeight: (MUNI_LABEL_FONT_SIZE * LINE_HEIGHT) / k / 2 };
}

function fits(candidate: LabelCandidate, lang: Lang, k: number): boolean {
  const { halfWidth, halfHeight } = boxAt(candidate.text, lang, k);
  return halfWidth * 2 <= candidate.width && halfHeight * 2 <= candidate.height;
}

function overlaps(a: LabelCandidate, b: LabelCandidate, lang: Lang, k: number): boolean {
  const boxA = boxAt(a.text, lang, k);
  const boxB = boxAt(b.text, lang, k);
  const margin = (MUNI_LABEL_FONT_SIZE * BOX_MARGIN) / k;
  return Math.abs(a.x - b.x) < boxA.halfWidth + boxB.halfWidth + margin && Math.abs(a.y - b.y) < boxA.halfHeight + boxB.halfHeight + margin;
}

/** ラベルの倍率の段（1.19 の −8 乗, …, 1, 1.19, …, 上限）。1 を必ず通り、上限は最後に必ず入れる */
function scaleSteps(): readonly number[] {
  const steps: number[] = [];
  // 掛け算を重ねると誤差で 1 を少し超えるので、段ごとに累乗で求める
  for (let i = -STEPS_BELOW_ONE; SCALE_STEP_RATIO ** i < MAX_LABEL_SCALE; i += 1) steps.push(SCALE_STEP_RATIO ** i);
  return [...steps, MAX_LABEL_SCALE];
}

/**
 * 候補から、表示するラベルを選び、出はじめるラベルの倍率（`minScale`。`labelScale` と比べる）を付ける（F-MUNI-02）。
 * ラベルの倍率の段を下から順にたどり、各段で面積の大きい順に、「外接矩形に入る」「選んだラベルと重ならない」ものを足す。
 * 前の段で選んだラベルは残す。段を上げると箱は小さくなるので、選んだラベル同士は重ならないままで、倍率を上げても数は減らない。
 * 上限の倍率でも外接矩形に入らない候補は選ばない。
 */
export function selectLabels(candidates: readonly LabelCandidate[], lang: Lang): readonly PlacedLabel[] {
  const ordered = [...candidates].sort((a, b) => b.area - a.area);
  const selected: { readonly candidate: LabelCandidate; readonly minScale: number }[] = [];
  const chosen = new Set<string>();
  for (const k of scaleSteps()) {
    for (const candidate of ordered) {
      if (chosen.has(candidate.code) || !fits(candidate, lang, k)) continue;
      if (selected.some(other => overlaps(candidate, other.candidate, lang, k))) continue;
      selected.push({ candidate, minScale: k });
      chosen.add(candidate.code);
    }
  }
  return selected.map(({ candidate: { code, text, x, y }, minScale }) => ({ code, text, x, y, minScale }));
}

/** ラベルの倍率 `k`（`labelScale`）で表示するラベル */
export function visibleLabels(labels: readonly PlacedLabel[], k: number): readonly PlacedLabel[] {
  return labels.filter(label => label.minScale <= k);
}
