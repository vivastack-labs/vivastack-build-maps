import { notFound } from 'next/navigation';
import { CardArea } from '@/components/CardArea';
import { IndexArea } from '@/components/IndexArea';
import { MapArea } from '@/components/MapArea';
import { isLang } from '@/i18n/lang';

type Props = {
  params: Promise<{ lang: string }>;
};

// 4.11.7：1024px以上は地図（2/3）とカード（1/3）の2列、その下にさくいん。それより狭いときは1列
export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <main className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <MapArea />
      </div>
      <CardArea lang={lang} />
      <div className="min-w-0 lg:col-span-2">
        <IndexArea lang={lang} />
      </div>
    </main>
  );
}
