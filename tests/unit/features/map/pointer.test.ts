// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { prefFromAttribute, prefFromTarget, toMapEvent } from '@/features/map/pointer';

describe('toMapEvent：over', () => {
  test('F-CARD-01：マウスで県にのると hover になる', () => {
    expect(toMapEvent({ kind: 'over', pref: '13', pointerType: 'mouse' })).toEqual({ type: 'hover', pref: '13' });
  });

  test('F-CARD-01：ペンでも hover になる', () => {
    expect(toMapEvent({ kind: 'over', pref: '13', pointerType: 'pen' })).toEqual({ type: 'hover', pref: '13' });
  });

  test('4.11.3：タッチで県にのっても hover にならない', () => {
    expect(toMapEvent({ kind: 'over', pref: '13', pointerType: 'touch' })).toBeNull();
  });

  test('県の外にのっても hover にならない', () => {
    expect(toMapEvent({ kind: 'over', pref: null, pointerType: 'mouse' })).toBeNull();
  });
});

describe('toMapEvent：out', () => {
  test('4.11.1：マウスで県から海へ出ると hoverEnd になる', () => {
    expect(toMapEvent({ kind: 'out', pref: '13', relatedPref: null, pointerType: 'mouse' })).toEqual({ type: 'hoverEnd' });
  });

  test('4.11.1：県から別の県へ移ると hoverEnd になる（次の over で hover に戻る）', () => {
    expect(toMapEvent({ kind: 'out', pref: '13', relatedPref: '14', pointerType: 'mouse' })).toEqual({ type: 'hoverEnd' });
  });

  test('4.11.1：県の中の別の要素へ移っても hoverEnd にならない', () => {
    expect(toMapEvent({ kind: 'out', pref: '13', relatedPref: '13', pointerType: 'mouse' })).toBeNull();
  });

  test('relatedPref を省いたときは、県から出たものとして扱う', () => {
    expect(toMapEvent({ kind: 'out', pref: '13', pointerType: 'pen' })).toEqual({ type: 'hoverEnd' });
  });

  test('県の外から出ても hoverEnd にならない', () => {
    expect(toMapEvent({ kind: 'out', pref: null, relatedPref: null, pointerType: 'mouse' })).toBeNull();
  });

  test('4.11.3：タッチでは hoverEnd にならない', () => {
    expect(toMapEvent({ kind: 'out', pref: '13', relatedPref: null, pointerType: 'touch' })).toBeNull();
  });
});

describe('toMapEvent：click', () => {
  test('F-CARD-07：県のクリックは click になる', () => {
    expect(toMapEvent({ kind: 'click', pref: '13', pointerType: 'mouse' })).toEqual({ type: 'click', pref: '13' });
  });

  test('F-CARD-07：県のタップも click になる（4.11.3）', () => {
    expect(toMapEvent({ kind: 'click', pref: '13', pointerType: 'touch' })).toEqual({ type: 'click', pref: '13' });
  });

  test('4.11.2：海・余白のクリックは backgroundClick になる', () => {
    expect(toMapEvent({ kind: 'click', pref: null, pointerType: 'mouse' })).toEqual({ type: 'backgroundClick' });
  });
});

describe('toMapEvent：dblclick', () => {
  test('F-ZOOM-04：マウスで県をダブルクリックすると doubleClick になる', () => {
    expect(toMapEvent({ kind: 'dblclick', pref: '13', pointerType: 'mouse' })).toEqual({ type: 'doubleClick', pref: '13' });
  });

  test('4.11.3：タッチのダブルクリック（ダブルタップ）は無視する', () => {
    expect(toMapEvent({ kind: 'dblclick', pref: '13', pointerType: 'touch' })).toBeNull();
  });

  test('県の外のダブルクリックは無視する', () => {
    expect(toMapEvent({ kind: 'dblclick', pref: null, pointerType: 'mouse' })).toBeNull();
  });
});

describe('prefFromAttribute', () => {
  test('F-CARD-08：指定した属性を持つ祖先（自分を含む）の県コードを返す', () => {
    document.body.innerHTML = '<div data-card-maximize="13"><span id="inner"></span></div>';

    expect(prefFromAttribute(document.getElementById('inner'), 'data-card-maximize')).toBe('13');
    expect(prefFromAttribute(document.querySelector('[data-card-maximize]'), 'data-card-maximize')).toBe('13');
  });

  test('F-CARD-08：属性がない・県コードの形でない・要素でない対象は null', () => {
    document.body.innerHTML = '<div data-card-maximize="99"><span id="bad"></span></div><p id="none"></p>';

    expect(prefFromAttribute(document.getElementById('bad'), 'data-card-maximize')).toBeNull();
    expect(prefFromAttribute(document.getElementById('none'), 'data-card-maximize')).toBeNull();
    expect(prefFromAttribute(document.getElementById('none'), 'data-pref')).toBeNull();
    expect(prefFromAttribute(null, 'data-card-maximize')).toBeNull();
    expect(prefFromAttribute(document, 'data-card-maximize')).toBeNull();
  });
});

describe('prefFromTarget', () => {
  test('data-pref の祖先の県コードを返す', () => {
    document.body.innerHTML = '<svg><g data-pref="13"><path id="inner"></path></g></svg>';

    expect(prefFromTarget(document.getElementById('inner'))).toBe('13');
    expect(prefFromTarget(document.querySelector('[data-pref]'))).toBe('13');
  });

  test('F-MUNI-04: 市区町村の形（[data-muni-pref] の中）からも県コードを引く', () => {
    document.body.innerHTML = '<svg><g data-muni-pref="20"><path id="muni" data-muni="20201"></path></g></svg>';

    expect(prefFromTarget(document.getElementById('muni'))).toBe('20');
  });

  test('F-MUNI-04: 県コードの形でない data-muni-pref は null', () => {
    document.body.innerHTML = '<svg><g data-muni-pref="99"><path id="muni"></path></g></svg>';

    expect(prefFromTarget(document.getElementById('muni'))).toBeNull();
  });

  test('県コードの形でない値は null', () => {
    document.body.innerHTML = '<svg><path id="a" data-pref="48"></path><path id="b" data-pref="1"></path><path id="c" data-pref="x"></path></svg>';

    for (const id of ['a', 'b', 'c']) {
      expect(prefFromTarget(document.getElementById(id))).toBeNull();
    }
  });

  test('data-pref がなければ null', () => {
    document.body.innerHTML = '<svg><rect id="sea"></rect></svg>';

    expect(prefFromTarget(document.getElementById('sea'))).toBeNull();
  });

  test('Element でない対象（null・document）は null', () => {
    expect(prefFromTarget(null)).toBeNull();
    expect(prefFromTarget(document)).toBeNull();
  });
});
