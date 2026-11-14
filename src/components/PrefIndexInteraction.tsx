'use client';

import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { keyToMapEvent } from '@/features/map/keyboard';
import { applyPrefState } from '@/features/map/mapDom';
import { prefFromTarget, toMapEvent, type PointerKind } from '@/features/map/pointer';
import { useMapState } from './MapStateProvider';

/** 直前の pointerdown がないとき（キーボードなど）の入力の種類 */
const DEFAULT_POINTER_TYPE = 'mouse';

/**
 * 県名さくいん（`PrefIndex`）を包み、操作を `mapReducer` につなぐ（F-IDX-02・03、4.11.2、6.6 (2)）。
 * `MapInteraction` と同じく、イベントはここでまとめて受け（委譲）、県は `data-pref` で引く。
 * 状態は項目の `aria-pressed`・`data-state` の属性で表す（要素は描き直さない）。
 * - 項目の外（項目と項目の間・見出し）のクリックは無視する。海・余白のクリックで固定を解除するのは地図の操作。
 * - JavaScript があるときは、項目のクリックでリンクの移動を止める（ハッシュの反映は T3-07）。
 * - キーボード：Enter・Space＝クリック、Shift + Enter＝ダブルクリック（`keyToMapEvent`）。キーボードのフォーカス（`:focus-visible`）＝ホバー。
 * マウントしたら `data-index-ready` を付ける。E2E はハイドレーションが終わるのを、これで待つ。
 */
export function PrefIndexInteraction({ children }: { readonly children: ReactNode }) {
  const { state, dispatch } = useMapState();
  const ref = useRef<HTMLDivElement>(null);
  // click・dblclick は pointerType を確実に持たないブラウザがあるので、直前の pointerdown のものを使う
  const lastPointerType = useRef(DEFAULT_POINTER_TYPE);

  useEffect(() => {
    ref.current?.setAttribute('data-index-ready', '');
  }, []);

  // 描画の直後（画面に出る前）に書き、ホバーの見た目が1フレーム遅れないようにする
  useLayoutEffect(() => {
    if (ref.current) applyPrefState(ref.current, state);
  }, [state]);

  const send = (kind: PointerKind, target: EventTarget, pointerType: string, related?: EventTarget | null) => {
    const event = toMapEvent({ kind, pref: prefFromTarget(target), relatedPref: prefFromTarget(related ?? null), pointerType });
    if (event) dispatch(event);
  };

  const onClick = (event: MouseEvent) => {
    // 項目の外のクリックは、地図の「海のクリック」（固定の解除）にしない
    if (prefFromTarget(event.target) === null) return;
    // リンクの移動を止める（ページが飛ばない。ダブルクリックで2回移動もしない）
    event.preventDefault();
    send('click', event.target, lastPointerType.current);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const mapEvent = keyToMapEvent({ key: event.key, shiftKey: event.shiftKey, pref: prefFromTarget(event.target) });
    if (!mapEvent) return;
    // Enter のリンクの移動・Shift + Enter の新しいウィンドウ・Space のスクロールを止め、click を経由せず直接渡す
    event.preventDefault();
    dispatch(mapEvent);
  };

  // タップなど、キーボードでないフォーカスではホバーを出さない（4.11.3）
  const onFocus = (event: FocusEvent) => {
    const pref = prefFromTarget(event.target);
    if (pref !== null && event.target.matches(':focus-visible')) dispatch({ type: 'hover', pref });
  };

  const onBlur = (event: FocusEvent) => {
    // 別の項目へ移るだけなら解除しない（移った先のホバーは focus で書く。マウスで移ったときは、マウスのホバーを残す）
    if (prefFromTarget(event.target) !== null && prefFromTarget(event.relatedTarget) === null) dispatch({ type: 'hoverEnd' });
  };

  return (
    <div
      ref={ref}
      onPointerDown={event => {
        lastPointerType.current = event.pointerType;
      }}
      onPointerOver={(event: PointerEvent) => send('over', event.target, event.pointerType)}
      onPointerOut={(event: PointerEvent) => send('out', event.target, event.pointerType, event.relatedTarget)}
      onClick={onClick}
      onDoubleClick={event => send('dblclick', event.target, lastPointerType.current)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
    </div>
  );
}
