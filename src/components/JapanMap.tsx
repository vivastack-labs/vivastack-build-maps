import { LABEL_FONT_SIZE, loadPrefPaths } from '@/features/map/prefPaths';
import { OKINAWA_FRAME, VIEWBOX } from '@/features/map/projection';
import { REGION_FILL_CLASS } from '@/features/map/regions';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import type { Prefecture } from '@/lib/content-schema.generated';
import { plainText } from '@/lib/ruby';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順）。名前と地方を引く。読み込みは呼ぶ側で1回だけ行う */
  readonly prefectures: readonly Prefecture[];
};

/** 海域名の文字の大きさ（viewBox の単位） */
const SEA_LABEL_FONT_SIZE = 24;
/** 海域名の位置（viewBox の座標。文字の中心） */
const SEA_LABEL_POSITIONS = {
  japanSea: { x: 370, y: 470 },
  pacific: { x: 830, y: 900 }
} as const;
/** 県名ラベルから省く、県の種類の字（都・府・県。中国語は县）。北海道は「道」なので省かない */
const PREF_SUFFIX = /[都府県县]$/u;

/** 県名ラベル。県の種類の字を省いて短くし、文字を大きくする（「青森」「东京」） */
function labelText(name: string): string {
  return plainText(name).replace(PREF_SUFFIX, '');
}

/**
 * 都道府県の地図（SVG。F-MAP-01〜04・06、D24）。ビルド時に HTML へ出力するので、JavaScript がなくても見える。
 * 色は `app/globals.css` の @theme の変数（ライト・ダーク。D26）。操作は T2-05、拡大・縮小は T2-06。
 * `<svg>` は親の箱いっぱいに広がる。箱の縦横比は `VIEWBOX` と同じにする（`MapArea`）。
 */
export function JapanMap({ lang, prefectures }: Props) {
  const messages = getMessages(lang);
  const pathByCode = new Map(loadPrefPaths().map(path => [path.code, path]));

  return (
    <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="group" aria-label={plainText(messages.map.label)} className="block size-full">
      <rect data-map-sea x={0} y={0} width={VIEWBOX.width} height={VIEWBOX.height} className="fill-map-sea" />
      <g data-map-layer>
        <g className="stroke-map-border" strokeWidth={0.8} strokeLinejoin="round">
          {prefectures.map(({ code, region, name }) => (
            <path key={code} data-pref={code} data-region={region} role="button" aria-label={plainText(name[lang])} d={pathByCode.get(code)?.d} className={REGION_FILL_CLASS[region]} />
          ))}
        </g>
        <rect data-okinawa-frame {...OKINAWA_FRAME} fill="none" strokeWidth={1.5} strokeDasharray="6 4" className="stroke-map-frame" />
        {(['japanSea', 'pacific'] as const).map(sea => (
          <text
            key={sea}
            data-sea-label
            {...SEA_LABEL_POSITIONS[sea]}
            fontSize={SEA_LABEL_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="central"
            className="pointer-events-none fill-map-sea-label select-none"
          >
            {plainText(messages.seas[sea])}
          </text>
        ))}
        {/* 5.2：パスの aria-label と重複するので、スクリーンリーダーには読ませない。F-MAP-01：幅820px以下では隠す */}
        <g
          data-pref-labels
          aria-hidden="true"
          className="pointer-events-none fill-map-label select-none max-map-label:hidden"
          fontSize={LABEL_FONT_SIZE[lang]}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {prefectures.map(({ code, name }) => {
            const label = pathByCode.get(code)?.labels[lang];
            return (
              <text key={code} data-pref-label={code} x={label?.x} y={label?.y}>
                {labelText(name[lang])}
              </text>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
