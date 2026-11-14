'use client';

import type { ReactNode } from 'react';
import { usePrefInteraction } from './usePrefInteraction';

/**
 * 地図の `<svg>` を包み、マウス・タッチの操作を `mapReducer` につなぐ（F-CARD-01・07、F-ZOOM-04、4.11.1〜4.11.3）。
 * イベントはここでまとめて受け（委譲）、県は `data-pref` で引く。
 * 県のパスはサーバーの出力を描き直さず、状態は `aria-pressed`・`data-state` の属性で表す（D24、6.6 (2)）。
 * 県のパスの要素は作り直さない前提（作り直すと、状態と属性がずれる。子の参照を変えない）。
 * マウントしたら `data-map-ready` を付ける。E2E はハイドレーションが終わるのを、これで待つ。
 */
export function MapInteraction({ children }: { readonly children: ReactNode }) {
  const { ref, handlers, sendClick } = usePrefInteraction({ readyAttribute: 'data-map-ready' });

  return (
    <div ref={ref} className="group/map size-full" {...handlers} onClick={event => sendClick(event.target)}>
      {children}
    </div>
  );
}
