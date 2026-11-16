import { langPath, type Lang, type SitePage } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { N03_SOURCE_URL } from '@/lib/sources';
import { LinkedSentence } from './LinkedSentence';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang; readonly page: SitePage };

const LINK_CLASS = 'inline-flex min-h-11 items-center underline aria-[current=page]:font-bold';

/**
 * ページの下部（4.11.7）。地図データの出典（国土数値情報を加工して作成したこと。8.3）と、「AIで作成し、人が確認しています」を3言語で出す（F-SRC-04）。
 * 文は「辞書の前の文 + URL のリンク + 辞書の後の文」。リンクは同じタブで開く（フッターは選んだ県の状態と関係なく、読み終えた後に押すため）。
 * その下に、「このサイトについて」・プライバシーポリシーへのリンク（T4-05。静的なページなので、`LangSwitch` と同じふつうの `<a>`）。`page`（今のページ）のリンクに `aria-current="page"`。
 * 読みがな（総務省）・県庁の位置（地理院地図）の出典は、「このサイトについて」に載せる。
 */
export function Footer({ lang, page }: Props) {
  const { mapSource, ai, about, privacy, linksLabel } = getMessages(lang).footer;
  return (
    <footer className="space-y-1 px-4 py-6 text-sm">
      <p data-footer-map-source className="break-words">
        <LinkedSentence text={mapSource} url={N03_SOURCE_URL} />
      </p>
      <p data-footer-ai>
        <RubyText text={ai} />
      </p>
      <ul aria-label={plainText(linksLabel)} className="flex flex-wrap gap-x-4">
        <li>
          <a href={langPath(lang, 'about')} data-footer-link="about" aria-current={page === 'about' ? 'page' : undefined} className={LINK_CLASS}>
            <RubyText text={about} />
          </a>
        </li>
        <li>
          <a href={langPath(lang, 'privacy')} data-footer-link="privacy" aria-current={page === 'privacy' ? 'page' : undefined} className={LINK_CLASS}>
            <RubyText text={privacy} />
          </a>
        </li>
      </ul>
    </footer>
  );
}
