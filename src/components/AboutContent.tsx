import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { GSI_MAPS_URL, N03_SOURCE_URL, SOUMU_CODE_URL } from '@/lib/sources';
import { BulletList, ContentSection, PageTitle, Paragraph } from './ContentSection';
import { LinkedSentence } from './LinkedSentence';

const SOURCE_CLASS = 'break-words';

/** 地図データの節：出典（8.3。フッターと同じ辞書の文）と、加工したこと */
function MapDataSection({ lang }: { readonly lang: Lang }) {
  const messages = getMessages(lang);
  const { mapData } = messages.about;
  return (
    <ContentSection heading={mapData.heading} marker={['data-about-section', 'mapData']}>
      <p data-about-source="map" className={SOURCE_CLASS}>
        <LinkedSentence text={messages.footer.mapSource} url={N03_SOURCE_URL} />
      </p>
      <Paragraph text={mapData.processedIntro} />
      <BulletList items={mapData.processedItems} />
      <Paragraph text={mapData.notOfficial} />
    </ContentSection>
  );
}

/** 読みがな・県庁の位置の節：8.3 の2つの出典と、東京からの距離の説明 */
function ReadingSection({ lang }: { readonly lang: Lang }) {
  const { reading } = getMessages(lang).about;
  return (
    <ContentSection heading={reading.heading} marker={['data-about-section', 'reading']}>
      <p data-about-source="soumu" className={SOURCE_CLASS}>
        <LinkedSentence text={reading.soumu} url={SOUMU_CODE_URL} />
      </p>
      <p data-about-source="gsi" className={SOURCE_CLASS}>
        <LinkedSentence text={reading.gsi} url={GSI_MAPS_URL} />
      </p>
      <Paragraph text={reading.distance} />
    </ContentSection>
  );
}

/**
 * 「このサイトについて」のページの中身（T4-05。F-SRC-04、8.3、R10）。`<main>` の中に置く。題名が h1、節の見出しが h2。
 * 地図データの出典の文は、フッターと同じ辞書の `footer.mapSource`（8.3）。読みがな（総務省）・県庁の位置（地理院地図）の出典もここに載せる。
 * こども向け・おとな向けの言い分けはしない（説明の文は1つの言い方で正確に書く）。日本語はふりがなつき。
 */
export function AboutContent({ lang }: { readonly lang: Lang }) {
  const { title, site, content, boundary } = getMessages(lang).about;
  return (
    <div className="max-w-3xl space-y-6 px-4 py-4">
      <PageTitle text={title} />
      <ContentSection heading={site.heading} marker={['data-about-section', 'site']}>
        <Paragraph text={site.body} />
      </ContentSection>
      <ContentSection heading={content.heading} marker={['data-about-section', 'content']}>
        <Paragraph text={content.body} />
      </ContentSection>
      <MapDataSection lang={lang} />
      <ContentSection heading={boundary.heading} marker={['data-about-section', 'boundary']}>
        <Paragraph text={boundary.body} />
      </ContentSection>
      <ReadingSection lang={lang} />
    </div>
  );
}
