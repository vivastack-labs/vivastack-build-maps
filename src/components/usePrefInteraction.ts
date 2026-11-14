'use client';

import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { keyToMapEvent } from '@/features/map/keyboard';
import { applyPrefState } from '@/features/map/mapDom';
import { prefFromTarget, toMapEvent, type PointerKind } from '@/features/map/pointer';
import type { MapState } from '@/features/map/state';
import { useMapState } from './MapStateProvider';

/** 直前の pointerdown がないとき（キーボードなど）の入力の種類 */
const DEFAULT_POINTER_TYPE = 'mouse';

type Dispatch = ReturnType<typeof useMapState>['dispatch'];

/** Ctrl・Meta・Alt（Shift は Shift + Enter に使うので含めない）が押されているか */
export function hasModifier(event: { readonly ctrlKey: boolean; readonly metaKey: boolean; readonly altKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * キーを `keyToMapEvent` で `mapReducer` の操作にして渡す（Enter・Space＝クリック、Shift + Enter＝ダブルクリック、Esc＝解除。4.11.2）。
 * 対応するキーなら、Enter のリンクの移動・Shift + Enter の新しいウィンドウ・Space のスクロールを止め、click を経由せず直接渡す。
 * 渡したら `true`。
 */
export function dispatchKey(event: KeyboardEvent, dispatch: Dispatch): boolean {
  const mapEvent = keyToMapEvent({ key: event.key, shiftKey: event.shiftKey, pref: prefFromTarget(event.target) });
  if (!mapEvent) return false;
  event.preventDefault();
  dispatch(mapEvent);
  return true;
}

/** キーボードでのフォーカス（`:focus-visible`）をホバーにする。タップなど、キーボードでないフォーカスではホバーを出さない（4.11.3） */
function handleFocus(event: FocusEvent, dispatch: Dispatch): void {
  const pref = prefFromTarget(event.target);
  if (pref !== null && event.target.matches(':focus-visible')) dispatch({ type: 'hover', pref });
}

/** 県からフォーカスが外れたらホバーを解除する。別の県へ移るだけなら解除しない（移った先のホバーは focus で書く。マウスで移ったときは、マウスのホバーを残す） */
function handleBlur(event: FocusEvent, dispatch: Dispatch): void {
  if (prefFromTarget(event.target) !== null && prefFromTarget(event.relatedTarget) === null) dispatch({ type: 'hoverEnd' });
}

type Options = {
  /** マウントしたら根に付ける属性（E2E がハイドレーションの完了を待つ）。`data-map-ready`・`data-index-ready` */
  readonly readyAttribute: string;
  /**
   * キーの処理。Ctrl・Meta・Alt つきとキーの繰り返しは、呼ぶ前に除く。
   * 省くと `dispatchKey`（Enter・Space・Shift + Enter・Esc）だけを行う
   */
  readonly onKey?: (event: KeyboardEvent) => void;
};

/** 根の要素に付けるイベントのハンドラー（`onClick` は呼ぶ側が決める） */
type Handlers = {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerOver: (event: PointerEvent) => void;
  readonly onPointerOut: (event: PointerEvent) => void;
  readonly onDoubleClick: (event: MouseEvent) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onFocus: (event: FocusEvent) => void;
  readonly onBlur: (event: FocusEvent) => void;
};

type Result = {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly state: MapState;
  readonly dispatch: Dispatch;
  readonly handlers: Handlers;
  /** クリックを `mapReducer` に渡す（直前の pointerdown の種類で、タッチかどうかを決める） */
  readonly sendClick: (target: EventTarget) => void;
};

/**
 * 地図（`MapInteraction`）と県名さくいん（`PrefIndexInteraction`）に共通の結線（4.11.1〜4.11.3、6.6 (2)）。
 * 根の要素の `ref`、イベントのハンドラー（ポインター・ダブルクリック・キー・フォーカス）、状態を根の属性に書く effect、`data-*-ready` を持つ。
 * イベントはまとめて受け（委譲）、県は `data-pref` で引く。キーボードのフォーカス（`:focus-visible`）＝ホバー（F-KB-01）。
 * Ctrl・Meta・Alt つきとキーの繰り返しのキーは無視する。
 */
export function usePrefInteraction({ readyAttribute, onKey }: Options): Result {
  const { state, dispatch } = useMapState();
  const ref = useRef<HTMLDivElement>(null);
  // click・dblclick は pointerType を確実に持たないブラウザがあるので、直前の pointerdown のものを使う
  const lastPointerType = useRef(DEFAULT_POINTER_TYPE);

  useEffect(() => {
    ref.current?.setAttribute(readyAttribute, '');
  }, [readyAttribute]);

  // 描画の直後（画面に出る前）に書き、ホバーの見た目が1フレーム遅れないようにする
  useLayoutEffect(() => {
    if (ref.current) applyPrefState(ref.current, state);
  }, [state]);

  const send = (kind: PointerKind, target: EventTarget, pointerType: string, related?: EventTarget | null) => {
    const event = toMapEvent({ kind, pref: prefFromTarget(target), relatedPref: prefFromTarget(related ?? null), pointerType });
    if (event) dispatch(event);
  };

  const handlers: Handlers = {
    onPointerDown: event => {
      lastPointerType.current = event.pointerType;
    },
    onPointerOver: event => send('over', event.target, event.pointerType),
    onPointerOut: event => send('out', event.target, event.pointerType, event.relatedTarget),
    onDoubleClick: event => send('dblclick', event.target, lastPointerType.current),
    onKeyDown: event => {
      if (hasModifier(event) || event.repeat) return;
      if (onKey) onKey(event);
      else dispatchKey(event, dispatch);
    },
    onFocus: event => handleFocus(event, dispatch),
    onBlur: event => handleBlur(event, dispatch)
  };

  return { ref, state, dispatch, handlers, sendClick: target => send('click', target, lastPointerType.current) };
}
