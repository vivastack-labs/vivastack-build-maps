'use client';

import { muniLoader, type MuniLoader, type MuniTopology } from '@/features/map/muniLoader';
import type { PrefCode } from '@/features/map/state';
import { useResourceData, type ResourceData } from './useResourceData';

/** `useMuniData` の戻り値 */
export type MuniData = ResourceData<MuniTopology>;

/**
 * 最大化した県（なければ `null`）の市区町村データを読み込み、その状態を返す（T2-07、F-MUNI-05、4.11.5）。
 * 状態の扱い（前の県の通知を使わない、再試行）は `useResourceData`（カードの読み込みと共通）。
 * T2-08 は `status.kind === 'loaded'` のときの `data` から市区町村を描く。
 */
export function useMuniData(pref: PrefCode | null, loader: MuniLoader = muniLoader): MuniData {
  return useResourceData(pref, loader);
}
