import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { htmlLang, isLang, langStaticParams } from '@/i18n/lang';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { MODE_INIT_SCRIPT } from '@/features/mode/initScript';
import { DEFAULT_DISPLAY } from '@/features/mode/settings';
import { getMessages } from '@/i18n/messages';
import { buildTarget } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { alternateUrls } from '@/lib/site';
import '../globals.css';

// F-I18N-01・D28：ja・en・zh だけを静的に生成し、それ以外のパスは作らない
export const dynamicParams = false;

export function generateStaticParams() {
  return langStaticParams();
}

type Props = {
  children: ReactNode;
  params: Promise<{ lang: string }>;
};

/** D21・D35：本番の静的出力だけに、公開サイト識別子を使う計測スクリプトを出す。 */
function webAnalyticsSiteId(): string | undefined {
  if (process.env.NODE_ENV !== 'production' || buildTarget() !== 'production') return undefined;

  const siteId = process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_ID;
  if (siteId && !/^[a-f0-9]{32}$/iu.test(siteId)) {
    throw new Error('CLOUDFLARE_WEB_ANALYTICS_SITE_ID に有効な公開サイト識別子を設定してください');
  }
  return siteId;
}

// 5.2：<title> は言語ごとのサイト名（ふりがなの記法を除く）。
// F-I18N-03：`alternates` で `<link rel="canonical">` と `<link rel="alternate" hreflang>` を出す。
// 11.4 (5)・R4：プレビュー用のビルドは <meta name="robots" content="noindex"> を付ける（下書きを検索に出さない）。本番には付けない
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return {
    title: plainText(getMessages(lang).siteName),
    // F-I18N-03・D8：canonical はそのページ、hreflang は ja・en・zh-Hans・x-default（→ ja）。URL はサイトの絶対 URL
    alternates: alternateUrls(lang),
    // T4-02、D40：言語ごとの Web App Manifest と、アイコン（ファビコンの SVG・iOS のホーム画面用の PNG）。どれも同じオリジン（CSP の default-src 'self'・img-src 'self'。5.5）
    manifest: `/${lang}/app.webmanifest`,
    icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
    ...(buildTarget() === 'preview' ? { robots: { index: false } } : {})
  };
}

// ヘッダーとフッターはここに置かない（T4-05）：ページごとに h1 の出し分け・言語の切替の行き先・フッターの aria-current が変わるので、各ページが PageFrame で置く。
// D28：app/[lang]/layout.tsx をルートレイアウトにして <html lang> を出力する（6.2 D27）。
// T3-05：<html data-mode data-ruby> に言語ごとの既定値（D37）を書く（JavaScript がなくても既定のモードで読める。F-MODE-04）。
// <head> の初期化スクリプトが、最初の描画の前に localStorage の保存した値で上書きし、URL のハッシュの県を data-hash-pref に書く（T4-04。CSS が :target の代わりに使う）ので、<html> の属性は suppressHydrationWarning にする（D23）。
// dangerouslySetInnerHTML はここだけ。中身は固定の定数（利用者の入力が入らない）。
export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const analyticsSiteId = webAnalyticsSiteId();

  return (
    <html lang={htmlLang(lang)} data-mode={DEFAULT_DISPLAY[lang].mode} data-ruby={DEFAULT_DISPLAY[lang].ruby} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
      </head>
      <body className="bg-page-bg text-page-text">
        {children}
        <ServiceWorkerRegistration />
        {analyticsSiteId && <script type="module" defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: analyticsSiteId })} />}
      </body>
    </html>
  );
}
