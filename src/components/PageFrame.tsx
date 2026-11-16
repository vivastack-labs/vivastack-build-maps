import type { ReactNode } from 'react';
import type { Lang, SitePage } from '@/i18n/lang';
import { Footer } from './Footer';
import { Header } from './Header';

type Props = { readonly lang: Lang; readonly page: SitePage; readonly children: ReactNode };

/**
 * 3つのページ（トップ・「このサイトについて」・プライバシーポリシー）の共通の枠（4.11.7、T4-05）：`Header` ・本体（`<main>`）・`Footer`。
 * ルートレイアウトは子のページを知らないので、ヘッダー（h1 の出し分け・言語の切替の行き先）とフッター（今のページの `aria-current`）は、
 * ページが `page` を渡してここで置く。ランドマークは `header`・`main`・`footer` の3つだけ。
 */
export function PageFrame({ lang, page, children }: Props) {
  return (
    <>
      <Header lang={lang} page={page} />
      {children}
      <Footer lang={lang} page={page} />
    </>
  );
}
