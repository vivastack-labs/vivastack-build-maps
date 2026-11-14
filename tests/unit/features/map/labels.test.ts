import { describe, expect, test } from 'vitest';
import { estimateLabelWidth, MUNI_LABEL_FONT_SIZE, muniLabelText, selectLabels, visibleLabels, type LabelCandidate } from '@/features/map/labels';

const FONT = MUNI_LABEL_FONT_SIZE;

/** 中心 (x, y)・外接矩形 width×height の候補。面積は外接矩形の面積とする */
function candidate(code: string, x: number, y: number, width: number, height: number, text = '市区町村'): LabelCandidate {
  return { code, text, x, y, width, height, area: width * height };
}

/** 決まった乱数（線形合同法）。テストを再現できるようにする */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('estimateLabelWidth', () => {
  test('ラベルの幅の推定：日本語は1字＝文字の大きさ、英語は0.6倍', () => {
    expect(estimateLabelWidth('中央区', 'ja', 10)).toBe(30);
    expect(estimateLabelWidth('中央区', 'zh', 10)).toBe(30);
    expect(estimateLabelWidth('Chuo-ku', 'en', 10)).toBeCloseTo(42);
  });
});

describe('muniLabelText', () => {
  const ward = { code: '01101', name: { ja: '札幌市中央区', en: 'Chuo-ku, Sapporo-shi' }, kana: 'さっぽろしちゅうおうく', cityName: '札幌市' };
  const town = { code: '01304', name: { ja: '松前町', en: 'Matsumae-cho' }, kana: 'まつまえちょう' };

  test('区は区名だけにする（ja・en）、市町村はそのまま', () => {
    expect(muniLabelText(ward, 'ja')).toBe('中央区');
    expect(muniLabelText(ward, 'en')).toBe('Chuo-ku');
    expect(muniLabelText(town, 'ja')).toBe('松前町');
    expect(muniLabelText(town, 'en')).toBe('Matsumae-cho');
  });

  test('F-I18N-05：中国語は日本語の漢字表記', () => {
    expect(muniLabelText(ward, 'zh')).toBe('中央区');
    expect(muniLabelText(town, 'zh')).toBe('松前町');
  });

  test('cityName が名前の先頭と合わないときは、名前をそのまま使う', () => {
    expect(muniLabelText({ ...ward, cityName: '別の市' }, 'ja')).toBe('札幌市中央区');
  });
});

describe('selectLabels', () => {
  test('F-MUNI-02: 画面上の大きさが小さい市区町村のラベルは選ばない', () => {
    const small = candidate('a', 100, 100, 5, 5);

    const labels = selectLabels([small], 'ja');

    expect(visibleLabels(labels, 1)).toEqual([]);
  });

  test('F-MUNI-02: 重なる2つのラベルは、片方（面積の大きいほう）だけを選ぶ', () => {
    const large = candidate('large', 100, 100, 80, 40);
    const near = candidate('near', 105, 102, 60, 30);

    const labels = selectLabels([near, large], 'ja');

    expect(visibleLabels(labels, 1).map(label => label.code)).toEqual(['large']);
  });

  test('F-MUNI-02: 倍率を上げると、重なっていたラベルの両方が出る', () => {
    const left = candidate('left', 100, 100, 80, 40);
    const right = candidate('right', 140, 100, 80, 40);

    const labels = selectLabels([left, right], 'ja');

    expect(visibleLabels(labels, 1).map(label => label.code)).toEqual(['left']);
    expect(
      visibleLabels(labels, 8)
        .map(label => label.code)
        .sort()
    ).toEqual(['left', 'right']);
  });

  test('F-MUNI-02: 倍率を上げると、小さい市区町村のラベルが出る', () => {
    const small = candidate('a', 100, 100, 12, 12);

    const labels = selectLabels([small], 'ja');

    expect(visibleLabels(labels, 1)).toEqual([]);
    expect(visibleLabels(labels, 16).map(label => label.code)).toEqual(['a']);
  });

  test('F-MUNI-02: 倍率を上げても、選ばれるラベルの数は減らない（前の倍率で出たラベルは残る）', () => {
    const next = random(42);
    const candidates = Array.from({ length: 150 }, (_, i) => {
      const width = 4 + next() * 60;
      return candidate(`c${i}`, next() * 500, next() * 500, width, 3 + next() * 40);
    });
    const labels = selectLabels(candidates, 'ja');
    const scales = Array.from({ length: 40 }, (_, i) => 1 + i * 0.5);

    const visibleCodes = scales.map(k => new Set(visibleLabels(labels, k).map(label => label.code)));

    visibleCodes.slice(1).forEach((codes, i) => {
      for (const code of visibleCodes[i] ?? []) expect(codes.has(code)).toBe(true);
    });
    expect(visibleCodes.at(-1)?.size).toBeGreaterThan(visibleCodes[0]?.size ?? 0);
  });

  test('F-MUNI-02: どの倍率でも、表示するラベルの箱は重ならず、外接矩形に入る', () => {
    const next = random(7);
    const candidates = Array.from({ length: 120 }, (_, i) => candidate(`c${i}`, next() * 400, next() * 400, 5 + next() * 70, 4 + next() * 40));
    const labels = selectLabels(candidates, 'ja');
    const byCode = new Map(candidates.map(c => [c.code, c]));

    for (const k of [1, 2, 4, 8, 16, 32]) {
      const shown = visibleLabels(labels, k);
      for (const label of shown) {
        const source = byCode.get(label.code) as LabelCandidate;
        expect((label.text.length * FONT) / k).toBeLessThanOrEqual(source.width);
        expect(FONT / k).toBeLessThanOrEqual(source.height);
      }
      shown.forEach((a, i) => {
        for (const b of shown.slice(i + 1)) {
          const overlapX = Math.abs(a.x - b.x) < (a.text.length * FONT) / k / 2 + (b.text.length * FONT) / k / 2;
          const overlapY = Math.abs(a.y - b.y) < FONT / k;
          expect(overlapX && overlapY).toBe(false);
        }
      });
    }
  });

  test('F-MUNI-02: 拡大の上限（佐賀県で約95倍）でも出るように、倍率の段は 95 を超える', () => {
    // 4字のラベルの幅は 44÷k。幅 0.5 の外接矩形に入るのは k が 88 以上
    const verySmall = candidate('a', 100, 100, 0.5, 0.5);

    const labels = selectLabels([verySmall], 'ja');

    expect(labels).toHaveLength(1);
    expect(labels[0]?.minScale).toBeGreaterThan(64);
    expect(visibleLabels(labels, 95)).toHaveLength(1);
  });

  test('F-MUNI-02: 上限の倍率でも入らないラベルは出ない', () => {
    const tiny = candidate('tiny', 100, 100, 0.1, 0.1);

    const labels = selectLabels([tiny], 'ja');

    expect(labels).toEqual([]);
  });

  test('英語は1字が0.6倍なので、日本語より小さい外接矩形にも入る', () => {
    const box = candidate('a', 100, 100, 40, 14, 'Abcde');

    const labels = selectLabels([box], 'en');

    expect(visibleLabels(labels, 1)).toHaveLength(1);
    expect(visibleLabels(selectLabels([{ ...box, text: '中中中中中' }], 'ja'), 1)).toHaveLength(0);
  });
});
