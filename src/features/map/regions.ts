import type { Prefecture } from '@/lib/content-schema.generated';

/** 地方のキー。コンテンツの region と同じ */
export type Region = Prefecture['region'];

/** 8地方（九州は沖縄を含む）。凡例に並べる順（F-MAP-03）。辞書 `regions` のキーの順と同じ */
export const REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'] as const satisfies readonly Region[];

// Tailwind は、ソースに書かれたクラス名の全体から CSS を作る。クラス名を組み立てずに、全体を書く（D26）。
// 色は app/globals.css の @theme の `--color-region-*`（ライト・ダークの両方）

/** 県の塗りのクラス */
export const REGION_FILL_CLASS: Readonly<Record<Region, string>> = {
  hokkaido: 'fill-region-hokkaido',
  tohoku: 'fill-region-tohoku',
  kanto: 'fill-region-kanto',
  chubu: 'fill-region-chubu',
  kinki: 'fill-region-kinki',
  chugoku: 'fill-region-chugoku',
  shikoku: 'fill-region-shikoku',
  kyushu: 'fill-region-kyushu'
};

/** 凡例の色見本の背景のクラス */
export const REGION_SWATCH_CLASS: Readonly<Record<Region, string>> = {
  hokkaido: 'bg-region-hokkaido',
  tohoku: 'bg-region-tohoku',
  kanto: 'bg-region-kanto',
  chubu: 'bg-region-chubu',
  kinki: 'bg-region-kinki',
  chugoku: 'bg-region-chugoku',
  shikoku: 'bg-region-shikoku',
  kyushu: 'bg-region-kyushu'
};
