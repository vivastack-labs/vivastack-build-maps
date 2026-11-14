import { loadPrefPaths } from '@/features/map/prefPaths';
import { VIEWBOX } from '@/features/map/projection';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { Prefecture } from '@/lib/content-schema.generated';
import { JapanMap } from './JapanMap';
import { MapInteraction } from './MapInteraction';
import { MapLegend } from './MapLegend';
import { MapZoom, type PrefBounds } from './MapZoom';

type Props = {
  readonly lang: Lang;
  readonly prefectures: readonly Prefecture[];
};

/** 県コード → 寄る範囲・移動できる範囲。ビルド時に求めて `MapZoom` に渡す（47県で約3KB） */
function prefBounds(): Readonly<Record<string, PrefBounds>> {
  return Object.fromEntries(loadPrefPaths().map(({ code, fitBounds, panBounds }) => [code, { fit: fitBounds, pan: panBounds }]));
}

/**
 * 地図の領域（4.11.7）。都道府県の地図（T2-04）と、その下の凡例。地図の操作は `MapInteraction`（T2-05）、拡大・縮小・移動は `MapZoom`（T2-06）。どちらも `MapStateProvider` の中に置く。
 * 地図の箱の縦横比は地図の viewBox と同じにして、地図が入っても大きさが変わらない（レイアウトのずれを防ぐ）。
 */
export function MapArea({ lang, prefectures }: Props) {
  return (
    <section data-area="map" className="w-full min-w-0">
      <div data-map-box className="w-full overflow-hidden rounded" style={{ aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}` }}>
        <MapZoom bounds={prefBounds()} labels={getMessages(lang).zoom}>
          <MapInteraction>
            <JapanMap lang={lang} prefectures={prefectures} />
          </MapInteraction>
        </MapZoom>
      </div>
      <MapLegend lang={lang} />
    </section>
  );
}
