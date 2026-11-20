import type { Metadata } from 'next';
import { RubyText } from '@/components/RubyText';
import { htmlLang, langPath, type Lang } from '@/i18n/lang';
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
      <body className="flex min-h-dvh flex-col bg-page-bg text-page-text">
        <header className="px-4 py-3">
          <p className="text-xl font-bold">
            <RubyText text={MESSAGES.siteName} />
          </p>
        </header>
        <main className="grid flex-1 place-items-center px-4 py-8 sm:py-12">
          <div className="w-full max-w-xl rounded-2xl border border-map-frame bg-map-sea px-5 py-10 text-center text-map-sea-label sm:px-10 sm:py-14">
            <p aria-hidden="true" className="text-7xl leading-none font-black tracking-tight sm:text-8xl">
              404
            </p>
            <h1 className="mt-5 text-xl leading-relaxed font-bold sm:text-2xl">
              <RubyText text={MESSAGES.notFound.title} />
            </h1>
            <p className="mt-2 leading-relaxed">
              <RubyText text={MESSAGES.notFound.description} />
            </p>
            <a
              href={langPath(NOT_FOUND_LANG)}
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-map-selected px-5 py-2 font-bold text-map-selected-label hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-map-border"
            >
              <span>
                <RubyText text={MESSAGES.notFound.backToTop} />
              </span>
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
