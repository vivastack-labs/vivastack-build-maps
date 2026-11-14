import type { Prefecture } from '@/lib/content-schema.generated';
import type { Shade } from './muniShapes';

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

/**
 * 「準備中」の県の塗りのクラス（T3-02、4.11.4）。`JapanMap` の `<defs>` にある斜線の `<pattern>` で塗る。
 * `PENDING_PATTERN_ID` と合わせる。色は app/globals.css の `--color-map-pending`・`--color-map-pending-stripe`
 */
export const PENDING_FILL_CLASS = 'fill-[url(#pref-pending-hatch)]';

/** 「準備中」の斜線の `<pattern>` の id（`PENDING_FILL_CLASS` の url と同じ） */
export const PENDING_PATTERN_ID = 'pref-pending-hatch';

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

/**
 * 市区町村の塗りのクラス（濃淡の段階 0〜4。T2-08、F-MUNI-01）。マウスをのせたときの塗りも含む。
 * 色は app/globals.css の `--color-muni-*`
 */
export const MUNI_SHADE_CLASS: Readonly<Record<Shade, string>> = {
  0: 'fill-muni-0 hover:fill-muni-hover',
  1: 'fill-muni-1 hover:fill-muni-hover',
  2: 'fill-muni-2 hover:fill-muni-hover',
  3: 'fill-muni-3 hover:fill-muni-hover',
  4: 'fill-muni-4 hover:fill-muni-hover'
};
