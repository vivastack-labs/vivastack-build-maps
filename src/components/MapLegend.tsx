import { REGIONS, REGION_SWATCH_CLASS } from '@/features/map/regions';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang };

/**
 * 地図の凡例（F-MAP-03）。8地方の色見本と地方名を、地方の順に並べる。
 * 色見本は飾りなので、スクリーンリーダーには地方名だけを読ませる。「準備中」の項目は T3-02 で加える。
 */
export function MapLegend({ lang }: Props) {
  const { regions } = getMessages(lang);
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {REGIONS.map(region => (
        <li key={region} data-legend-region={region} className="flex items-center gap-1.5">
          <span data-swatch aria-hidden="true" className={`inline-block size-4 shrink-0 rounded-sm border border-map-border ${REGION_SWATCH_CLASS[region]}`} />
          <span>
            <RubyText text={regions[region]} />
          </span>
        </li>
      ))}
    </ul>
  );
}
