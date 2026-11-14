'use client';

import { useCallback, useEffect, useState } from 'react';
import { muniLoader, type MuniLoader, type MuniStatus } from '@/features/map/muniLoader';
import type { PrefCode } from '@/features/map/state';

/** 読み込みの状態と、それがどの県のものか */
type Loaded = { readonly pref: PrefCode; readonly status: MuniStatus };

/**
 * 最大化した県（なければ `null`）の市区町村データを読み込み、その状態を返す（T2-07、F-MUNI-05、4.11.5）。
 * `pref` が変わったら読み込み、前の県の通知は使わない（読み込みそのものは続き、成功すればキャッシュに入る）。
 * `status` は、県がないときは `null`。`retry` は同じ県を読み込み直す（失敗・オフラインのときの「再試行」）。
 * T2-08 は `status.kind === 'loaded'` のときの `data` から市区町村を描く。
 */
export function useMuniData(pref: PrefCode | null, loader: MuniLoader = muniLoader): { readonly status: MuniStatus | null; readonly retry: () => void } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (pref === null) return;
    let isCurrent = true;
    const notify = (status: MuniStatus) => {
      if (isCurrent) setLoaded({ pref, status });
    };
    // load は例外にならない（失敗は状態で返る）。県コードが不正なときだけ例外になるので、失敗として表示する
    loader.load(pref, notify).catch(() => notify({ kind: 'failed', reason: 'invalid' }));
    return () => {
      isCurrent = false;
    };
  }, [pref, loader, attempt]);

  const retry = useCallback(() => setAttempt(count => count + 1), []);
  // 別の県の結果・最大化を解除した後の結果は使わない
  const status = pref !== null && loaded?.pref === pref ? loaded.status : null;
  return { status, retry };
}
