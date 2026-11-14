import { REGIONS, REGION_SWATCH_CLASS } from '@/features/map/regions';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { RubyText } from './RubyText';

type Props = {
  readonly lang: Lang;
  /** 県の一覧。「準備中」の県が1つ以上あるときだけ、凡例に「準備中」を出す */
  readonly prefectures: readonly PublishedPrefecture[];
};

/**
 * 地図の凡例（F-MAP-03）。8地方の色見本と地方名を、地方の順に並べる。
 * 色見本は飾りなので、スクリーンリーダーには地方名だけを読ませる。
 * 本番で「準備中」の県があるときは、最後に斜線の色見本つきの「準備中」を足す（4.11.4）。全県が揃った後・プレビューでは出さない。
 */
export function MapLegend({ lang, prefectures }: Props) {
  const { regions, comingSoon } = getMessages(lang);
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
      {prefectures.some(prefecture => prefecture.pending) && (
        <li data-legend-pending className="flex items-center gap-1.5">
          <span data-swatch aria-hidden="true" className="inline-block size-4 shrink-0 rounded-sm border border-map-border bg-pending-hatch" />
          <span>
            <RubyText text={comingSoon.label} />
          </span>
        </li>
      )}
    </ul>
  );
}
