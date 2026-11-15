import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { CardDetails } from '@/components/CardDetails';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';
import { PrefCard } from '@/components/PrefCard';
import { cardData, type CardData } from '@/features/card/cardData';
import type { CardLoader } from '@/features/card/cardLoader';
import type { LoadResult, LoadStatus } from '@/features/loader/resourceLoader';
import { cardDetailLabels } from '@/i18n/cardText';
import { getMessages } from '@/i18n/messages';
import type { PublishedPrefecture } from '@/lib/publish';
import { plainText } from '@/lib/ruby';
import { FIXTURE_DIR } from '../lib/content-helpers';
import { publishedPrefectures } from '../lib/published-helpers';
import { textWithoutRuby } from './base-text';

const production = publishedPrefectures(FIXTURE_DIR, 'production');
const preview = publishedPrefectures(FIXTURE_DIR, 'preview');
const hokkaido = production.find(p => p.code === '01') as PublishedPrefecture;
const tokyo = preview.find(p => p.code === '13') as PublishedPrefecture;
const okinawaPending = production.find(p => p.code === '47') as PublishedPrefecture;

const dataOf = (prefecture: PublishedPrefecture): CardData => cardData(prefecture, 'ja');

type Pending = { readonly code: string; readonly notify: (status: LoadStatus<CardData>) => void };

/** 呼ばれたら通知を保留する読み込み部品。テストが `settle` で結果を返す */
function manualLoader() {
  const calls: Pending[] = [];
  const load = vi.fn((code: string, onStatus: (status: LoadStatus<CardData>) => void) => {
    calls.push({ code, notify: onStatus });
    onStatus({ kind: 'loading' });
    return new Promise<LoadResult<CardData>>(() => undefined);
  });
  return { load, calls, loader: { load } as unknown as CardLoader };
}

/** 呼ばれたら、すぐ読み込めたと通知する読み込み部品 */
function instantLoader(byCode: Record<string, CardData>) {
  const load = vi.fn((code: string, onStatus: (status: LoadStatus<CardData>) => void) => {
    const result = { kind: 'loaded', data: byCode[code] as CardData } as const;
    onStatus(result);
    return Promise.resolve(result);
  });
  return { load, loader: { load } as unknown as CardLoader };
}

/** 県を選ぶボタン（固定と、ホバーを模す） */
function Controls() {
  const { dispatch } = useMapState();
  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '01' })}>
        pin-01
      </button>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '13' })}>
        pin-13
      </button>
      <button type="button" onClick={() => dispatch({ type: 'hover', pref: '13' })}>
        hover-13
      </button>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '47' })}>
        pin-47
      </button>
      <button type="button" onClick={() => dispatch({ type: 'escape' })}>
        escape
      </button>
    </>
  );
}

function Fixture({ loader }: { readonly loader: CardLoader }) {
  return (
    <MapStateProvider>
      <div data-card-switch>
        {[hokkaido, tokyo, okinawaPending].map(prefecture => (
          <PrefCard key={prefecture.code} lang="ja" prefecture={prefecture} distanceKm={prefecture.code === '13' ? null : 830} />
        ))}
        <CardDetails lang="ja" labels={cardDetailLabels('ja')} loader={loader} />
      </div>
      <Controls />
    </MapStateProvider>
  );
}

const text = (element: Element | null): string => textWithoutRuby(element as Element);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const slot = (code: string, kind: 'body' | 'sources-slot' = 'body') => document.querySelector(`[data-card-${kind === 'body' ? 'body' : 'sources-slot'}="${code}"]`) as HTMLElement;

