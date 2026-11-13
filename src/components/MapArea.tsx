import { VIEWBOX } from '@/features/map/projection';
import type { Lang } from '@/i18n/lang';
import type { Prefecture } from '@/lib/content-schema.generated';
import { JapanMap } from './JapanMap';
import { MapLegend } from './MapLegend';

type Props = {
  readonly lang: Lang;
  readonly prefectures: readonly Prefecture[];
};

/**
 * 地図の領域（4.11.7）。都道府県の地図（T2-04）と、その下の凡例。
 * 地図の箱の縦横比は地図の viewBox と同じにして、地図が入っても大きさが変わらない（レイアウトのずれを防ぐ）。
 */
export function MapArea({ lang, prefectures }: Props) {
  return (
    <section data-area="map" className="w-full min-w-0">
      <div data-map-box className="w-full overflow-hidden rounded" style={{ aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}` }}>
        <JapanMap lang={lang} prefectures={prefectures} />
      </div>
      <MapLegend lang={lang} />
    </section>
  );
}
