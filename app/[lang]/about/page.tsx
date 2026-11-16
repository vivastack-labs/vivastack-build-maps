import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AboutContent } from '@/components/AboutContent';
import { PageFrame } from '@/components/PageFrame';
import { isLang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { alternateUrls } from '@/lib/site';

type Props = {
  params: Promise<{ lang: string }>;
};

// T4-05：<title> は「ページの題名 | サイト名」。canonical・hreflang はこのページの3言語（F-I18N-03、D8）。
// プレビューの noindex・manifest・アイコンはレイアウトの generateMetadata がそのまま効く。言語は親のレイアウトの generateStaticParams（dynamicParams = false）
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const messages = getMessages(lang);

  return {
    title: `${plainText(messages.about.title)} | ${plainText(messages.siteName)}`,
    alternates: alternateUrls(lang, 'about')
  };
}

// F-SRC-04・8.3・R10：「このサイトについて」。地図データの出典・AI の利用・境界が暫定の地域
export default async function AboutPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <PageFrame lang={lang} page="about">
      <main>
        <AboutContent lang={lang} />
      </main>
    </PageFrame>
  );
}
