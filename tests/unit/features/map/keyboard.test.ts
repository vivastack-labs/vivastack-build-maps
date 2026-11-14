import { describe, expect, test } from 'vitest';
import { keyToMapEvent } from '@/features/map/keyboard';

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
    expect(keyToMapEvent({ key: 'Escape', shiftKey: false, pref: '20' })).toBeNull();
  });

  test('Shift + Space はなし（ダブルクリックは Shift + Enter だけ）', () => {
    expect(keyToMapEvent({ key: ' ', shiftKey: true, pref: '20' })).toBeNull();
  });

  test('県がないときはなし', () => {
    expect(keyToMapEvent({ key: 'Enter', shiftKey: false, pref: null })).toBeNull();
  });
});