describe('CardDetails', () => {
  test('F-CARD-02〜06：表示中の県の行き方・名物・名所を差し込み先に描く', () => {
    // Arrange
    const { loader, load } = instantLoader({ '01': dataOf(hokkaido) });
    render(<Fixture loader={loader} />);

    // Act
    click('pin-01');

    // Assert
    expect(load).toHaveBeenCalledWith('01', expect.any(Function));
    const body = slot('01');
    expect(body.querySelector('[data-card-details="loaded"]')).not.toBeNull();
    expect(body.querySelectorAll('[data-card-specialties] [data-card-item]')).toHaveLength(3);
    expect(body.querySelectorAll('[data-card-spots] [data-card-item]')).toHaveLength(3);
    expect(text(body.querySelector('[data-card-access] [data-card-duration]'))).toContain('1時間35分');
    // 別の県の差し込み先には描かない
    expect(slot('13').querySelector('[data-card-item]')).toBeNull();
  });

  test('F-SRC-01〜03：出典を出典欄の差し込み先（最大化ボタンの後）に描く', () => {
    // Arrange
    const { loader } = instantLoader({ '01': dataOf(hokkaido) });
    render(<Fixture loader={loader} />);

    // Act
    click('pin-01');

    // Assert
    const sources = slot('01', 'sources-slot');
    expect(sources.querySelector('details[data-card-sources]')).not.toBeNull();
    expect(sources.querySelectorAll('[data-source-item]')).toHaveLength(7);
    const button = document.querySelector('[data-card-pref="01"] [data-card-maximize]') as HTMLElement;
    expect(button.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('D38：ホバー（固定なし）で表示中の県も読み込んで描く', () => {
    // Arrange
    const { loader, load } = instantLoader({ '13': dataOf(tokyo) });
    render(<Fixture loader={loader} />);

    // Act
    click('hover-13');

    // Assert
    expect(load).toHaveBeenCalledWith('13', expect.any(Function));
    expect(slot('13').querySelector('[data-card-item]')).not.toBeNull();
  });

  test('D38：表示中の県がないときは読み込まない', () => {
    const { loader, load } = instantLoader({});

    render(<Fixture loader={loader} />);

    expect(load).not.toHaveBeenCalled();
  });

  test('4.11.4：準備中の県（差し込み先がない）は読み込まない', () => {
    // Arrange
    const { loader, load } = instantLoader({});
    render(<Fixture loader={loader} />);

    // Act
    click('pin-47');

    // Assert
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[data-card-details]')).toBeNull();
  });

  test('4.11.5：300ms を超えるまでは何も出さず、slow で「読み込み中」を出す', async () => {
    // Arrange
    const { loader, calls } = manualLoader();
    render(<Fixture loader={loader} />);

    // Act・Assert
    click('pin-01');
    expect(slot('01').querySelector('[data-card-details="loading"]')?.textContent).toBe('');
    await act(async () => calls[0]?.notify({ kind: 'slow' }));
    const status = slot('01').querySelector('[data-card-details="slow"] [role="status"]');
    expect(text(status)).toBe('読み込み中');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(slot('01').querySelector('[data-card-retry]')).toBeNull();
  });

  test('4.11.5：失敗したら文言（こども向け・おとな向け）と「再試行」を出し、再試行で読み直す', async () => {
    // Arrange
    const { loader, calls, load } = manualLoader();
    render(<Fixture loader={loader} />);
    click('pin-01');

    // Act：失敗
    await act(async () => calls[0]?.notify({ kind: 'failed', reason: 'http' }));

    // Assert
    const failed = slot('01').querySelector('[data-card-details="failed"]') as HTMLElement;
    const messages = getMessages('ja').card.loadFailed;
    expect(text(failed.querySelector('.kids'))).toBe(plainText(messages.kids));
    expect(text(failed.querySelector('.adult'))).toBe(plainText(messages.adult));
    expect(slot('01').querySelector('[data-card-item]')).toBeNull();

    // Act：再試行
    fireEvent.click(slot('01').querySelector('[data-card-retry]') as HTMLElement);
    expect(load).toHaveBeenCalledTimes(2);
    const retryButton = slot('01').querySelector('[data-card-retry]') as HTMLElement;
    expect(retryButton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(retryButton);
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => calls[1]?.notify({ kind: 'loaded', data: dataOf(hokkaido) }));

    // Assert：読み込めたら内容が出て、再試行のボタンは消える
    expect(slot('01').querySelector('[data-card-item]')).not.toBeNull();
    expect(slot('01').querySelector('[data-card-retry]')).toBeNull();
  });

  test('4.11.5：オフラインなら専用の文言と「再試行」を出す', async () => {
    // Arrange
    const { loader, calls } = manualLoader();
    render(<Fixture loader={loader} />);
    click('pin-01');

    // Act
    await act(async () => calls[0]?.notify({ kind: 'offline' }));

    // Assert
    const offline = slot('01').querySelector('[data-card-details="offline"]') as HTMLElement;
    expect(text(offline.querySelector('.adult'))).toBe(plainText(getMessages('ja').card.offline.adult));
    expect(slot('01').querySelector('[data-card-retry]')).not.toBeNull();
  });

  test('D38：表示中の県が変わったら、前の県の結果を使わない', async () => {
    // Arrange：北海道の読み込みが終わる前に、東京都を選ぶ
    const { loader, calls } = manualLoader();
    render(<Fixture loader={loader} />);
    click('pin-01');
    click('pin-13');

    // Act：遅れて北海道の結果が届く
    await act(async () => calls[0]?.notify({ kind: 'loaded', data: dataOf(hokkaido) }));

    // Assert：どの差し込み先にも北海道の内容は出ない
    expect(slot('01').querySelector('[data-card-item]')).toBeNull();
    expect(slot('13').querySelector('[data-card-item]')).toBeNull();
    // 東京都の結果が届けば、東京都の差し込み先に出る
    await act(async () => calls[1]?.notify({ kind: 'loaded', data: dataOf(tokyo) }));
    expect(slot('13').querySelector('[data-card-item]')).not.toBeNull();
    expect(slot('01').querySelector('[data-card-item]')).toBeNull();
  });

  test('D38：固定を外す（表示する県が変わる）と、前の県の差し込み先から内容を外す', () => {
    // Arrange
    const { loader } = instantLoader({ '01': dataOf(hokkaido), '13': dataOf(tokyo) });
    render(<Fixture loader={loader} />);
    click('pin-01');
    expect(slot('01').querySelector('[data-card-item]')).not.toBeNull();

    // Act
    click('pin-13');

    // Assert
    expect(slot('01').querySelector('[data-card-item]')).toBeNull();
    expect(slot('13').querySelector('[data-card-item]')).not.toBeNull();
  });

  test('D38：draft の項目に「下書き」の印を出す（プレビューの県）', () => {
    // Arrange
    const { loader } = instantLoader({ '13': dataOf(tokyo) });
    render(<Fixture loader={loader} />);

    // Act
    click('pin-13');

    // Assert
    expect(slot('13').querySelectorAll('[data-card-draft]').length).toBeGreaterThan(0);
  });

  test('4.11.5：再試行のボタンにフォーカスがあったなら、読み込めてボタンが消えたあと、県名の見出しへフォーカスを戻す', async () => {
    // Arrange
    const { loader, calls } = manualLoader();
    render(<Fixture loader={loader} />);
    // 本物は CardSwitch が hidden を外す。jsdom は hidden の中にフォーカスを移せない
    (document.querySelector('[data-card-pref="01"]') as HTMLElement).hidden = false;
    click('pin-01');
    await act(async () => calls[0]?.notify({ kind: 'failed', reason: 'network' }));
    const retry = slot('01').querySelector('[data-card-retry]') as HTMLElement;
    retry.focus();
    fireEvent.click(retry);

    // Act
    await act(async () => calls[1]?.notify({ kind: 'loaded', data: dataOf(hokkaido) }));

    // Assert
    expect(document.activeElement).toBe(document.querySelector('[data-card-pref="01"] [data-card-name]'));
  });
});
