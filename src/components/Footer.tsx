import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { RubyText } from './RubyText';

/** 地図データ（国土数値情報 行政区域データ N03 2026年版）の配布ページ。出典の URL として文に入れる（8.3） */
const N03_SOURCE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html';

/**
 * ページの下部（4.11.7）。地図データの出典（国土数値情報を加工して作成したこと。8.3）と、「AIで作成し、人が確認しています」を3言語で出す（F-SRC-04）。
 * 文は「辞書の前の文 + URL のリンク + 辞書の後の文」。リンクは同じタブで開く（フッターは選んだ県の状態と関係なく、読み終えた後に押すため）。
 * 読みがな（総務省）・県庁の位置（地理院地図）の出典は、T4-05 の「このサイトについて」に載せる。
 */
export function Footer({ lang }: { readonly lang: Lang }) {
  const { mapSource, ai } = getMessages(lang).footer;
  return (
    <footer className="space-y-1 px-4 py-6 text-sm">
      <p data-footer-map-source className="break-words">
        <RubyText text={mapSource.before} />
        <a href={N03_SOURCE_URL} rel="noopener noreferrer" className="underline">
          {N03_SOURCE_URL}
        </a>
        <RubyText text={mapSource.after} />
      </p>
      <p data-footer-ai>
        <RubyText text={ai} />
      </p>
    </footer>
  );
}
