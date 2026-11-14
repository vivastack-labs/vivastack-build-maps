'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MuniLoader, MuniLoadStatus, MuniTopology } from '@/features/map/muniLoader';
import { cachedMuniShapes, muniShapes, type MuniShapes } from '@/features/map/muniShapes';
import type { PrefCode } from '@/features/map/state';
import { useMuniData, type MuniData } from './useMuniData';

/** 読み込みの状態。`loaded` は、データを描くもの（`shapes`）に変換できたときだけ */
export type MuniShapesStatus = Exclude<MuniLoadStatus, { readonly kind: 'loaded' }> | { readonly kind: 'loaded'; readonly data: MuniTopology; readonly shapes: MuniShapes };

/** `useMuniShapes` の戻り値。`useMuniData` の `status` を `MuniShapesStatus` にしたもの */
export type MuniShapesData = Omit<MuniData, 'status'> & { readonly status: MuniShapesStatus | null };

const INVALID: MuniShapesStatus = { kind: 'failed', reason: 'invalid' };
const LOADING: MuniShapesStatus = { kind: 'loading' };

/** 変換の結果と、それがどのデータ・県のものか（別の県・別のデータの結果を使わないため） */
type Converted = { readonly data: MuniTopology; readonly pref: PrefCode; readonly shapes: MuniShapes | null };

/** 変換する。形が壊れている（`null`）ほか、県コードの誤りで例外になったときも `null`（invalid）にする */
function convert(data: MuniTopology, pref: PrefCode): MuniShapes | null {
  try {
    return muniShapes(data, pref);
  } catch {
    return null;
  }
}

/**
 * 最大化した県の市区町村を読み込み、描くもの（`muniShapes`）に変換した状態を返す（T2-08）。
 * 読み込みは `useMuniData`（既定の `muniLoader` のキャッシュ）。変換は北海道で 50〜100ms かかるので、描画の中では行わず、
 * 読み込めたあとの effect から `setTimeout(0)` で行う（最大化の動きと県の形の表示を止めない）。変換が終わるまでは、読み込み中（`loading`）のまま。
 * すでに変換したデータ（同じ県をもう一度最大化したとき・地図と一覧など、ほかの部品が先に変換したとき）は、待たずに使う。
 * 県の切り替え・解除・アンマウントでは、変換の待ちを止め、古い結果は使わない。
 * 変換に失敗したら `{ kind: 'failed', reason: 'invalid' }`（「再試行」しても同じデータなので、また失敗する）。
 */
export function useMuniShapes(pref: PrefCode | null, loader?: MuniLoader): MuniShapesData {
  const { status, isRetrying, retry } = useMuniData(pref, loader);
  const [converted, setConverted] = useState<Converted | null>(null);
  const data = status?.kind === 'loaded' ? status.data : null;

  useEffect(() => {
    if (data === null || pref === null) return;
    const timer = setTimeout(() => setConverted({ data, pref, shapes: convert(data, pref) }), 0);
    return () => clearTimeout(timer);
  }, [data, pref]);

  const shaped = useMemo((): MuniShapesStatus | null => {
    if (status === null || pref === null) return null;
    if (status.kind !== 'loaded') return status;
    const cached = cachedMuniShapes(status.data, pref);
    const isConverted = converted?.data === status.data && converted.pref === pref;
    const shapes = cached !== undefined ? cached : isConverted ? converted.shapes : undefined;
    if (shapes === undefined) return LOADING;
    return shapes === null ? INVALID : { kind: 'loaded', data: status.data, shapes };
  }, [status, pref, converted]);
  return { status: shaped, isRetrying, retry };
}
