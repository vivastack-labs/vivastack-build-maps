// ツールチップ（F-TIP-01・02、4.11.2・4.11.3）で、何を出すか・どこに出すかを決める規則。DOM を使わない純粋関数。
import type { Lang } from '@/i18n/lang';
import type { MuniProperties } from './muniLoader';
import { PREF_CODE_PATTERN } from './projection';
import type { PrefCode } from './state';

/** 市区町村コード（5桁の数字） */
const MUNI_CODE_PATTERN = /^\d{5}$/;

/** ホバーを持たない入力の種類（4.11.3） */
const TOUCH_POINTER_TYPE = 'touch';

/** マウスの位置からツールチップをずらす距離（px） */
export const TOOLTIP_OFFSET = 12;

/** `tooltipTarget` の入力。`pref`・`muni` は、マウスの下の要素の `data-pref`・`data-muni` の値（なければ `null`） */
export type TooltipInput = {
  readonly pref: string | null;
  readonly muni: string | null;
  /** 最大化している県 */
  readonly maximized: PrefCode | null;
  /** `mouse`・`pen`・`touch`（Pointer Events の pointerType） */
  readonly pointerType: string;
  /** 押しているボタン（`PointerEvent.buttons`。0 は押していない） */
  readonly buttons: number;
};

/** ツールチップを出す対象。出さないときは `null` */
export type TooltipTarget = { readonly kind: 'pref'; readonly code: PrefCode } | { readonly kind: 'muni'; readonly code: string } | null;

/**
 * マウスの下にあるものから、ツールチップを出す対象を決める（4.11.2 のホバーの行、4.11.3）。
 * - タッチと、ボタンを押している間（ドラッグでの移動中）は出さない。
 * - 最大化していないときは、県の上でその県。固定中かどうかは関係しない。
 * - 最大化中は、最大化した県の市区町村の上でだけ市区町村（ほかの県・市区町村のない所は出さない）。
 * 属性は外部から書き換えられうるので、県コード・市区町村コードの形を境界で確かめる。
 */
export function tooltipTarget({ pref, muni, maximized, pointerType, buttons }: TooltipInput): TooltipTarget {
  if (pointerType === TOUCH_POINTER_TYPE || buttons !== 0) return null;
  if (maximized !== null) {
    return muni !== null && MUNI_CODE_PATTERN.test(muni) && muni.startsWith(maximized) ? { kind: 'muni', code: muni } : null;
  }
  return pref !== null && PREF_CODE_PATTERN.test(pref) ? { kind: 'pref', code: pref } : null;
}

/** 市区町村のツールチップの文言。`reading` がなければ読みの行を出さない。`lang` は、名前が日本語のときに要素へ付ける（中国語のページ） */
export type MuniTooltipText = {
  readonly name: string;
  readonly reading: string | null;
  readonly lang: 'ja' | undefined;
};

/**
 * 市区町村のツールチップの文言を、ページの言語で決める（F-TIP-02、F-I18N-05）。
 * 日本語のページは名前（区は市名を含む「札幌市中央区」）と読み、英語のページはローマ字、中国語のページは日本語の漢字表記（読みは出さない）。
 */
export function muniTooltipText(properties: MuniProperties, lang: Lang): MuniTooltipText {
  if (lang === 'en') return { name: properties.name.en, reading: null, lang: undefined };
  if (lang === 'zh') return { name: properties.name.ja, reading: null, lang: 'ja' };
  return { name: properties.name.ja, reading: properties.kana, lang: undefined };
}

type Size = { readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };

/** 1つの軸で位置を決める。マウスの右（下）に出し、はみ出すなら左（上）に反転し、それでもはみ出すなら箱の内側に寄せる */
function placeAxis(pointer: number, length: number, boxLength: number): number {
  const after = pointer + TOOLTIP_OFFSET;
  if (after + length <= boxLength) return after;
  const before = pointer - TOOLTIP_OFFSET - length;
  if (before >= 0) return before;
  return Math.max(0, Math.min(after, boxLength - length));
}

/**
 * ツールチップの左上の位置（地図の箱の左上からの距離）を決める。
 * マウスの右下（`TOOLTIP_OFFSET` ずらす）に出し、箱の右・下にはみ出すなら左・上に反転する。反転してもはみ出すなら箱の内側に寄せる。
 */
export function tooltipPosition({ pointer, tooltip, box }: { readonly pointer: Point; readonly tooltip: Size; readonly box: Size }): Point {
  return { x: placeAxis(pointer.x, tooltip.width, box.width), y: placeAxis(pointer.y, tooltip.height, box.height) };
}
