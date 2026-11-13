// 状態（MapState）を、サーバーで出力した DOM の属性に写す（D24、6.6 (2)）。
// 要素は描き直さず、属性だけを書き換える。見た目は `aria-pressed`・`data-state` のバリアントで書く（D26）。
import type { MapState, PrefCode } from './state';

/** 県の状態を表す `data-state` の値。通常はこの属性を付けない */
type PrefDisplayState = 'maximized' | 'pinned';

function displayStateOf(state: MapState, code: PrefCode | null): PrefDisplayState | null {
  if (code === null) return null;
  if (state.maximized === code) return 'maximized';
  return state.pinned === code ? 'pinned' : null;
}

/** 属性の値が違うときだけ書く（`null` なら属性を消す） */
function setAttribute(element: Element, name: string, value: string | null): void {
  if (element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/**
 * 地図の県のパス（`[data-pref]`）に、固定・最大化の状態を書く。
 * `aria-pressed` は固定中の県だけ `"true"`、`data-state` は `maximized`／`pinned`（なければ属性を消す）。
 */
export function applyPrefState(root: ParentNode, state: MapState): void {
  for (const element of root.querySelectorAll('[data-pref]')) {
    const code = element.getAttribute('data-pref');
    setAttribute(element, 'aria-pressed', code !== null && state.pinned === code ? 'true' : 'false');
    setAttribute(element, 'data-state', displayStateOf(state, code));
  }
}

/**
 * カードの領域の表示を切り替える。`[data-card-pref]` は表示する県だけ `hidden` を外し、
 * `[data-card-guide]`（案内文）は表示する県がないときだけ見せる。
 */
export function applyCardState(root: ParentNode, pref: PrefCode | null): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-card-pref]')) {
    element.hidden = element.getAttribute('data-card-pref') !== pref;
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-card-guide]')) {
    element.hidden = pref !== null;
  }
}
