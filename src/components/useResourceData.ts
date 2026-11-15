'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadStatus, ResourceLoader } from '@/features/loader/resourceLoader';

/** 読み込みの状態と、それがどのキー（県コード）のものか。`isRetry` は「再試行」で始めた読み込みか */
type Loaded<T> = { readonly key: string; readonly status: LoadStatus<T>; readonly isRetry: boolean };

/** `useResourceData` の戻り値 */
export type ResourceData<T> = {
  /** 読み込みの状態。キーがないときは `null` */
  readonly status: LoadStatus<T> | null;
  /** 「再試行」で始めた読み込みが、まだ終わっていない（`loading`・`slow`） */
  readonly isRetrying: boolean;
  /** 同じキーを読み込み直す（失敗・オフラインのときの「再試行」） */
  readonly retry: () => void;
};

/**
 * キー（県コード。なければ `null`）のデータを読み込み、その状態を返す（T2-07・T3-09、4.11.5）。市区町村（`useMuniData`）とカード（`CardDetails`）で共通。
 * `key` が変わったら読み込み、前のキーの通知は使わない（読み込みそのものは続き、成功すればキャッシュに入る）。
 * キーが変わる・なくなる・読み込み直すとき、前の状態は捨てる（同じ県をもう一度選んだ最初の描画に、前回の失敗が出ないようにする）。
 */
export function useResourceData<T>(key: string | null, loader: ResourceLoader<T>): ResourceData<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 最後に読み込みを始めたときの attempt。変わっていれば「再試行」で始めた読み込み
  const startedAttempt = useRef(attempt);

  useEffect(() => {
    if (key === null) return;
    const isRetry = startedAttempt.current !== attempt;
    startedAttempt.current = attempt;
    let isCurrent = true;
    const notify = (status: LoadStatus<T>) => {
      if (isCurrent) setLoaded({ key, status, isRetry });
    };
    // load が例外になるのは、キーの形が不正なとき（呼ぶ側の誤り）だけ。画面を止めずに、読み込めなかった表示にする
    loader.load(key, notify).catch(() => notify({ kind: 'failed', reason: 'invalid' }));
    return () => {
      isCurrent = false;
      setLoaded(null);
    };
  }, [key, loader, attempt]);

  const retry = useCallback(() => setAttempt(count => count + 1), []);
  // 別のキーの結果・キーがなくなった後の結果は使わない
  const current = key !== null && loaded?.key === key ? loaded : null;
  const status = current?.status ?? null;
  const isRetrying = current !== null && current.isRetry && (status?.kind === 'loading' || status?.kind === 'slow');
  return { status, isRetrying, retry };
}
