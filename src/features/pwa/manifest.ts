import type { Lang } from '../../i18n/lang.ts';
import { htmlLang } from '../../i18n/lang.ts';
import { getMessages } from '../../i18n/messages.ts';
import { plainText } from '../../lib/ruby.ts';

/** Web App Manifest のアイコン1つ */
export type ManifestIcon = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: 'any' | 'maskable';
};

/** 言語ごとの Web App Manifest（使う項目だけ） */
export type WebManifest = {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: 'standalone';
  readonly lang: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly ManifestIcon[];
};

// app/globals.css の --color-page-bg（明るいときの値）
const PAGE_BACKGROUND = '#ffffff';

/**
 * ホーム画面に追加するときの Web App Manifest を言語ごとに作る（5.4、D40）。
 * `id`・`start_url` はその言語のページで、3言語を別のアプリとして追加できる。`scope` は `/`（言語の切替でアプリの外に出ない）。
 * 名前は辞書から取り、ふりがなの記法は除く。
 */
export const webManifest = (lang: Lang): WebManifest => {
  const messages = getMessages(lang);
  return {
    id: `/${lang}/`,
    name: plainText(messages.siteName),
    short_name: plainText(messages.pwa.shortName),
    start_url: `/${lang}/`,
    scope: '/',
    display: 'standalone',
    lang: htmlLang(lang),
    background_color: PAGE_BACKGROUND,
    theme_color: PAGE_BACKGROUND,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
};
