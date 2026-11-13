'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { applyCardState } from '@/features/map/mapDom';
import { cardPref } from '@/features/map/state';
import { useMapState } from './MapStateProvider';

/**
 * カードの中身を包み、表示する県のカード（`[data-card-pref]`）だけ `hidden` を外す（F-CARD-01・07、4.11.1）。
 * 中身はサーバーで全県ぶんを出力し、ここでは属性だけを切り替える（6.6 (2)）。県がないときは案内文（`[data-card-guide]`）を見せる。
 */
export function CardSwitch({ children }: { readonly children: ReactNode }) {
  const { state } = useMapState();
  const ref = useRef<HTMLDivElement>(null);
  const pref = cardPref(state);

  useEffect(() => {
    if (ref.current) applyCardState(ref.current, pref);
  }, [pref]);

  return <div ref={ref}>{children}</div>;
}
