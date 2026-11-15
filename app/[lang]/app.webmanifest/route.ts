import { webManifest } from '@/features/pwa/manifest';
import { isLang, langStaticParams } from '@/i18n/lang';

// T4-02、D40：言語ごとの Web App Manifest（/{lang}/app.webmanifest）をビルド時に出力する。
// 名前を manifest.webmanifest にしないのは、Next.js のメタデータのファイル（app/manifest.ts）と紛れないため。
export const dynamic = 'force-static';
export const dynamicParams = false;

type Props = { params: Promise<{ lang: string }> };

/** 出力する言語（ja・en・zh） */
export function generateStaticParams() {
  return langStaticParams();
}

/** その言語の manifest を返す。`params` は境界なので、言語を許可リストで確かめる */
export async function GET(_request: Request, { params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(webManifest(lang)), { headers: { 'Content-Type': 'application/manifest+json' } });
}
