import vm from 'node:vm';
import { describe, expect, test } from 'vitest';

import { MODE_INIT_SCRIPT } from '@/features/mode/initScript';
import { prefFromHash } from '@/features/map/hash';

type Dataset = Record<string, string>;

const noStorage = { getItem: () => null };

/** 偽の document・location・localStorage を渡してスクリプトを実行する。<html> の dataset と、hashchange の通知先（`fire`）を返す */
function setup(storage: unknown, initial: Dataset = { mode: 'kids', ruby: 'on' }, hash = '') {
  const dataset: Dataset = { ...initial };
  const location = { hash };
  const listeners: Array<() => void> = [];
  const context = vm.createContext({
    document: { documentElement: { dataset } },
    location,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'hashchange') listeners.push(listener);
    }
  });
  Object.defineProperty(context, 'localStorage', typeof storage === 'function' ? { get: storage as () => unknown } : { value: storage });
  vm.runInContext(MODE_INIT_SCRIPT, context);
  return {
    dataset,
    /** ハッシュを変えて hashchange を通知する */
    fire: (next: string) => {
      location.hash = next;
      listeners.forEach(listener => listener());
    }
  };
}

/** 偽の document・localStorage を渡してスクリプトを実行し、<html> の dataset を返す */
function run(storage: unknown, initial: Dataset = { mode: 'kids', ruby: 'on' }): Dataset {
  return setup(storage, initial).dataset;
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

  describe('ハッシュ（6.6 (2)、CLS）', () => {
    test('6.6 (2)（CLS）：ハッシュが #pref-01〜#pref-47 なら <html data-hash-pref> に県コードを書く', () => {
      // Arrange・Act・Assert
      for (const code of ['01', '09', '10', '13', '39', '40', '47']) {
        expect(setup(noStorage, {}, `#pref-${code}`).dataset.hashPref).toBe(code);
      }
    });

    test('6.6 (2)（CLS）：#pref-00・#pref-48・#pref-1・#pref-01x・ほかのハッシュでは data-hash-pref を書かない（prefFromHash と同じ結果）', () => {
      // Arrange・Act・Assert
      for (const hash of ['', '#', '#pref-00', '#pref-48', '#pref-99', '#pref-1', '#pref-001', '#pref-01x', '#pref-', '#pref-01\n', '#foo', 'pref-01', '#PREF-01', '#x#pref-01']) {
        expect(setup(noStorage, {}, hash).dataset.hashPref, hash).toBe(prefFromHash(hash) ?? undefined);
      }
    });

    test('6.6 (2)（CLS）：#pref-00〜#pref-99・3桁（#pref-000〜#pref-119）・末尾に改行つきの形を総当たりで、prefFromHash と同じ結果になる（有効なのは47件だけ）', () => {
      // Arrange
      const two = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'));
      const three = Array.from({ length: 120 }, (_, index) => String(index).padStart(3, '0'));
      const hashes = [...two, ...three, ...two.map(code => `${code}\n`), ...two.map(code => `${code}x`)].map(code => `#pref-${code}`);

      // Act
      const results = hashes.map(hash => [hash, setup(noStorage, {}, hash).dataset.hashPref] as const);

      // Assert
      for (const [hash, written] of results) expect(written, hash).toBe(prefFromHash(hash) ?? undefined);
      expect(results.filter(([, written]) => written !== undefined)).toHaveLength(47);
    });

    test('6.6 (2)（CLS）：hashchange でハッシュが変われば data-hash-pref を書き直し、県でなくなれば消す', () => {
      // Arrange
      const { dataset, fire } = setup(noStorage, {}, '#pref-01');
      expect(dataset.hashPref).toBe('01');

      // Act・Assert
      fire('#pref-13');
      expect(dataset.hashPref).toBe('13');
      fire('#pref-99');
      expect('hashPref' in dataset).toBe(false);
      fire('#pref-47');
      expect(dataset.hashPref).toBe('47');
      fire('');
      expect('hashPref' in dataset).toBe(false);
    });

    test('4.11.5：localStorage が例外を投げても、data-hash-pref は書く（hashchange も追う）', () => {
      // Arrange・Act
      const { dataset, fire } = setup(
        () => {
          throw new Error('SecurityError');
        },
        {},
        '#pref-13'
      );

      // Assert
      expect(dataset.hashPref).toBe('13');
      fire('#pref-02');
      expect(dataset.hashPref).toBe('02');
    });

    test('ハッシュがあっても、保存した mode・ruby は今までどおり書く', () => {
      // Arrange・Act
      const { dataset } = setup(storageOf({ 'maps.mode': 'adult', 'maps.ruby': 'off' }), {}, '#pref-05');

      // Assert
      expect(dataset).toEqual({ mode: 'adult', ruby: 'off', hashPref: '05' });
    });
  });
});
