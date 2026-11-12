import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { cardPref, INITIAL_MAP_STATE, mapReducer, type MapEvent, type MapState } from '@/features/map/state';

const A = '13';
const B = '01';

const NORMAL: MapState = INITIAL_MAP_STATE;
const PINNED: MapState = { hovered: null, displayed: A, pinned: A, maximized: null };
const MAXIMIZED: MapState = { hovered: null, displayed: A, pinned: A, maximized: A };

const run = (state: MapState, ...events: readonly MapEvent[]): MapState => events.reduce(mapReducer, state);

describe('4.11.2 ホバー', () => {
  test('4.11.2 ホバー／通常：カードに表示する', () => {
    const next = mapReducer(NORMAL, { type: 'hover', pref: A });
    expect(next).toEqual({ hovered: A, displayed: A, pinned: null, maximized: null });
    expect(cardPref(next)).toBe(A);
  });

  test('4.11.2 ホバー／固定中：カードは固定した県のまま', () => {
    const next = mapReducer(PINNED, { type: 'hover', pref: B });
    expect(next).toEqual({ hovered: B, displayed: B, pinned: A, maximized: null });
    expect(cardPref(next)).toBe(A);
  });

  test('4.11.2 ホバー／最大化中：状態を変えない', () => {
    expect(mapReducer(MAXIMIZED, { type: 'hover', pref: B })).toBe(MAXIMIZED);
  });

  test('4.11.2 ホバーの終了：hovered だけを空にして、カードの県は残す', () => {
    const hovering = mapReducer(NORMAL, { type: 'hover', pref: A });
    const next = mapReducer(hovering, { type: 'hoverEnd' });
    expect(next).toEqual({ hovered: null, displayed: A, pinned: null, maximized: null });
  });
});

describe('4.11.2 クリック', () => {
  test('4.11.2 クリック／通常：固定する', () => {
    expect(mapReducer(NORMAL, { type: 'click', pref: A })).toEqual({ hovered: null, displayed: null, pinned: A, maximized: null });
  });

  test('4.11.2 クリック／固定中・同じ県：固定を解除する', () => {
    expect(mapReducer(PINNED, { type: 'click', pref: A }).pinned).toBeNull();
  });

  test('4.11.2 クリック／固定中・別の県：固定を移す', () => {
    expect(mapReducer(PINNED, { type: 'click', pref: B }).pinned).toBe(B);
  });

  test('4.11.2 クリック／最大化中・同じ県：何もしない', () => {
    expect(mapReducer(MAXIMIZED, { type: 'click', pref: A })).toBe(MAXIMIZED);
  });

  test('4.11.2 クリック／最大化中・別の県：何もしない', () => {
    expect(mapReducer(MAXIMIZED, { type: 'click', pref: B })).toBe(MAXIMIZED);
  });
});

describe('4.11.2 ダブルクリック', () => {
  test('4.11.2 ダブルクリック／通常：最大化＋固定', () => {
    const next = mapReducer(NORMAL, { type: 'doubleClick', pref: A });
    expect(next.maximized).toBe(A);
    expect(next.pinned).toBe(A);
  });

  test('4.11.2 ダブルクリック／固定中・同じ県：最大化＋固定', () => {
    const next = mapReducer(PINNED, { type: 'doubleClick', pref: A });
    expect(next.maximized).toBe(A);
    expect(next.pinned).toBe(A);
  });

  test('4.11.2 ダブルクリック／固定中・別の県：その県を最大化＋固定', () => {
    const next = mapReducer(PINNED, { type: 'doubleClick', pref: B });
    expect(next.maximized).toBe(B);
    expect(next.pinned).toBe(B);
  });

  test('4.11.2 ダブルクリック／最大化中・同じ県：元に戻す（固定は残す）', () => {
    const next = mapReducer(MAXIMIZED, { type: 'doubleClick', pref: A });
    expect(next.maximized).toBeNull();
    expect(next.pinned).toBe(A);
  });

  test('4.11.2 ダブルクリック／最大化中・別の県：その県に切り替える', () => {
    const next = mapReducer(MAXIMIZED, { type: 'doubleClick', pref: B });
    expect(next.maximized).toBe(B);
    expect(next.pinned).toBe(B);
  });
});

