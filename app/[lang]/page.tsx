import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n/lang';

// 仮のサイト名。UI文言の辞書（T2-02、D28）ができたら、そちらに移す
const SITE_NAME: Readonly<Record<Lang, string>> = {
  ja: 'ご当地めいぶつ日本地図',
  en: 'Japan Local Specialties Map',
  zh: '日本各地名产地图'
};

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <main>
      <h1>{SITE_NAME[lang]}</h1>
    </main>
  );
}
