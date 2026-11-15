import { cardForRequest, cardStaticParams } from '@/features/card/cardRoute';
import { loadContent } from '@/lib/content';
import { buildTarget, publish } from '@/lib/publish';

// T3-09、D38：カードの内容（行き方・名物・名所・出典）を、県ごと・言語ごとの JSON（/cards/{lang}/NN.json）としてビルド時に出力する。
// 静的出力では、Route Handler は `force-static` で、`generateStaticParams` にない値は 404 にする（`dynamicParams = false`）。
export const dynamic = 'force-static';
export const dynamicParams = false;

type Props = { params: Promise<{ lang: string; file: string }> };

/** 絞り込みの後の県（本番は reviewed の県だけ。ページと同じ `publish()`・`BUILD_TARGET`・`CONTENT_DIR`） */
const publishedPrefectures = () => publish(loadContent(), buildTarget());

/** 出力する言語・ファイル名（47県 × 3言語） */
export function generateStaticParams() {
  return cardStaticParams(publishedPrefectures());
}

/** その言語・県のカードの内容を JSON で返す。`params` は境界なので、言語・ファイル名を許可リストで確かめる */
export async function GET(_request: Request, { params }: Props) {
  const { lang, file } = await params;
  const data = cardForRequest(publishedPrefectures(), lang, file);
  return data === null ? new Response('Not Found', { status: 404 }) : Response.json(data);
}
