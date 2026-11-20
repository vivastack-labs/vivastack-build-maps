import { langPath, type Lang, type SitePage } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import { N03_SOURCE_URL } from '@/lib/sources';
import { LinkedSentence } from './LinkedSentence';
import { RubyText } from './RubyText';

type Props = { readonly lang: Lang; readonly page: SitePage };

const LINK_CLASS = 'inline-flex min-h-11 items-center underline aria-[current=page]:font-bold';

/**
 * ページの下部（4.11.7、F-SRC-04）。「このサイトについて」・プライバシーポリシーへのリンクを載せる。
 * 説明ページのフッターには地図データの出典と AI の利用も表示する（8.3）。今のページのリンクに `aria-current="page"` を付ける。
 */
export function Footer({ lang, page }: Props) {
  const { mapSource, ai, about, privacy, linksLabel } = getMessages(lang).footer;
  return (
    <footer className="space-y-1 px-4 py-6 text-sm">
      {page !== 'home' && (
        <>
          <p data-footer-map-source className="break-words">
            <LinkedSentence text={mapSource} url={N03_SOURCE_URL} />
          </p>
          <p data-footer-ai>
            <RubyText text={ai} />
          </p>
        </>
      )}
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
