import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { formatNumber } from '@/i18n/format';
import { LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { checkRuby, parseRuby } from '@/lib/ruby';

type Leaf = { readonly path: string; readonly value: unknown };

/** 辞書を葉まで辿り、キーのパス（例：card.guide.kids）と値の一覧にする */
function leaves(value: unknown, path = ''): readonly Leaf[] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, path === '' ? key : `${path}.${key}`));
  }
  return [{ path, value }];
}

/** { kids, adult } の2つのキーだけを持つオブジェクトの位置（親のパス）の一覧 */
function modeTextPaths(value: unknown, path = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [];
  const keys = Object.keys(value).sort();
  if (keys.length === 2 && keys[0] === 'adult' && keys[1] === 'kids') return [path];
  return Object.entries(value).flatMap(([key, child]) => modeTextPaths(child, path === '' ? key : `${path}.${key}`));
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[key] : undefined), root);
}

const jaMessages = getMessages('ja');

describe('UI文言の辞書', () => {
  test('F-I18N-04：ja・en・zh の辞書のキーの集合が、入れ子まで含めて一致する', () => {
    // Arrange
    const keysOf = (lang: (typeof LANGS)[number]) =>
      leaves(getMessages(lang))
        .map(leaf => leaf.path)
        .sort();

    // Act・Assert
    expect(keysOf('en')).toEqual(keysOf('ja'));
    expect(keysOf('zh')).toEqual(keysOf('ja'));
    expect(keysOf('ja')).toContain('regions.kanto');
    expect(keysOf('ja')).toContain('card.guide.kids');
  });

  test.each(LANGS)('F-I18N-04：どの言語の文言も空でない（%s）', lang => {
    for (const { path, value } of leaves(getMessages(lang))) {
      expect(typeof value, path).toBe('string');
      expect((value as string).trim(), path).not.toBe('');
    }
  });

  test('F-I18N-04：{ kids, adult } の文言は、どの言語でも両方がある', () => {
    // Arrange
    const paths = modeTextPaths(jaMessages);

    // Assert
    expect(paths.length).toBeGreaterThan(0);
    for (const lang of LANGS) {
      const messages = getMessages(lang);
      for (const path of paths) {
        const value = valueAt(messages, path) as { kids?: unknown; adult?: unknown };
        expect(typeof value.kids, `${lang}:${path}.kids`).toBe('string');
        expect(typeof value.adult, `${lang}:${path}.adult`).toBe('string');
        expect(Object.keys(value).sort(), `${lang}:${path}`).toEqual(['adult', 'kids']);
      }
    }
  });

  test('7.2：日本語の文言が、すべて checkRuby() を誤りなしで通る', () => {
    for (const { path, value } of leaves(jaMessages)) {
      expect(checkRuby(value as string).errors, path).toEqual([]);
    }
  });

  test('7.2：日本語の文言に、ふりがなの付いていない漢字がない', () => {
    for (const { path, value } of leaves(jaMessages)) {
      expect(checkRuby(value as string).warnings, path).toEqual([]);
    }
  });

  test.each(['en', 'zh'] as const)('7.2：英語・中国語の文言に、ふりがなの記法がない（%s）', lang => {
    for (const { path, value } of leaves(getMessages(lang))) {
      const segments = parseRuby(value as string);
      expect(
        segments.some(segment => segment.kind === 'ruby'),
        path
      ).toBe(false);
    }
  });

  test('D28：getMessages は言語ごとの辞書を返す', () => {
    expect(getMessages('en').siteName).toBe('Japan Local Specialties Map');
    expect(getMessages('zh').siteName).toBe('日本各地名产地图');
    expect(getMessages('ja').siteName).toBe('ご{当地|とうち}めいぶつ{日本地図|にほんちず}');
  });

  test.each(LANGS)('D28：地方名が、コンテンツの region の8つすべてにある（%s）', lang => {
    // Arrange：スキーマの region の enum を、コンテンツの規則の出どころとして読む
    const schema = JSON.parse(readFileSync('content/schema/prefecture.schema.json', 'utf8')) as {
      properties: { region: { enum: string[] } };
    };
    const regions = schema.properties.region.enum;

    // Act・Assert
    expect(regions).toHaveLength(8);
    expect(Object.keys(getMessages(lang).regions).sort()).toEqual([...regions].sort());
  });

  test('D28：formatNumber は言語の書式で数を区切る', () => {
    expect(formatNumber('ja', 1234)).toBe('1,234');
    expect(formatNumber('en', 1234567)).toBe('1,234,567');
    expect(formatNumber('zh', 1234)).toBe('1,234');
  });
});
