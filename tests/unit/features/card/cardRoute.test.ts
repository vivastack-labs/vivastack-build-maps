import { describe, expect, test } from 'vitest';
import { cardForRequest, cardStaticParams, parseCardFile } from '@/features/card/cardRoute';
import { FIXTURE_DIR } from '../../lib/content-helpers';
import { publishedPrefectures } from '../../lib/published-helpers';

const production = publishedPrefectures(FIXTURE_DIR, 'production');
const preview = publishedPrefectures(FIXTURE_DIR, 'preview');

describe('parseCardFile', () => {
  test.each([
    ['01.json', '01'],
    ['47.json', '47']
  ])('D38：%s は県コード %s', (file, code) => {
    expect(parseCardFile(file)).toBe(code);
  });

  test.each(['00.json', '48.json', '1.json', '01', '01.json/', '../01.json', '01.JSON', '01.json.json', 'constructor.json', ''])('D38：許可リストにないファイル名（%s）は null', file => {
    expect(parseCardFile(file)).toBeNull();
  });
});

describe('cardStaticParams', () => {
  test('D38：47県 × 3言語の NN.json を出す（Next.js の静的出力は、1つ以上の経路が要る。本物のコンテンツは全部が準備中でも空にならない）', () => {
    expect(cardStaticParams(production)).toHaveLength(47 * 3);
    expect(cardStaticParams(production).slice(0, 3)).toEqual([
      { lang: 'ja', file: '01.json' },
      { lang: 'en', file: '01.json' },
      { lang: 'zh', file: '01.json' }
    ]);
    expect(cardStaticParams(preview)).toHaveLength(47 * 3);
  });
});

describe('cardForRequest', () => {
  test('D38：言語・ファイル名・県が正しければ、その言語のカードの内容を返す', () => {
    const data = cardForRequest(production, 'en', '01.json');

    expect(data?.code).toBe('01');
    expect(data?.specialties.length).toBeGreaterThan(0);
  });

  test('D38：準備中の県の JSON は内容が空（本番に未確認の内容を出さない）', () => {
    expect(cardForRequest(production, 'ja', '47.json')).toEqual({ code: '47', specialties: [], spots: [] });
  });

  test.each([
    ['fr', '01.json'],
    ['../ja', '01.json'],
    ['ja', '../01.json'],
    ['ja', '99.json'],
    ['ja', '00.json']
  ])('D38：言語（%s）・ファイル名（%s）が許可リストにある値でなければ null（404）', (lang, file) => {
    expect(cardForRequest(production, lang, file)).toBeNull();
  });

  test('D38：県が一覧にないときは null（404）', () => {
    expect(
      cardForRequest(
        production.filter(item => item.code !== '02'),
        'ja',
        '02.json'
      )
    ).toBeNull();
  });
});
