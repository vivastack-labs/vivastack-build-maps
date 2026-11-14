'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { muniLoader, type MuniLoader, type MuniLoadStatus } from '@/features/map/muniLoader';
import type { PrefCode } from '@/features/map/state';

/** 読み込みの状態と、それがどの県のものか。`isRetry` は「再試行」で始めた読み込みか */
type Loaded = { readonly pref: PrefCode; readonly status: MuniLoadStatus; readonly isRetry: boolean };

/** `useMuniData` の戻り値 */
export type MuniData = {
  /** 読み込みの状態。最大化した県がないときは `null` */
  readonly status: MuniLoadStatus | null;
  /** 「再試行」で始めた読み込みが、まだ終わっていない（`loading`・`slow`） */
  readonly isRetrying: boolean;
  /** 同じ県を読み込み直す（失敗・オフラインのときの「再試行」） */
  readonly retry: () => void;
};

/**
 * 最大化した県（なければ `null`）の市区町村データを読み込み、その状態を返す（T2-07、F-MUNI-05、4.11.5）。
 * `pref` が変わったら読み込み、前の県の通知は使わない（読み込みそのものは続き、成功すればキャッシュに入る）。
 * 県が変わる・解除する・読み込み直すとき、前の状態は捨てる（同じ県をもう一度最大化した最初の描画に、前回の失敗が出ないようにする）。
 * T2-08 は `status.kind === 'loaded'` のときの `data` から市区町村を描く。
 */
export function useMuniData(pref: PrefCode | null, loader: MuniLoader = muniLoader): MuniData {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 最後に読み込みを始めたときの attempt。変わっていれば「再試行」で始めた読み込み
  const startedAttempt = useRef(attempt);

  useEffect(() => {
    if (pref === null) return;
    const isRetry = startedAttempt.current !== attempt;
    startedAttempt.current = attempt;
    let isCurrent = true;
    const notify = (status: MuniLoadStatus) => {
      if (isCurrent) setLoaded({ pref, status, isRetry });
    };
    // load が例外になるのは、県コードが不正なとき（呼ぶ側の誤り）だけ。画面を止めずに、読み込めなかった表示にする
    loader.load(pref, notify).catch(() => notify({ kind: 'failed', reason: 'invalid' }));
    return () => {
      isCurrent = false;
      setLoaded(null);
    };
  }, [pref, loader, attempt]);

  const retry = useCallback(() => setAttempt(count => count + 1), []);
  // 別の県の結果・最大化を解除した後の結果は使わない
  const current = pref !== null && loaded?.pref === pref ? loaded : null;
  const status = current?.status ?? null;
  const isRetrying = current !== null && current.isRetry && (status?.kind === 'loading' || status?.kind === 'slow');
  return { status, isRetrying, retry };
}
