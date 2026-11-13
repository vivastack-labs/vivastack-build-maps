'use client';

import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { applyPrefState } from '@/features/map/mapDom';
import { prefFromTarget, toMapEvent, type PointerKind } from '@/features/map/pointer';
import { useMapState } from './MapStateProvider';

/** 直前の pointerdown がないとき（キーボードなど）の入力の種類 */
const DEFAULT_POINTER_TYPE = 'mouse';

/**
 * 地図の `<svg>` を包み、マウス・タッチの操作を `mapReducer` につなぐ（F-CARD-01・07、F-ZOOM-04、4.11.1〜4.11.3）。
 * イベントはここでまとめて受け（委譲）、県は `data-pref` で引く。
 * 県のパスはサーバーの出力を描き直さず、状態は `aria-pressed`・`data-state` の属性で表す（D24、6.6 (2)）。
 * マウントしたら `data-map-ready` を付ける。E2E はハイドレーションが終わるのを、これで待つ。
 */
export function MapInteraction({ children }: { readonly children: ReactNode }) {
  const { state, dispatch } = useMapState();
  const ref = useRef<HTMLDivElement>(null);
  // click・dblclick は pointerType を確実に持たないブラウザがあるので、直前の pointerdown のものを使う
  const lastPointerType = useRef(DEFAULT_POINTER_TYPE);

  useEffect(() => {
    ref.current?.setAttribute('data-map-ready', '');
  }, []);

  useEffect(() => {
    if (ref.current) applyPrefState(ref.current, state);
  }, [state]);

  const send = (kind: PointerKind, target: EventTarget, pointerType: string, related?: EventTarget | null) => {
    const event = toMapEvent({ kind, pref: prefFromTarget(target), relatedPref: prefFromTarget(related ?? null), pointerType });
    if (event) dispatch(event);
  };

  return (
    <div
      ref={ref}
      className="size-full"
      onPointerDown={event => {
        lastPointerType.current = event.pointerType;
      }}
      onPointerOver={(event: PointerEvent) => send('over', event.target, event.pointerType)}
      onPointerOut={(event: PointerEvent) => send('out', event.target, event.pointerType, event.relatedTarget)}
      onClick={event => send('click', event.target, lastPointerType.current)}
      onDoubleClick={event => send('dblclick', event.target, lastPointerType.current)}
    >
      {children}
    </div>
  );
}
