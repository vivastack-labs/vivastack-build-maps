// キーボードの操作を、状態遷移の操作（MapEvent）に変える規則（4.11.2）。DOM を使わない純粋関数。
import type { MapEvent, PrefCode } from './state';

/** `keyToMapEvent` の入力。`pref` は操作の対象（フォーカスしている）県 */
export type KeyInput = {
  /** `KeyboardEvent.key`。Space は `' '` */
  readonly key: string;
  readonly shiftKey: boolean;
  readonly pref: PrefCode | null;
};

/**
 * キーを `mapReducer` に渡す操作にする。対応する操作がなければ `null`（4.11.2）。
 * Enter・Space はクリック、Shift + Enter はダブルクリック、Esc は解除（F-KB-05。県がなくても返す）。県の外・ほかのキーは `null`。
 * 県名さくいん（T2-10）と地図（T2-11）が同じ規則を使う。
 */
export function keyToMapEvent({ key, shiftKey, pref }: KeyInput): MapEvent | null {
  if (key === 'Escape') return { type: 'escape' };
  if (pref === null) return null;
  if (key === 'Enter') return shiftKey ? { type: 'doubleClick', pref } : { type: 'click', pref };
  if (key === ' ' && !shiftKey) return { type: 'click', pref };
  return null;
}

const FIRST_PREF: PrefCode = '01';
const LAST_PREF: PrefCode = '47';
const PREF_CODE_LENGTH = 2;

const toPrefCode = (number: number): PrefCode => String(number).padStart(PREF_CODE_LENGTH, '0');

/**
 * 矢印・Home・End で移る先の県（4.11.6、F-KB-01）。←↑ は前の県、→↓ は次の県（県コード順）、Home は北海道、End は沖縄県。
 * 端では止まる（回り込まない）ので、北海道の ← は北海道を返す。矢印などでないキー・県がないときは `null`。
 * `pref` は境界で県コードの形を確かめてから渡す。
 */
export function navigateKey({ key, pref }: { readonly key: string; readonly pref: PrefCode | null }): PrefCode | null {
  if (pref === null) return null;
  const current = Number(pref);
  const first = Number(FIRST_PREF);
  const last = Number(LAST_PREF);
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return toPrefCode(Math.max(first, current - 1));
    case 'ArrowRight':
    case 'ArrowDown':
      return toPrefCode(Math.min(last, current + 1));
    case 'Home':
      return FIRST_PREF;
    case 'End':
      return LAST_PREF;
    default:
      return null;
  }
}

/** `zoomKey` の結果。拡大・縮小・全体表示 */
export type ZoomKeyAction = 'in' | 'out' | 'reset';

/**
 * `+` `-` `0` を拡大・縮小・全体表示にする（F-KB-04）。ほかのキーは `null`。
 * `+` は Shift を押して打つ配列があるので、Shift は見ない。Ctrl・Meta・Alt つきの除外は呼ぶ側で行う。
 */
export function zoomKey(key: string): ZoomKeyAction | null {
  switch (key) {
    case '+':
      return 'in';
    case '-':
      return 'out';
    case '0':
      return 'reset';
    default:
      return null;
  }
}

/**
 * Tab の停止位置（`tabindex="0"`）にする県（roving tabindex。F-KB-01）。
 * フォーカス中の県 → 固定中の県 → 北海道の順。
 */
export function rovingPref({ focused, pinned }: { readonly focused: PrefCode | null; readonly pinned: PrefCode | null }): PrefCode {
  return focused ?? pinned ?? FIRST_PREF;
}
