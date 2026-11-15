// 画面の操作（DOM のイベント）を、状態遷移の操作（MapEvent）に変える規則（4.11.1〜4.11.3）。
// DOM の要素は `prefFromTarget` だけが受け取り、`toMapEvent` は値だけを扱う純粋関数。
import { PREF_CODE_PATTERN } from './projection';
import type { MapEvent, PrefCode } from './state';

/** `toMapEvent` に渡す、DOM のイベントの種類 */
export type PointerKind = 'over' | 'out' | 'click' | 'dblclick';

/** `toMapEvent` の入力。`pref` はイベントの対象の県、`relatedPref` は `out` で移った先の県 */
export type PointerInput = {
  readonly kind: PointerKind;
  readonly pref: PrefCode | null;
  readonly relatedPref?: PrefCode | null;
  /** `mouse`・`pen`・`touch`（Pointer Events の pointerType） */
  readonly pointerType: string;
};

/** ホバーを持たない入力の種類（4.11.3） */
const TOUCH_POINTER_TYPE = 'touch';

/**
 * `selector` に合う祖先（自分を含む）の、`attributes` のうち最初にある属性の値が県コードの形のときだけ、その値を返す。
 * 属性は外部から書き換えられうるので、境界で形を確かめる。
 */
function closestPrefCode(target: EventTarget | null, selector: string, attributes: readonly string[]): PrefCode | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  const owner = target.closest(selector);
  const code = attributes.map(attribute => owner?.getAttribute(attribute) ?? null).find(value => value !== null) ?? null;
  return code !== null && PREF_CODE_PATTERN.test(code) ? code : null;
}

/**
 * イベントの対象から、県コードを引く。`data-pref`（県の形）か `data-muni-pref`（最大化した県の市区町村の層。T2-08）を持つ
 * 祖先（自分を含む）の値が県コードの形のときだけ返す。属性は外部から書き換えられうるので、境界で確かめる。
 */
export function prefFromTarget(target: EventTarget | null): PrefCode | null {
  return closestPrefCode(target, '[data-pref], [data-muni-pref]', ['data-pref', 'data-muni-pref']);
}

/**
 * イベントの対象から、`attribute`（例：カードの最大化ボタンの `data-card-maximize`。F-CARD-08）を持つ祖先（自分を含む）の県コードを引く。
 * 値が県コードの形でなければ `null`。
 */
export function prefFromAttribute(target: EventTarget | null, attribute: string): PrefCode | null {
  return closestPrefCode(target, `[${attribute}]`, [attribute]);
}

function overToEvent({ pref, pointerType }: PointerInput): MapEvent | null {
  if (pointerType === TOUCH_POINTER_TYPE || pref === null) return null;
  return { type: 'hover', pref };
}

function outToEvent({ pref, relatedPref = null, pointerType }: PointerInput): MapEvent | null {
  if (pointerType === TOUCH_POINTER_TYPE || pref === null || pref === relatedPref) return null;
  return { type: 'hoverEnd' };
}

function clickToEvent({ pref }: PointerInput): MapEvent {
  return pref === null ? { type: 'backgroundClick' } : { type: 'click', pref };
}

function dblclickToEvent({ pref, pointerType }: PointerInput): MapEvent | null {
  if (pointerType === TOUCH_POINTER_TYPE || pref === null) return null;
  return { type: 'doubleClick', pref };
}

/**
 * DOM のイベントを `mapReducer` に渡す操作にする。対応する操作がなければ `null`。
 * - ホバー（`over`・`out`）はマウス・ペンだけ。タッチはホバーを持たない（4.11.3）。
 * - クリックはタップを含む。県の外（海・余白・点線枠）のクリックは `backgroundClick`。
 * - ダブルクリックはマウス・ペンで県の上だけ。ダブルタップは使わない（4.11.3）。
 */
export function toMapEvent(input: PointerInput): MapEvent | null {
  switch (input.kind) {
    case 'over':
      return overToEvent(input);
    case 'out':
      return outToEvent(input);
    case 'click':
      return clickToEvent(input);
    case 'dblclick':
      return dblclickToEvent(input);
  }
}
