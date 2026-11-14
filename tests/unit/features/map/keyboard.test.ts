import { describe, expect, test } from 'vitest';
import { keyToMapEvent, navigateKey, rovingPref, zoomKey } from '@/features/map/keyboard';

describe('keyToMapEvent', () => {
  test('4.11.2: Enter はクリック', () => {
    expect(keyToMapEvent({ key: 'Enter', shiftKey: false, pref: '20' })).toEqual({ type: 'click', pref: '20' });
  });

  test('4.11.2: Space はクリック', () => {
    expect(keyToMapEvent({ key: ' ', shiftKey: false, pref: '20' })).toEqual({ type: 'click', pref: '20' });
  });

  test('4.11.2: Shift + Enter はダブルクリック', () => {
    expect(keyToMapEvent({ key: 'Enter', shiftKey: true, pref: '20' })).toEqual({ type: 'doubleClick', pref: '20' });
  });

  test('ほかのキーはなし', () => {
    expect(keyToMapEvent({ key: 'a', shiftKey: false, pref: '20' })).toBeNull();
    expect(keyToMapEvent({ key: 'Tab', shiftKey: false, pref: '20' })).toBeNull();
  });

  test('Shift + Space はなし（ダブルクリックは Shift + Enter だけ）', () => {
    expect(keyToMapEvent({ key: ' ', shiftKey: true, pref: '20' })).toBeNull();
  });

  test('県がないときはなし', () => {
    expect(keyToMapEvent({ key: 'Enter', shiftKey: false, pref: null })).toBeNull();
  });
});

describe('keyToMapEvent: Esc', () => {
  test('F-KB-05: Escape は escape（県がなくても）', () => {
    expect(keyToMapEvent({ key: 'Escape', shiftKey: false, pref: '20' })).toEqual({ type: 'escape' });
    expect(keyToMapEvent({ key: 'Escape', shiftKey: false, pref: null })).toEqual({ type: 'escape' });
  });
});

describe('navigateKey', () => {
  test('4.11.6: → ↓ は次の県、← ↑ は前の県（県コード順）', () => {
    expect(navigateKey({ key: 'ArrowRight', pref: '01' })).toBe('02');
    expect(navigateKey({ key: 'ArrowDown', pref: '09' })).toBe('10');
    expect(navigateKey({ key: 'ArrowLeft', pref: '10' })).toBe('09');
    expect(navigateKey({ key: 'ArrowUp', pref: '47' })).toBe('46');
  });

  test('4.11.6: Home は北海道、End は沖縄県', () => {
    expect(navigateKey({ key: 'Home', pref: '20' })).toBe('01');
    expect(navigateKey({ key: 'End', pref: '20' })).toBe('47');
  });

  test('4.11.6: 端では止まる（北海道で ← は北海道、沖縄県で → は沖縄県）', () => {
    expect(navigateKey({ key: 'ArrowLeft', pref: '01' })).toBe('01');
    expect(navigateKey({ key: 'ArrowUp', pref: '01' })).toBe('01');
    expect(navigateKey({ key: 'ArrowRight', pref: '47' })).toBe('47');
    expect(navigateKey({ key: 'ArrowDown', pref: '47' })).toBe('47');
  });

  test('4.11.6: 矢印でないキー・県がないときは null', () => {
    expect(navigateKey({ key: 'a', pref: '20' })).toBeNull();
    expect(navigateKey({ key: 'Enter', pref: '20' })).toBeNull();
    expect(navigateKey({ key: 'ArrowRight', pref: null })).toBeNull();
    expect(navigateKey({ key: 'Home', pref: null })).toBeNull();
  });
});

describe('zoomKey', () => {
  test('F-KB-04: + は in、- は out、0 は reset、ほかは null', () => {
    expect(zoomKey('+')).toBe('in');
    expect(zoomKey('-')).toBe('out');
    expect(zoomKey('0')).toBe('reset');
    expect(zoomKey('=')).toBeNull();
    expect(zoomKey('a')).toBeNull();
    expect(zoomKey('Enter')).toBeNull();
  });
});

describe('rovingPref', () => {
  test('F-KB-01: rovingPref はフォーカス中 → 固定中 → 北海道の順', () => {
    expect(rovingPref({ focused: '20', pinned: '13' })).toBe('20');
    expect(rovingPref({ focused: null, pinned: '13' })).toBe('13');
    expect(rovingPref({ focused: null, pinned: null })).toBe('01');
  });
});
