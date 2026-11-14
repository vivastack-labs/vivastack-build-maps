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
 * Enter・Space はクリック、Shift + Enter はダブルクリック。県の外・ほかのキーは `null`。
 * 県名さくいん（T2-10）と地図（T2-11）が同じ規則を使う。
 */
export function keyToMapEvent({ key, shiftKey, pref }: KeyInput): MapEvent | null {
  if (pref === null) return null;
  if (key === 'Enter') return shiftKey ? { type: 'doubleClick', pref } : { type: 'click', pref };
  if (key === ' ' && !shiftKey) return { type: 'click', pref };
  return null;
}
