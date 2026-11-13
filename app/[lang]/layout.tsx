import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { htmlLang, isLang, langStaticParams } from '@/i18n/lang';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
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

// 5.2：<title> は言語ごとのサイト名（ふりがなの記法を除く）
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return { title: plainText(getMessages(lang).siteName) };
}

// D28：app/[lang]/layout.tsx をルートレイアウトにして <html lang> を出力する（6.2 D27）
export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <html lang={htmlLang(lang)}>
      <body className="bg-page-bg text-page-text">
        <Header lang={lang} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