describe('4.11.2 海・余白のクリック', () => {
  test('4.11.2 海・余白をクリック／通常：何もしない', () => {
    expect(mapReducer(NORMAL, { type: 'backgroundClick' })).toBe(NORMAL);
  });

  test('4.11.2 海・余白をクリック／固定中：固定を解除する', () => {
    expect(mapReducer(PINNED, { type: 'backgroundClick' }).pinned).toBeNull();
  });

  test('4.11.2 海・余白をクリック／最大化中：何もしない', () => {
    expect(mapReducer(MAXIMIZED, { type: 'backgroundClick' })).toBe(MAXIMIZED);
  });
});

describe('4.11.2 Esc', () => {
  test('4.11.2 Esc／通常：何もしない（F-KB-05）', () => {
    expect(mapReducer(NORMAL, { type: 'escape' })).toBe(NORMAL);
  });

  test('4.11.2 Esc／固定中：固定を解除する（F-KB-05）', () => {
    expect(mapReducer(PINNED, { type: 'escape' }).pinned).toBeNull();
  });

  test('4.11.2 Esc／最大化中：最大化を解除する（固定は残す）（F-KB-05）', () => {
    const next = mapReducer(MAXIMIZED, { type: 'escape' });
    expect(next.maximized).toBeNull();
    expect(next.pinned).toBe(A);
  });
});

describe('4.11.2 全体表示', () => {
  test('4.11.2 全体表示／通常：状態を変えない', () => {
    expect(mapReducer(NORMAL, { type: 'resetView' })).toBe(NORMAL);
  });

  test('4.11.2 全体表示／固定中：固定は残す', () => {
    expect(mapReducer(PINNED, { type: 'resetView' })).toBe(PINNED);
  });

  test('4.11.2 全体表示／最大化中：最大化を解除する（固定は残す）', () => {
    const next = mapReducer(MAXIMIZED, { type: 'resetView' });
    expect(next.maximized).toBeNull();
    expect(next.pinned).toBe(A);
  });
});

describe('4.11.2 拡大・縮小（F-ZOOM-04）', () => {
  test.each([
    ['通常', NORMAL],
    ['固定中', PINNED],
    ['最大化中', MAXIMIZED]
  ])('4.11.2 拡大・縮小／通常・固定中・最大化中：状態を変えない（%s）', (_name, state) => {
    expect(mapReducer(state, { type: 'zoomStep' })).toBe(state);
  });
});

describe('4.11.1 カードに表示する県', () => {
  test('4.11.1 最初はカードに表示する県がない（案内を表示）', () => {
    expect(cardPref(INITIAL_MAP_STATE)).toBeNull();
  });

  test('4.11.1 ホバーが終わってもカードの県は残る', () => {
    expect(cardPref(run(NORMAL, { type: 'hover', pref: A }, { type: 'hoverEnd' }))).toBe(A);
  });

  test('4.11.1 固定があればカードは固定した県、なければ最後にホバーした県', () => {
    const hoveredB = run(NORMAL, { type: 'hover', pref: A }, { type: 'hover', pref: B });
    expect(cardPref(hoveredB)).toBe(B);
    const pinnedA = run(hoveredB, { type: 'click', pref: A });
    expect(cardPref(pinnedA)).toBe(A);
    const unpinned = run(pinnedA, { type: 'backgroundClick' });
    expect(cardPref(unpinned)).toBe(B);
  });
});

describe('4.11.2 ハッシュからの復元（T3-07）', () => {
  test.each([
    ['通常', NORMAL],
    ['固定中', PINNED],
    ['最大化中', MAXIMIZED]
  ])('4.11.2 ハッシュからの復元：その県を固定する（%s）', (_name, state) => {
    const next = mapReducer(state, { type: 'restore', pref: B });
    expect(next.pinned).toBe(B);
    expect(next.maximized).toBeNull();
  });
});

