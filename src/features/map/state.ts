// 地図の操作の状態遷移（4.11.2）。画面から切り離した純粋関数。
// 拡大率と表示位置（viewport）は d3-zoom が持つので、ここでは扱わない（T2-06）。

/** 県コード（'01'〜'47'）。境界（DOM の属性、ハッシュの解析）で確かめてから渡す */
export type PrefCode = string;

/** 地図の操作の状態（4.11.1）。マウスをのせた県・固定した県・最大化した県を持つ */
export type MapState = {
  /** マウスをのせている（フォーカスしている）県 */
  readonly hovered: PrefCode | null;
  /** 最後に hovered になった県（ホバーが終わっても残す） */
  readonly displayed: PrefCode | null;
  /** 固定表示している県 */
  readonly pinned: PrefCode | null;
  /** 空でなければ pinned と同じ県（4.11.1） */
  readonly maximized: PrefCode | null;
};

/** 状態を変える操作（4.11.2 の表の行）。キーボードの操作も同じイベントにして渡す */
export type MapEvent =
  | { readonly type: 'hover'; readonly pref: PrefCode }
  | { readonly type: 'hoverEnd' }
  | { readonly type: 'click'; readonly pref: PrefCode }
  | { readonly type: 'doubleClick'; readonly pref: PrefCode }
  | { readonly type: 'backgroundClick' }
  | { readonly type: 'escape' }
  | { readonly type: 'resetView' }
  | { readonly type: 'zoomStep' }
  | { readonly type: 'restore'; readonly pref: PrefCode }
  /** 下から出るパネルの「とじる」（4.11.3。T3-06）。固定と最大化をまとめて解く */
  | { readonly type: 'closeCard' };

/** ページを開いたときの状態。どの県もホバー・固定・最大化していない */
export const INITIAL_MAP_STATE: MapState = { hovered: null, displayed: null, pinned: null, maximized: null };

/** 状態を一部だけ変える。変わらないときは受け取った状態をそのまま返す */
function update(state: MapState, changes: Partial<MapState>): MapState {
  const isChanged = (Object.keys(changes) as (keyof MapState)[]).some(key => state[key] !== changes[key]);
  return isChanged ? { ...state, ...changes } : state;
}

function hover(state: MapState, pref: PrefCode): MapState {
  if (state.maximized !== null) return state;
  return update(state, { hovered: pref, displayed: pref });
}

function click(state: MapState, pref: PrefCode): MapState {
  if (state.maximized !== null) return state;
  return update(state, { pinned: state.pinned === pref ? null : pref });
}

function doubleClick(state: MapState, pref: PrefCode): MapState {
  if (state.maximized === pref) return update(state, { maximized: null });
  return update(state, { maximized: pref, pinned: pref });
}

/** 最大化中は最大化だけを解除する（固定は残す）。それ以外は何もしない */
function unmaximize(state: MapState): MapState {
  return update(state, { maximized: null });
}

function unpin(state: MapState): MapState {
  if (state.maximized !== null) return state;
  return update(state, { pinned: null });
}

function restore(state: MapState, pref: PrefCode): MapState {
  return update(state, { pinned: pref, maximized: null });
}

/** パネルを閉じる：固定も最大化も解除する（最大化は固定している県だけなので、固定を外すなら最大化も解く。4.11.1） */
function closeCard(state: MapState): MapState {
  return update(state, { pinned: null, maximized: null });
}

/**
 * 操作に応じて次の状態を返す（4.11.2 の表）。受け取った状態は変えない。
 * 状態が変わらない操作では、受け取った状態をそのまま返す（同じ参照）。
 */
export function mapReducer(state: MapState, event: MapEvent): MapState {
  switch (event.type) {
    case 'hover':
      return hover(state, event.pref);
    case 'hoverEnd':
      return update(state, { hovered: null });
    case 'click':
      return click(state, event.pref);
    case 'doubleClick':
      return doubleClick(state, event.pref);
    case 'backgroundClick':
      return unpin(state);
    case 'escape':
      return state.maximized !== null ? unmaximize(state) : unpin(state);
    case 'resetView':
      return unmaximize(state);
    case 'zoomStep':
      return state;
    case 'restore':
      return restore(state, event.pref);
    case 'closeCard':
      return closeCard(state);
  }
}

/** カードに表示する県。固定があればその県、なければ最後にホバーした県 */
export function cardPref(state: MapState): PrefCode | null {
  return state.pinned ?? state.displayed;
}
