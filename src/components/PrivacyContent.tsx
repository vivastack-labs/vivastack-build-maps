import { LABEL_SEPARATOR } from '@/i18n/cardText';
import { formatDate } from '@/i18n/format';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { CLOUDFLARE_ANALYTICS_URL, CLOUDFLARE_PRIVACY_URL } from '@/lib/sources';
import { BulletList, ContentSection, PageTitle, Paragraph } from './ContentSection';
import { LinkedSentence } from './LinkedSentence';
import { RubyText } from './RubyText';

/** プライバシーポリシーの改定日（`YYYY-MM-DD`。言語の書式にして出す）。内容を変えたら更新する */
export const PRIVACY_REVISED_DATE = '2026-11-16';

/** アクセス解析の節：Cloudflare Web Analytics（Cookie を使わない。5.6）と、説明へのリンク */
function AnalyticsSection({ lang }: { readonly lang: Lang }) {
  const { analytics } = getMessages(lang).privacy;
  return (
    <ContentSection heading={analytics.heading} marker={['data-privacy-section', 'analytics']}>
      <Paragraph text={analytics.body} />
      <p className="break-words">
        <LinkedSentence text={analytics.detail} url={CLOUDFLARE_ANALYTICS_URL} />
      </p>
    </ContentSection>
  );
}

/** 端末に保存するものの節：localStorage（モード・ふりがな）と Service Worker のキャッシュ */
function StorageSection({ lang }: { readonly lang: Lang }) {
  const { storage } = getMessages(lang).privacy;
  return (
    <ContentSection heading={storage.heading} marker={['data-privacy-section', 'storage']}>
      <Paragraph text={storage.intro} />
      <BulletList items={storage.items} />
      <Paragraph text={storage.note} />
    </ContentSection>
  );
}

/**
 * プライバシーポリシーのページの中身（T4-05。5.6）。`<main>` の中に置く。題名が h1、節の見出しが h2。
 * アクセス解析（Cloudflare Web Analytics。Cookie を使わない）・Cookie・端末に保存するもの・配信・外部のサイト・改定日。
 * 運営者・問い合わせ先は載せない（T6-01 の前に決める）。こども向け・おとな向けの言い分けはしない。日本語はふりがなつき。
 */
export function PrivacyContent({ lang }: { readonly lang: Lang }) {
  const { title, cookies, delivery, external, revised } = getMessages(lang).privacy;
  return (
    <div className="max-w-3xl space-y-6 px-4 py-4">
      <PageTitle text={title} />
      <AnalyticsSection lang={lang} />
      <ContentSection heading={cookies.heading} marker={['data-privacy-section', 'cookies']}>
        <Paragraph text={cookies.body} />
      </ContentSection>
      <StorageSection lang={lang} />
      <ContentSection heading={delivery.heading} marker={['data-privacy-section', 'delivery']}>
        <Paragraph text={delivery.body} />
        <Paragraph text={delivery.processing} />
        <p className="break-words">
          <LinkedSentence text={delivery.detail} url={CLOUDFLARE_PRIVACY_URL} />
        </p>
      </ContentSection>
      <ContentSection heading={external.heading} marker={['data-privacy-section', 'external']}>
        <Paragraph text={external.body} />
      </ContentSection>
      <p data-privacy-revised>
        <RubyText text={revised} />
        {LABEL_SEPARATOR[lang] + formatDate(lang, PRIVACY_REVISED_DATE)}
      </p>
    </div>
  );
}
