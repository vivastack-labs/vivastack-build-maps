import { notFound } from 'next/navigation';
import { CardArea } from '@/components/CardArea';
import { IndexArea } from '@/components/IndexArea';
import { MapArea } from '@/components/MapArea';
import { MapStateProvider } from '@/components/MapStateProvider';
import { isLang } from '@/i18n/lang';
import { loadContent } from '@/lib/content';
import { distancesFromTokyo } from '@/lib/distance';
import { buildTarget, publish } from '@/lib/publish';

type Props = {
  params: Promise<{ lang: string }>;
};

// 4.11.7：1024px以上は地図（2/3）とカード（1/3）の2列、その下にさくいん。それより狭いときは1列
export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  // D24：ビルド時に県の基本情報（県名・地方）を読み、地図に埋め込む。読み込みと絞り込みはここで1回だけ行う。
  // 7.1・R1：本番は reviewed の項目だけを出し、そうでない県は「準備中」にする（プレビューは下書きの印つきですべてを出す）。
  // 地図・カード・さくいん・ツールチップは、絞り込みの後の県（PublishedPrefecture）しか受け取れない
  const prefectures = publish(loadContent(), buildTarget());
  // 7.5：東京からの距離もビルド時に1回だけ計算する（サーバーコンポーネントなので、計算のコードはクライアントに入らない）
  const distances = distancesFromTokyo(prefectures);

  return (
    // T2-05：地図とカードが同じ状態を見る。MapStateProvider は DOM の要素を出さないので、grid の子は変わらない
    <main className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3">
      <MapStateProvider>
        <div className="min-w-0 lg:col-span-2">
          <MapArea lang={lang} prefectures={prefectures} />
        </div>
        <CardArea lang={lang} prefectures={prefectures} distances={distances} />
        <div className="min-w-0 lg:col-span-2">
          <IndexArea lang={lang} prefectures={prefectures} />
        </div>
      </MapStateProvider>
    </main>
  );
}
