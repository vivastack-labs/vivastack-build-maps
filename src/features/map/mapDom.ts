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
 * 県名ラベル（`[data-pref-label]`）にも `data-state` を書く（最大化した県のラベルは、市区町村のラベルと重なるので隠す。T2-08）。
 * 根の要素には、最大化中だけ `data-map-maximized`（最大化した県のコード）を書く（ほかの県を薄くする CSS が使う。F-MUNI-04）。
 */
export function applyPrefState(root: Element, state: MapState): void {
  setAttribute(root, 'data-map-maximized', state.maximized);
  for (const element of root.querySelectorAll('[data-pref]')) {
    const code = element.getAttribute('data-pref');
    setAttribute(element, 'aria-pressed', code !== null && state.pinned === code ? 'true' : 'false');
    setAttribute(element, 'data-state', displayStateOf(state, code));
  }
  for (const element of root.querySelectorAll('[data-pref-label]')) {
    setAttribute(element, 'data-state', state.maximized !== null && element.getAttribute('data-pref-label') === state.maximized ? 'maximized' : null);
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

/**
 * 市区町村のラベル（`[data-muni-label]`）を、地図の倍率 `k` に合わせて出し入れする（F-MUNI-02）。
 * 出はじめる倍率（`data-min-scale`）に届かないラベルだけ `visibility="hidden"` にする（属性だけを書き、要素は描き直さない）。
 */
export function applyLabelVisibility(root: ParentNode, k: number): void {
  for (const element of root.querySelectorAll('[data-muni-label]')) {
    const minScale = Number(element.getAttribute('data-min-scale'));
    setAttribute(element, 'visibility', minScale <= k ? null : 'hidden');
  }
}
