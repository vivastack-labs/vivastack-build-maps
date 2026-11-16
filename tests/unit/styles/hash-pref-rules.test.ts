import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

// 6.6 (2)（CLS、T4-04）：CSS は属性の値を別の要素の id と比べられないので、ハッシュの県のカードを見せる規則を、47県ぶん書いている。
// 書き漏れ・重複・コードの食い違いを、app/globals.css を読んで確かめる。
const css = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

/** 規則の前の部分（セレクターの一覧）を、`{` の前から取り出す */
function selectorLists(): string[] {
  return [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1]);
}

/** `:root[data-hash-pref='NN'] … #pref-NN …` の形の個別のセレクターを集め、(属性のコード, id のコード) の組にする */
function pairsIn(selectorList: string): Array<[string, string | undefined]> {
  return selectorList
    .split(',')
    .map(selector => selector.trim())
    .filter(selector => selector.includes("[data-hash-pref='"))
    .map(selector => [/\[data-hash-pref='(\d+)'\]/.exec(selector)?.[1] ?? '', /#pref-(\d+)/.exec(selector)?.[1]]);
}

describe('app/globals.css のハッシュの県の規則', () => {
  const lists = selectorLists().filter(list => list.includes("[data-hash-pref='"));
  const display = lists.filter(list => !list.includes('[data-card-body]'));
  const reserve = lists.filter(list => list.includes('[data-card-body]'));

  test('6.6 (2)（CLS）：カードの表示の規則は1つで、01〜47 の県がすべて1回ずつある', () => {
    // Arrange・Act
    const pairs = display.flatMap(pairsIn);

    // Assert
    expect(display).toHaveLength(1);
    expect(pairs.map(([code]) => code)).toEqual(CODES);
  });

  test('6.6 (2)（CLS）：差し込み先の予約の規則は1つで、01〜47 の県がすべて1回ずつある', () => {
    // Arrange・Act
    const pairs = reserve.flatMap(pairsIn);

    // Assert
    expect(reserve).toHaveLength(1);
    expect(pairs.map(([code]) => code)).toEqual(CODES);
  });

  test('6.6 (2)（CLS）：どの規則も、属性の県コードと #pref-NN の県コードが同じ', () => {
    // Arrange・Act
    const pairs = [...display, ...reserve].flatMap(pairsIn);

    // Assert
    expect(pairs).toHaveLength(94);
    for (const [attribute, id] of pairs) expect(id).toBe(attribute);
  });
});
