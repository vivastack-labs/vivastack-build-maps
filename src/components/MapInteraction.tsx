'use client';

import { useLayoutEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { navigateKey, rovingPref, zoomKey } from '@/features/map/keyboard';
import { applyRovingTabIndex } from '@/features/map/mapDom';
import { prefFromTarget } from '@/features/map/pointer';
import type { PrefCode } from '@/features/map/state';
import { useMapState } from './MapStateProvider';
import { useMapZoom, type MapZoomControls } from './MapZoom';
import { dispatchKey, isPrefInside, usePrefInteraction } from './usePrefInteraction';

/** 県のパスにフォーカスを移す。要素がなければ何もしない（`code` は `navigateKey` が作る2桁の数字） */
function focusPref(root: HTMLElement, code: PrefCode): void {
  root.querySelector<SVGElement>(`[data-pref="${code}"]`)?.focus();
}

/**
 * 地図の県にフォーカスがあるときのキー（4.11.2、4.11.6）。
 * 矢印・Home・End はフォーカスを移し（ページのスクロールを止める）、`+` `-` `0` は拡大・縮小・全体表示（`MapZoom` の外では何もしない）。
 * それ以外（Enter・Space・Shift + Enter・Esc）は `mapReducer` の操作にする。
 */
function handleMapKey(event: KeyboardEvent<HTMLElement>, dispatch: Parameters<typeof dispatchKey>[1], zoom: MapZoomControls | null): void {
  const pref = prefFromTarget(event.target);
  if (pref !== null) {
    const next = navigateKey({ key: event.key, pref });
    if (next !== null) {
      event.preventDefault();
      focusPref(event.currentTarget, next);
      return;
    }
    const action = zoomKey(event.key);
    if (action !== null && zoom !== null) {
      event.preventDefault();
      if (action === 'reset') zoom.reset();
      else zoom.step(action === 'in' ? 1 : -1);
      return;
    }
  }
  dispatchKey(event, dispatch);
}

/**
 * 地図の `<svg>` を包み、マウス・タッチ・キーボードの操作を `mapReducer` につなぐ（F-CARD-01・07、F-ZOOM-04、F-KB-01〜05、4.11.1〜4.11.3、4.11.6）。
 * 結線は `usePrefInteraction`（県名さくいんと共通）。イベントはここでまとめて受け（委譲）、県は `data-pref` で引く。
 * 県のパスはサーバーの出力を描き直さず、状態は `aria-pressed`・`data-state` の属性で表す（D24、6.6 (2)）。
 * 県のパスの要素は作り直さない前提（作り直すと、状態と属性がずれる。子の参照を変えない）。
 * - Tab の停止位置は1つ（roving tabindex）。フォーカス中の県 → 固定中の県 → 北海道（`rovingPref`）に、`tabindex="0"` を書く。
 * - フォーカスのある県で、矢印・Home・End は県を移り、`+` `-` `0` は拡大・縮小・全体表示、Enter・Space・Shift + Enter・Esc は `mapReducer` の操作。
 * マウントしたら `data-map-ready` を付ける。E2E はハイドレーションが終わるのを、これで待つ。
 */
export function MapInteraction({ children }: { readonly children: ReactNode }) {
  const { dispatch } = useMapState();
  const zoom = useMapZoom();
  const [focused, setFocused] = useState<PrefCode | null>(null);
  const { ref, state, handlers, sendClick } = usePrefInteraction({
    readyAttribute: 'data-map-ready',
    onKey: event => handleMapKey(event, dispatch, zoom)
  });

  // 描画の直後に、Tab の停止位置を1つにそろえる。地図の中でフォーカスを移すときは停止位置も移す（移さないと Shift + Tab で停止位置が2つになる）
  useLayoutEffect(() => {
    if (ref.current) applyRovingTabIndex(ref.current, rovingPref({ focused, pinned: state.pinned }));
  }, [ref, focused, state.pinned]);

  return (
    <div
      ref={ref}
      className="group/map size-full"
      {...handlers}
      onFocus={event => {
        handlers.onFocus(event);
        const pref = prefFromTarget(event.target);
        if (pref !== null) setFocused(pref);
      }}
      onBlur={event => {
        handlers.onBlur(event);
        // 地図の中の別の県へ移るだけなら、移った先の focus が書く。さくいん（地図の外の `data-pref`）へ移ったときは、地図の外に出たとみなす
        if (!isPrefInside(event.currentTarget, event.relatedTarget)) setFocused(null);
      }}
      onClick={event => sendClick(event.target)}
    >
      {children}
    </div>
  );
}
