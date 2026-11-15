import vm from 'node:vm';
import { describe, expect, test } from 'vitest';

import { MODE_INIT_SCRIPT } from '@/features/mode/initScript';

type Dataset = Record<string, string>;

/** 偽の document・localStorage を渡してスクリプトを実行し、<html> の dataset を返す */
function run(storage: unknown, initial: Dataset = { mode: 'kids', ruby: 'on' }): Dataset {
  const dataset: Dataset = { ...initial };
  const context = vm.createContext({ document: { documentElement: { dataset } } });
  Object.defineProperty(context, 'localStorage', typeof storage === 'function' ? { get: storage as () => unknown } : { value: storage });
  vm.runInContext(MODE_INIT_SCRIPT, context);
  return dataset;
}

const storageOf = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });

describe('MODE_INIT_SCRIPT', () => {
  test('D23：初期化スクリプトは500バイト未満', () => {
    // Arrange・Act
    const bytes = new TextEncoder().encode(MODE_INIT_SCRIPT).length;

    // Assert
    expect(bytes).toBeLessThan(500);
  });

  test('D23：保存した mode・ruby を <html> の data-mode・data-ruby に書く', () => {
    // Arrange・Act
    const result = run(storageOf({ 'maps.mode': 'adult', 'maps.ruby': 'off' }));

    // Assert
    expect(result).toEqual({ mode: 'adult', ruby: 'off' });
  });

  test('D23：保存した値がなければ、ビルド時の既定値のままにする', () => {
    // Arrange・Act
    const result = run(storageOf({}), { mode: 'adult', ruby: 'on' });

    // Assert
    expect(result).toEqual({ mode: 'adult', ruby: 'on' });
  });

  test('D23：保存した値が正しくなければ、既定値のままにする（片方だけ正しければそちらだけ書く）', () => {
    // Arrange・Act
    const bothWrong = run(storageOf({ 'maps.mode': 'baby', 'maps.ruby': 'yes' }));
    const oneRight = run(storageOf({ 'maps.mode': '<script>', 'maps.ruby': 'off' }));

    // Assert
    expect(bothWrong).toEqual({ mode: 'kids', ruby: 'on' });
    expect(oneRight).toEqual({ mode: 'kids', ruby: 'off' });
  });

  test('4.11.5：getItem が例外を投げても、例外が外に出ず既定値のまま', () => {
    // Arrange・Act
    const result = run({
      getItem: () => {
        throw new Error('SecurityError');
      }
    });

    // Assert
    expect(result).toEqual({ mode: 'kids', ruby: 'on' });
  });

  test('4.11.5：localStorage を読むだけで例外を投げても、例外が外に出ず既定値のまま', () => {
    // Arrange・Act
    const result = run(() => {
      throw new Error('SecurityError');
    });

    // Assert
    expect(result).toEqual({ mode: 'kids', ruby: 'on' });
  });
});
