import { describe, expect, test, vi } from 'vitest';

import { LANGS } from '@/i18n/lang';
import { applySetting, DEFAULT_DISPLAY, parseMode, parseRuby } from '@/features/mode/settings';

/** <html> の代わり。setAttribute で書かれた属性を `attributes` に持つ */
const fakeRoot = (): HTMLElement & { attributes: Record<string, string> } => {
  const attributes: Record<string, string> = {};
  return { attributes, setAttribute: (name: string, value: string) => void (attributes[name] = value) } as unknown as HTMLElement & { attributes: Record<string, string> };
};

describe('settings', () => {
  test('U1：言語ごとの既定値は ja＝kids・on、en・zh＝adult・on（D37）', () => {
    // Arrange・Act・Assert
    expect(DEFAULT_DISPLAY.ja).toEqual({ mode: 'kids', ruby: 'on' });
    expect(DEFAULT_DISPLAY.en).toEqual({ mode: 'adult', ruby: 'on' });
    expect(DEFAULT_DISPLAY.zh).toEqual({ mode: 'adult', ruby: 'on' });
    expect(Object.keys(DEFAULT_DISPLAY).sort()).toEqual([...LANGS].sort());
  });

  test('parseMode・parseRuby は決まった値だけを受け付ける', () => {
    // Arrange・Act・Assert
    expect(parseMode('kids')).toBe('kids');
    expect(parseMode('adult')).toBe('adult');
    expect(parseMode('on')).toBeNull();
    expect(parseMode(null)).toBeNull();
    expect(parseMode(undefined)).toBeNull();
    expect(parseRuby('on')).toBe('on');
    expect(parseRuby('off')).toBe('off');
    expect(parseRuby('kids')).toBeNull();
    expect(parseRuby(1)).toBeNull();
  });

  test('F-MODE-03：applySetting は <html> の属性を書き、localStorage に保存する', () => {
    // Arrange
    const root = fakeRoot();
    const setItem = vi.fn();

    // Act
    applySetting(root, () => ({ setItem }) as unknown as Storage, 'mode', 'adult');
    applySetting(root, () => ({ setItem }) as unknown as Storage, 'ruby', 'off');

    // Assert
    expect(root.attributes).toEqual({ 'data-mode': 'adult', 'data-ruby': 'off' });
    expect(setItem).toHaveBeenCalledWith('maps.mode', 'adult');
    expect(setItem).toHaveBeenCalledWith('maps.ruby', 'off');
  });

  test('4.11.5：保存で例外が出ても、<html> の属性は変わり、例外は外に出ない', () => {
    // Arrange
    const root = fakeRoot();
    const throwing = () => {
      throw new Error('SecurityError');
    };

    // Act・Assert：storage を取る関数が投げる場合と、setItem が投げる場合
    expect(() => applySetting(root, throwing, 'mode', 'adult')).not.toThrow();
    expect(root.attributes['data-mode']).toBe('adult');
    expect(() => applySetting(root, () => ({ setItem: throwing }) as unknown as Storage, 'ruby', 'off')).not.toThrow();
    expect(root.attributes['data-ruby']).toBe('off');
  });
});
