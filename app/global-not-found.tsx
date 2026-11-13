import type { Metadata } from 'next';
import Link from 'next/link';
import { RubyText } from '@/components/RubyText';
import { htmlLang, type Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { plainText } from '@/lib/ruby';
import './globals.css';

// 5.2・T0-03：ルートレイアウトが app/[lang]/layout.tsx なので、存在しないパスの404には <html lang> が付かない。
// global-not-found で404のページ全体を出す。言語が分からないので、/ のリダイレクト先（F-I18N-02）と同じ ja にする。
// 文言は UI 文言の辞書（T2-02、D28）から取る。<title> は読みを除く
const NOT_FOUND_LANG: Lang = 'ja';
const MESSAGES = getMessages(NOT_FOUND_LANG);

export const metadata: Metadata = {
  title: plainText(MESSAGES.notFound.title)
};

export default function GlobalNotFound() {
  return (
    <html lang={htmlLang(NOT_FOUND_LANG)}>
      <body>
        <main>
          <h1>
            <RubyText text={MESSAGES.notFound.title} />
          </h1>
          <p>
            <Link href={`/${NOT_FOUND_LANG}/`}>
              <RubyText text={MESSAGES.notFound.backToTop} />
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
