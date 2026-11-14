'use client';

import { useMemo } from 'react';
import type { MuniLoader, MuniLoadStatus, MuniTopology } from '@/features/map/muniLoader';
import { muniShapes, type MuniShapes } from '@/features/map/muniShapes';
import type { PrefCode } from '@/features/map/state';
import { useMuniData, type MuniData } from './useMuniData';

/** 読み込みの状態。`loaded` は、データを描くもの（`shapes`）に変換できたときだけ */
export type MuniShapesStatus = Exclude<MuniLoadStatus, { readonly kind: 'loaded' }> | { readonly kind: 'loaded'; readonly data: MuniTopology; readonly shapes: MuniShapes };

/** `useMuniShapes` の戻り値。`useMuniData` の `status` を `MuniShapesStatus` にしたもの */
export type MuniShapesData = Omit<MuniData, 'status'> & { readonly status: MuniShapesStatus | null };

const INVALID: MuniShapesStatus = { kind: 'failed', reason: 'invalid' };

/**
 * 最大化した県の市区町村を読み込み、描くもの（`muniShapes`）に変換した状態を返す（T2-08）。
 * 読み込みは `useMuniData`（既定の `muniLoader` のキャッシュ）、変換は同じデータなら1回（`muniShapes` が覚える）なので、
 * 地図・カードの一覧・状態の表示がそれぞれ呼んでも、読み込みも変換も1回で済む。
 * 変換に失敗したら `{ kind: 'failed', reason: 'invalid' }`（「再試行」しても同じデータなので、また失敗する）。
 */
export function useMuniShapes(pref: PrefCode | null, loader?: MuniLoader): MuniShapesData {
  const { status, isRetrying, retry } = useMuniData(pref, loader);
  const shaped = useMemo((): MuniShapesStatus | null => {
    if (status === null || status.kind !== 'loaded') return status;
    const shapes = pref === null ? null : muniShapes(status.data, pref);
    return shapes === null ? INVALID : { kind: 'loaded', data: status.data, shapes };
  }, [status, pref]);
  return { status: shaped, isRetrying, retry };
}
