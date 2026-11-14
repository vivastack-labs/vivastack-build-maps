// T3-02：コンポーネントのテストの道具。コンテンツを読み込み、publish で絞り込んだ県にする
import { loadContent } from '@/lib/content';
import { publish, type BuildTarget, type PublishedPrefecture } from '@/lib/publish';

/**
 * ディレクトリ（省くと content/prefectures/）のコンテンツを、ビルドの種類（省くと preview）で絞り込んで返す。
 * preview は「準備中」の県が出ないので、県の数・名前だけを使うテストはこれで足りる
 */
export function publishedPrefectures(dir?: string, target: BuildTarget = 'preview'): readonly PublishedPrefecture[] {
  return publish(loadContent(dir), target);
}
