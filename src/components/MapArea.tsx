import { VIEWBOX } from '@/features/map/projection';

/**
 * 地図の領域（4.11.7）。T2-04 の `JapanMap` が入るまでの仮の箱。
 * 縦横比を地図の viewBox と同じにして、地図が入っても大きさが変わらない（レイアウトのずれを防ぐ）。
 */
export function MapArea() {
  return <section data-area="map" className="w-full min-w-0 rounded bg-slate-100" style={{ aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}` }} />;
}
