import { describe, expect, test } from 'vitest';
import { webManifest } from '@/features/pwa/manifest';
import { htmlLang, LANGS } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';

describe('webManifest', () => {
  test.each(LANGS)('5.4：言語ごとの名前と start_url・id が /{lang}/ になる（%s）', lang => {
    // Act
    const manifest = webManifest(lang);

    // Assert
    expect(manifest.name).toBe(plainText(getMessages(lang).siteName));
    expect(manifest.short_name).toBe(plainText(getMessages(lang).pwa.shortName));
    expect(manifest.start_url).toBe(`/${lang}/`);
    expect(manifest.id).toBe(`/${lang}/`);
    expect(manifest.lang).toBe(htmlLang(lang));
  });

  test.each(LANGS)('5.4：ふりがなの記法（{漢字|よみ}）が名前に残らない（%s）', lang => {
    const manifest = webManifest(lang);

    expect(manifest.name).not.toMatch(/[{}|]/u);
    expect(manifest.short_name).not.toMatch(/[{}|]/u);
  });

  test('5.4：scope は言語の切替でアプリの外に出ないよう / で、display は standalone', () => {
    const manifest = webManifest('ja');

    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  test('5.4：アイコンは 192・512（any）と maskable 512 の3つ', () => {
    // Act
    const { icons } = webManifest('en');

    // Assert
    expect(icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]);
  });

  test('5.4：背景色とテーマ色が #ffffff（--color-page-bg）', () => {
    const manifest = webManifest('zh');

    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.theme_color).toBe('#ffffff');
  });

  test('5.4：呼び出しごとに別のオブジェクトを返す（共有の状態を持たない）', () => {
    expect(webManifest('ja')).not.toBe(webManifest('ja'));
    expect(webManifest('ja')).toEqual(webManifest('ja'));
  });
});
