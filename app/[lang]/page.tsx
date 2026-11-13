import { notFound } from 'next/navigation';
import { RubyText } from '@/components/RubyText';
import { isLang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <main>
      <h1>
        <RubyText text={getMessages(lang).siteName} />
      </h1>
    </main>
  );
}
