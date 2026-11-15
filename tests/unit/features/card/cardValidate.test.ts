import { describe, expect, test } from 'vitest';
import { cardData, type CardData, type CardItem } from '@/features/card/cardData';
import { validateCardData } from '@/features/card/cardValidate';
import type { PublishedPrefecture } from '@/lib/publish';
import { FIXTURE_DIR } from '../../lib/content-helpers';
import { publishedPrefectures } from '../../lib/published-helpers';

const hokkaido = publishedPrefectures(FIXTURE_DIR, 'production').find(p => p.code === '01') as PublishedPrefecture;
const valid = (): CardData => JSON.parse(JSON.stringify(cardData(hokkaido, 'ja'))) as CardData;

const base = valid();
const firstItem = base.specialties[0] as CardItem;
const firstSource = { title: 't', url: 'https://example.com/', accessedText: 'd' };

/** 最初の名物の一部を差し替えた JSON（元は変えない） */
const withItem = (patch: Record<string, unknown>): unknown => ({ ...base, specialties: [{ ...firstItem, ...patch }, ...base.specialties.slice(1)] });
/** 行き方の一部を差し替えた JSON（元は変えない） */
const withAccess = (patch: Record<string, unknown>): unknown => ({ ...base, access: { ...base.access, ...patch } });
/** 最初の名物の出典を1件に差し替えた JSON */
const withSource = (patch: Record<string, unknown>): unknown => withItem({ sources: [{ ...firstSource, ...patch }] });

describe('validateCardData', () => {
  test('D38：validateCardData は正しい JSON を受け入れる（そのまま返す）', () => {
    const data = valid();

    expect(validateCardData(data, '01')).toBe(data);
  });

  test('D38：access がなく、名物・名所が空の JSON も受け入れる（プレビューの未作成の県）', () => {
    const data = { code: '47', specialties: [], spots: [] };

    expect(validateCardData(data, '47')).toBe(data);
  });

  const invalids: readonly (readonly [string, unknown])[] = [
    ['県コードの違い', { ...base, code: '02' }],
    ['null', null],
    ['配列', []],
    ['文字列', 'x'],
    ['specialties が配列でない', { ...base, specialties: {} }],
    ['spots がない', { code: base.code, specialties: base.specialties }],
    ['名物の id が文字列でない', withItem({ id: 1 })],
    ['名物の name が文字列でない', withItem({ name: { ja: 'x' } })],
    ['名物の description.kids が文字列でない', withItem({ description: { kids: 1, adult: 'x' } })],
    ['名物の description.adult がない', withItem({ description: { kids: 'x' } })],
    ['名物の description がない', withItem({ description: undefined })],
    ['名物の draft が真偽値でない', withItem({ draft: 'false' })],
    ['名物の emoji が文字列でない', withItem({ emoji: 1 })],
    ['名物の sources が配列でない', withItem({ sources: null })],
    ['出典の url が文字列でない', withSource({ url: 1 })],
    ['出典の url が http(s) でない（javascript:）', withSource({ url: 'javascript:alert(1)' })],
    ['出典の url が http(s) でない（data:）', withSource({ url: 'data:text/html,x' })],
    ['出典の title がない', withSource({ title: undefined })],
    ['出典の accessedText が文字列でない', withSource({ accessedText: 1 })],
    ['access の mode が文字列でない', withAccess({ mode: 1 })],
    ['access の route がない', withAccess({ route: undefined })],
    ['access の durationText が文字列でない', withAccess({ durationText: 90 })],
    ['access の emoji が文字列でない', withAccess({ emoji: null })],
    ['access の draft がない', withAccess({ draft: undefined })],
    ['access が null', { ...base, access: null }]
  ];
  test.each(invalids)('D38：県コードの違い・項目の欠け・文字列でない値・http(s) でない出典の URL を invalid にする：%s', (_name, json) => {
    expect(validateCardData(json, '01')).toBeNull();
  });

  test('F-SRC-02：http の出典の URL も受け入れる', () => {
    const json = withSource({ url: 'http://example.com/' });

    expect(validateCardData(json, '01')).not.toBeNull();
  });
});
