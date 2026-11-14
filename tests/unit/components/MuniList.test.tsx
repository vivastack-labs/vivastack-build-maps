import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MapStateProvider } from '@/components/MapStateProvider';
import { MuniList } from '@/components/MuniList';
import type { Lang } from '@/i18n/lang';
import { getMessages } from '@/i18n/messages';
import { loadedLoader, Probe, toggleMaximize } from './muni-test-helpers';
import type { MuniLoader } from '@/features/map/muniLoader';

function renderList(lang: Lang = 'ja', loader: MuniLoader = loadedLoader().loader) {
  return render(
    <MapStateProvider>
      <MuniList lang={lang} labels={getMessages(lang).muni} loader={loader} />
      <Probe />
    </MapStateProvider>
  );
}

describe('MuniList', () => {
  test('4.11.6: 最大化していなければ「市区町村の一覧」を出さない', () => {
    const { container } = renderList();

    expect(container.querySelector('[data-muni-list]')).toBeNull();
  });

  test('4.11.6: 最大化中で読み込めたときだけ <details> を出し、すべての市区町村がある（code の順）', async () => {
    const { container } = renderList();

    await toggleMaximize();

    const details = container.querySelector('details[data-muni-list]');
    // 見出しの件数は、言語の括弧の中（ふりがなの <rt> の読みを含む本文の末尾）
    expect(details?.querySelector('summary')?.textContent).toMatch(/（4）$/u);
    expect([...container.querySelectorAll('[data-muni-item]')].map(item => item.getAttribute('data-muni-item'))).toEqual(['20101', '20102', '20103', '20104']);
    expect(screen.getByText('市20101')).toBeInTheDocument();
  });

  test('F-I18N-05: 英語のページの一覧はローマ字', async () => {
    const { container } = renderList('en');

    await toggleMaximize();

    expect(container.querySelector('summary')?.textContent).toBe('List of municipalities (4)');
    expect(screen.getByText('City 20101')).toBeInTheDocument();
    expect(screen.queryByText('市20101')).toBeNull();
  });

  test('F-I18N-05: 中国語のページの一覧は日本語の漢字表記で、lang="ja" が付く', async () => {
    const { container } = renderList('zh');

    await toggleMaximize();

    expect(container.querySelector('summary')?.textContent).toBe('市区町村列表（4）');
    expect(screen.getByText('市20101').getAttribute('lang')).toBe('ja');
  });

  test('最大化を解除すると一覧は消える', async () => {
    const { container } = renderList();
    await toggleMaximize();

    await toggleMaximize();

    expect(container.querySelector('[data-muni-list]')).toBeNull();
  });
});
