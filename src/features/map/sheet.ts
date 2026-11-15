// 768px 未満で、カードの領域が下から出るパネルになるときの状態（F-MAP-05、4.11.3・4.11.7）。画面から切り離した純粋関数。

/** パネルの状態。閉じている／一部だけ見える（見出しと最大化ボタン）／全部見える（画面の高さの約85%） */
export type SheetState = 'closed' | 'peek' | 'full';

/**
 * パネルになる幅（768px 未満）の `matchMedia` の条件。Tailwind の `md`（48rem）の手前と同じ境目で、
 * `CardSheet` の `max-md:` のクラスと合わせる。
 */
export const SHEET_QUERY = '(width < 48rem)';

/**
 * 1列の配置（1024px 未満。Tailwind の `lg`（64rem）の手前）の `matchMedia` の条件（4.11.7）。
 * この幅ではカードが県名さくいんの上にあり、さくいんのホバーでカードの高さが変わるとさくいんがずれるので、
 * さくいんのホバーではカードを変えない（`PrefIndexInteraction`。4.11.2）。
 */
export const ONE_COLUMN_QUERY = '(width < 64rem)';

/**
 * パネルの状態を決める。開閉は固定の有無に合わせる（固定した県がなければ閉じている。4.11.3）。
 * 固定があるときは、`expanded`（「くわしく」を押した）なら全部見える、そうでなければ一部だけ見える。
 * @param pinned 固定している県（`MapState.pinned`）
 * @param expanded 「くわしく」で広げているか
 */
export function sheetState({ pinned, expanded }: { readonly pinned: string | null; readonly expanded: boolean }): SheetState {
  if (pinned === null) return 'closed';
  return expanded ? 'full' : 'peek';
}
