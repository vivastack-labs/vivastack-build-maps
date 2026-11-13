'use client';

import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { INITIAL_MAP_STATE, mapReducer, type MapEvent, type MapState } from '@/features/map/state';

type MapStateContextValue = {
  readonly state: MapState;
  readonly dispatch: Dispatch<MapEvent>;
};

const MapStateContext = createContext<MapStateContextValue | null>(null);

/**
 * 地図の操作の状態（4.11.1、`mapReducer`）を、地図・カード・さくいんに配る。DOM の要素は出さない。
 * 状態を変えるときは `useMapState()` の `dispatch` に `MapEvent` を渡す。
 */
export function MapStateProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(mapReducer, INITIAL_MAP_STATE);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <MapStateContext.Provider value={value}>{children}</MapStateContext.Provider>;
}

/** 地図の操作の状態と `dispatch` を返す。`MapStateProvider` の外で呼ぶと例外にする */
export function useMapState(): MapStateContextValue {
  const value = useContext(MapStateContext);
  if (value === null) {
    throw new Error('useMapState は MapStateProvider の中で使ってください');
  }
  return value;
}
