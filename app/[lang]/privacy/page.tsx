import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrivacyContent } from '@/components/PrivacyContent';
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
    title: `${plainText(messages.privacy.title)} | ${plainText(messages.siteName)}`,
    alternates: alternateUrls(lang, 'privacy')
  };
}

// 5.6：プライバシーポリシー。アクセス解析（Cookie を使わない）・端末に保存するもの
export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <PageFrame lang={lang} page="privacy">
      <main>
        <PrivacyContent lang={lang} />
      </main>
    </PageFrame>
  );
}
