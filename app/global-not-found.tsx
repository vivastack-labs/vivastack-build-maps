import type { Metadata } from 'next';
import Link from 'next/link';
import { htmlLang, type Lang } from '@/i18n/lang';
import './globals.css';

// 5.2・T0-03：ルートレイアウトが app/[lang]/layout.tsx なので、存在しないパスの404には <html lang> が付かない。
// global-not-found で404のページ全体を出す。言語が分からないので、/maps のリダイレクト先（F-I18N-02）と同じ ja にする
const NOT_FOUND_LANG: Lang = 'ja';

export const metadata: Metadata = {
  title: 'ページが見つかりません'
};

export default function GlobalNotFound() {
  return (
    <html lang={htmlLang(NOT_FOUND_LANG)}>
      <body>
        <main>
          <h1>ページが見つかりません</h1>
          <p>
            <Link href={`/${NOT_FOUND_LANG}/`}>トップページへ</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
