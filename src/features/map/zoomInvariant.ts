/**
 * 拡大しても画面の上の大きさが変わらない長さ（viewBox の単位 ÷ 倍率）を表す CSS の値。
 * 倍率は `MapZoom` が地図の層に書く CSS 変数 `--zoom-k`。変数がないとき（JavaScript なし）・倍率が1のときは、基準の大きさのまま。
 * 県境・県名ラベル・海域名・市区町村のラベルや線の太さに使う（`JapanMap`・`MuniLayer`）。
 */
export function zoomInvariant(size: number): string {
  return `calc(${size}px / var(--zoom-k, 1))`;
}
