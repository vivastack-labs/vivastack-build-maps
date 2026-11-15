import { describe, expect, test } from 'vitest';
import { cardData } from '@/features/card/cardData';
import { durationText } from '@/i18n/cardText';
import { formatDate } from '@/i18n/format';
import { LANGS } from '@/i18n/lang';
import type { PublishedPrefecture } from '@/lib/publish';
import { FIXTURE_DIR } from '../../lib/content-helpers';
import { publishedPrefectures } from '../../lib/published-helpers';

const production = publishedPrefectures(FIXTURE_DIR, 'production');
const preview = publishedPrefectures(FIXTURE_DIR, 'preview');

function prefOf(list: readonly PublishedPrefecture[], code: string): PublishedPrefecture {
  const found = list.find(p => p.code === code);
  if (found === undefined) throw new Error(`フィクスチャに県 ${code} がありません`);
  return found;
}

const hokkaido = prefOf(production, '01');
const tokyoPreview = prefOf(preview, '13');
const okinawaPreview = prefOf(preview, '47');
const okinawaProduction = prefOf(production, '47');

describe('cardData', () => {
  test('D38：cardData はその言語の行き方・名物・名所・出典だけを返す（ほかの言語の文を含まない）', () => {
    // Arrange
    const otherLanguageTexts = hokkaido.specialties.flatMap(item => [item.name.en, item.description.en.adult]);

    // Act
    const data = cardData(hokkaido, 'ja');

    // Assert
    expect(data.code).toBe('01');
    expect(data.specialties.map(item => item.id)).toEqual(hokkaido.specialties.map(item => item.id));
    expect(data.spots).toHaveLength(3);
    expect(data.specialties[0]?.name).toBe(hokkaido.specialties[0]?.name.ja);
    expect(data.specialties[0]?.description).toEqual(hokkaido.specialties[0]?.description.ja);
    const json = JSON.stringify(data);
    for (const text of otherLanguageTexts) expect(json).not.toContain(text);
    expect(Object.keys(data).sort()).toEqual(['access', 'code', 'specialties', 'spots']);
  });

  test('D38：所要時間の文と確認日の文字は、言語に合わせてサーバーで作る', () => {
    for (const lang of LANGS) {
      const data = cardData(hokkaido, lang);
      expect(data.access?.durationText).toBe(durationText(lang, hokkaido.access?.durationMin ?? 0));
      expect(data.access?.sources[0]?.accessedText).toBe(formatDate(lang, '2026-11-15'));
    }
  });

  test('D38：ja の文はふりがなの記法のまま、en・zh は記法を含まない', () => {
    // Arrange・Act
    const ja = JSON.stringify(cardData(hokkaido, 'ja'));
    const en = JSON.stringify(cardData(hokkaido, 'en'));
    const zh = JSON.stringify(cardData(hokkaido, 'zh'));

    // Assert
    expect(ja).toMatch(/\{[^{}|]+\|[^{}]+\}/u);
    expect(en).not.toMatch(/\{[^{}|]+\|[^{}]+\}/u);
    expect(zh).not.toMatch(/\{[^{}|]+\|[^{}]+\}/u);
  });

  test('F-SRC-02：ja 以外の出典のタイトルは記法を除く（ja は記法のまま）', () => {
    expect(cardData(hokkaido, 'ja').access?.sources[0]?.title).toBe('{空|そら}の{旅|たび}のガイド（テスト用）');
    expect(cardData(hokkaido, 'en').access?.sources[0]?.title).toBe('空の旅のガイド（テスト用）');
  });

  test('D38：プレビューの draft の項目には draft: true が付く（reviewed は false）', () => {
    // Arrange・Act
    const data = cardData(tokyoPreview, 'ja');
    const drafts = [...data.specialties, ...data.spots].map(item => item.draft);

    // Assert
    expect(drafts).toContain(true);
    expect(drafts).toContain(false);
    expect(cardData(hokkaido, 'ja').specialties.every(item => !item.draft)).toBe(true);
    expect(data.access?.draft).toBe(false);
  });

  test('F-SRC-03：sources が空の項目は、空の配列のまま渡す', () => {
    expect(cardData(tokyoPreview, 'en').specialties[0]?.sources).toEqual([]);
  });

  test('F-CARD-06：名所の emoji は任意（ない項目はキーごと含めない）', () => {
    const withEmoji = cardData(hokkaido, 'ja').specialties[0];
    expect(typeof withEmoji?.emoji).toBe('string');
    const spots = [...cardData(hokkaido, 'ja').spots, ...cardData(tokyoPreview, 'ja').spots];
    for (const spot of spots) {
      if (hokkaido.spots.concat(tokyoPreview.spots).find(item => item.id === spot.id)?.emoji === undefined) expect(spot).not.toHaveProperty('emoji');
    }
  });

  test('D38：未作成の県（プレビュー）は、access なし・名物・名所は空', () => {
    const data = cardData(okinawaPreview, 'ja');

    expect(data).toEqual({ code: '47', specialties: [], spots: [] });
  });

  test('D38：記法でない { } を含む文があれば、JSON を作る前に例外にする（念のため。content:validate が先に誤りにする）', () => {
    // Arrange
    const broken: PublishedPrefecture = {
      ...hokkaido,
      specialties: hokkaido.specialties.map((item, i) => (i === 0 ? { ...item, description: { ...item.description, en: { kids: 'a { b', adult: 'x' } } } : item))
    };

    // Act・Assert
    expect(() => cardData(broken, 'en')).toThrow(/ふりがな/u);
    expect(() => cardData(broken, 'ja')).not.toThrow();
  });

  test('D38：準備中の県（本番）は内容を持たないので、空の JSON になる（未確認の内容は publish() が外している）', () => {
    expect(cardData(okinawaProduction, 'ja')).toEqual({ code: '47', specialties: [], spots: [] });
  });
});