const ALL_EVENTS: readonly MapEvent[] = [
  { type: 'hover', pref: A },
  { type: 'hoverEnd' },
  { type: 'click', pref: A },
  { type: 'click', pref: B },
  { type: 'doubleClick', pref: A },
  { type: 'doubleClick', pref: B },
  { type: 'backgroundClick' },
  { type: 'escape' },
  { type: 'resetView' },
  { type: 'zoomStep' },
  { type: 'restore', pref: B }
];

describe('状態の同一性と不変性', () => {
  test('4.11.2 状態が変わらない操作では、同じ状態のオブジェクトを返す', () => {
    expect(mapReducer(NORMAL, { type: 'escape' })).toBe(NORMAL);
    expect(mapReducer(NORMAL, { type: 'hoverEnd' })).toBe(NORMAL);
    const hovering = mapReducer(NORMAL, { type: 'hover', pref: A });
    expect(mapReducer(hovering, { type: 'hover', pref: A })).toBe(hovering);
    expect(mapReducer(MAXIMIZED, { type: 'zoomStep' })).toBe(MAXIMIZED);
  });

  test.each([
    ['通常', NORMAL],
    ['固定中', PINNED],
    ['最大化中', MAXIMIZED]
  ])('元の状態のオブジェクトを変えない（%s）', (_name, state) => {
    const frozen = Object.freeze({ ...state });
    for (const event of ALL_EVENTS) {
      expect(() => mapReducer(frozen, event)).not.toThrow();
    }
    expect(frozen).toEqual(state);
  });
});

describe('性質のテスト（fast-check）', () => {
  const prefArb = fc.constantFrom('01', '13', '47');
  const eventArb: fc.Arbitrary<MapEvent> = fc.oneof(
    prefArb.map((pref): MapEvent => ({ type: 'hover', pref })),
    fc.constant<MapEvent>({ type: 'hoverEnd' }),
    prefArb.map((pref): MapEvent => ({ type: 'click', pref })),
    prefArb.map((pref): MapEvent => ({ type: 'doubleClick', pref })),
    fc.constant<MapEvent>({ type: 'backgroundClick' }),
    fc.constant<MapEvent>({ type: 'escape' }),
    fc.constant<MapEvent>({ type: 'resetView' }),
    fc.constant<MapEvent>({ type: 'zoomStep' }),
    prefArb.map((pref): MapEvent => ({ type: 'restore', pref }))
  );
  const eventsArb = fc.array(eventArb, { minLength: 0, maxLength: 30 });

  test('4.11.1 どんな操作の列の後でも、最大化中の県は固定している', () => {
    fc.assert(
      fc.property(eventsArb, events => {
        let state = INITIAL_MAP_STATE;
        for (const event of events) {
          state = mapReducer(state, event);
          if (state.maximized !== null && state.pinned !== state.maximized) return false;
        }
        return true;
      })
    );
  });

  test('4.11.2 クリック → クリック → ダブルクリックの後は最大化＋固定になる（その県を最大化していない状態から）', () => {
    fc.assert(
      fc.property(eventsArb, prefArb, (events, pref) => {
        const before = run(INITIAL_MAP_STATE, ...events);
        fc.pre(before.maximized !== pref);
        const after = run(before, { type: 'click', pref }, { type: 'click', pref }, { type: 'doubleClick', pref });
        return after.maximized === pref && after.pinned === pref;
      })
    );
  });

  test('4.11.2 最大化中の同じ県へのクリック → クリック → ダブルクリックは、最大化を解除して固定を残す', () => {
    fc.assert(
      fc.property(eventsArb, prefArb, (events, pref) => {
        const before = run(INITIAL_MAP_STATE, ...events);
        fc.pre(before.maximized !== pref);
        const maximized = mapReducer(before, { type: 'doubleClick', pref });
        const after = run(maximized, { type: 'click', pref }, { type: 'click', pref }, { type: 'doubleClick', pref });
        return after.maximized === null && after.pinned === pref;
      })
    );
  });

  test('どんな操作の列でも、元の状態を変えない', () => {
    fc.assert(
      fc.property(eventsArb, events => {
        let state: MapState = Object.freeze({ ...INITIAL_MAP_STATE });
        for (const event of events) {
          state = Object.freeze({ ...mapReducer(state, event) });
        }
        return true;
      })
    );
  });
});
