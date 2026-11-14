'use client';

import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { applyCardState } from '@/features/map/mapDom';
import { prefFromAttribute } from '@/features/map/pointer';
import { cardPref } from '@/features/map/state';
import { useMapState } from './MapStateProvider';

/**
 * カードの中身を包み、表示する県のカード（`[data-card-pref]`）だけ `hidden` を外す（F-CARD-01・07、4.11.1）。
 * 中身はサーバーで全県ぶんを出力し、ここでは属性だけを切り替える（6.6 (2)）。県がないときは案内文（`[data-card-guide]`）を見せる。
 * 最大化ボタン（`[data-card-maximize]`。F-CARD-08・F-ZOOM-04）は、JavaScript がないと動かないので `hidden` で出力されており、マウントしたら外す。
 * ボタンのクリックは、地図の県のダブルクリックと同じ `doubleClick`（最大化＋固定、同じ県なら元に戻す。固定は残す。4.11.2）を送り、
 * 最大化中の県のボタンは「元の大きさにもどす」の文言にする。マウントすると根に `data-card-ready` を付ける（`:target` の規則を止め、E2E が待つ）。
 */
export function CardSwitch({ children }: { readonly children: ReactNode }) {
  const { state, dispatch } = useMapState();
  const ref = useRef<HTMLDivElement>(null);
  const pref = cardPref(state);
  const { maximized } = state;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const button of root.querySelectorAll<HTMLElement>('[data-card-maximize]')) button.hidden = false;
    root.setAttribute('data-card-ready', '');
  }, []);

  useLayoutEffect(() => {
    if (ref.current) applyCardState(ref.current, pref, maximized);
  }, [pref, maximized]);

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const code = prefFromAttribute(event.target, 'data-card-maximize');
    if (code !== null) dispatch({ type: 'doubleClick', pref: code });
  };

  return (
    // 中身のボタンのクリックをまとめて受ける（イベントの委譲。要素ごとにクライアントコンポーネントを作らない）
    <div ref={ref} data-card-switch onClick={onClick}>
      {children}
    </div>
  );
}
