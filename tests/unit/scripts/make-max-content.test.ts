import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { countLength, LENGTH_RANGES } from '../../../src/lib/content-rules';
import { loadContent, validateContent, type Prefecture } from '../../../src/lib/content';
import { plainText } from '../../../src/lib/ruby';
import { loadVocabulary, muniNames } from '../../../scripts/max-content-vocabulary';
import { assertSafeOutDir, isGitIgnored, makeMaxContent, run, writeMaxContent } from '../../../scripts/make-max-content';

const FIXTURE_DIR = join(import.meta.dirname, '../../fixtures/content');
const REPO_ROOT = join(import.meta.dirname, '../../..');
const base = loadContent(FIXTURE_DIR);
const words = loadVocabulary();
const LANGS = ['ja', 'en', 'zh'] as const;
const MODES = ['kids', 'adult'] as const;

const itemsOf = (pref: Prefecture) => [...pref.specialties.map(item => ({ list: 'specialties' as const, item })), ...pref.spots.map(item => ({ list: 'spots' as const, item }))];

// 7.3・D24：上限まで埋めたダミーのコンテンツ（T3-08）
describe('makeMaxContent', () => {
  const prefectures = makeMaxContent(base, 1, words);

  test('4.11.7：47県すべてに、行き方1件・名物3件・名所3件を、すべて reviewed で作る', () => {
    expect(prefectures).toHaveLength(47);
    prefectures.forEach(pref => {
      expect(pref.access?.status).toBe('reviewed');
      expect(pref.specialties).toHaveLength(3);
      expect(pref.spots).toHaveLength(3);
      expect(itemsOf(pref).every(({ item }) => item.status === 'reviewed')).toBe(true);
    });
  });

  test('7.3：作った解説文は、言語・モード・種類ごとの上限の字数・語数ちょうど（ふりがなを除いて数える）', () => {
    const lengths = prefectures.flatMap(pref =>
      itemsOf(pref).flatMap(({ list, item }) => LANGS.flatMap(lang => MODES.map(mode => ({ actual: countLength(item.description[lang][mode], lang), max: LENGTH_RANGES[list][lang][mode][1] }))))
    );

    expect(lengths).toHaveLength(47 * 6 * 6);
    expect(lengths.filter(({ actual, max }) => actual !== max)).toEqual([]);
  });

  test('7.3：日本語の文は、漢字（ふりがなつき）が文字の約半分を占める', () => {
    const ratios = prefectures.flatMap(pref =>
      itemsOf(pref).flatMap(({ item }) =>
        MODES.map(mode => {
          const text = item.description.ja[mode];
          const kanji = [...text.matchAll(/\{([^|}]+)\|[^}]+\}/gu)].reduce((sum, match) => sum + (match[1]?.length ?? 0), 0);
          return kanji / countLength(text, 'ja');
        })
      )
    );
    const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;

    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  test('7.3：同じ文を繰り返さない（gzip が実際より縮みすぎないように）', () => {
    const texts = prefectures.flatMap(pref => itemsOf(pref).flatMap(({ item }) => LANGS.flatMap(lang => MODES.map(mode => `${lang}:${item.description[lang][mode]}`))));

    expect(new Set(texts).size).toBe(texts.length);
  });

  test('7.3・9.3：出典は各項目に2件。タイトルは約30字、URL は約80字', () => {
    const sourceLists = prefectures.flatMap(pref => [pref.access?.sources ?? [], ...itemsOf(pref).map(({ item }) => item.sources)]);

    expect(sourceLists.every(sources => sources.length === 2)).toBe(true);
    sourceLists.flat().forEach(source => {
      expect(countLength(source.title, 'ja')).toBe(30);
      expect(source.url).toHaveLength(80);
      expect(source.url).toMatch(/^https:\/\/\S+$/u);
    });
  });

  test('7.1：県の基本情報（県名・県庁）と、入力は変えない', () => {
    const before = structuredClone(base);

    const made = makeMaxContent(base, 1, words);

    expect(base).toEqual(before);
    expect(made.map(pref => [pref.code, pref.id, pref.name, pref.capital])).toEqual(base.map(pref => [pref.code, pref.id, pref.name, pref.capital]));
    expect(plainText(made[0]?.specialties[0]?.name.ja ?? '')).not.toBe('');
  });

  // H1：語彙が小さいと、同じ語と読みの繰り返しで gzip が本物より縮み、計測が小さく出る。本物の文の圧縮のしにくさを下限にする。
  // 下限の根拠（pnpm exec node で測った値。2026-11-15）：
  // - ふりがなを除いた文の gzip のバイト/字：開発概要書（docs/development-overview.md）の日本語の行（約2.4万字）で 0.84。
  //   ダミーは 0.93。以前の語彙（漢字の語61・中国語62）では 0.81 で、本物より縮んでいた。下限は本物の約9割の 0.75。
  // - `<ruby>` の HTML にした文の gzip の比率（gzip 後 ÷ 圧縮前）：tests/fixtures/content の北海道・東京都の日本語の文（24文・約600字）で 0.27。
  //   見本が小さい（gzip の固定の部分と、繰り返しの少なさで大きく出る）ので上限の目安。ダミー（約2.2万字）は 0.20。以前の語彙では 0.09。下限は 0.15。
  test('H1：作った日本語の文は、本物の文より縮みすぎない（ふりがなを除いた gzip が 0.75 バイト/字以上、`<ruby>` の HTML の gzip の比率が 0.15 以上）', () => {
    // Arrange
    const texts = prefectures.flatMap(pref => itemsOf(pref).flatMap(({ item }) => MODES.map(mode => item.description.ja[mode])));
    const plain = texts.map(text => plainText(text)).join('\n');
    const html = texts.map(text => text.replace(/\{([^|}]+)\|([^}]+)\}/gu, '<ruby>$1<rt>$2</rt></ruby>')).join('\n');

    // Act
    const bytesPerChar = gzipSync(Buffer.from(plain)).length / [...plain].length;
    const htmlRatio = gzipSync(Buffer.from(html)).length / Buffer.byteLength(html);

    // Assert
    expect(bytesPerChar).toBeGreaterThanOrEqual(0.75);
    expect(htmlRatio).toBeGreaterThanOrEqual(0.15);
  });

  test('同じシードなら同じ内容になる。シードが違えば違う内容になる', () => {
    expect(makeMaxContent(base, 1, words)).toEqual(prefectures);
    expect(makeMaxContent(base, 2, words)).not.toEqual(prefectures);
  });
});

describe('writeMaxContent', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'max-content-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('7.1：作ったコンテンツは validateContent で誤り・警告がない', () => {
    // Arrange
    const prefectures = makeMaxContent(base, 1, words);

    // Act
    writeMaxContent(dir, prefectures);
    const result = validateContent(dir);

    // Assert
    expect(readdirSync(dir)).toHaveLength(47);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.prefectures).toHaveLength(47);
    expect(result.prefectures).toEqual(prefectures);
  });

  test('出力先のディレクトリがなければ作る', () => {
    const out = join(dir, 'a/b');

    writeMaxContent(out, makeMaxContent(base.slice(0, 2), 1, words));

    expect(readdirSync(out)).toEqual(['01-hokkaido.yaml', '02-aomori.yaml']);
  });
  test('S3：すでにあるファイルの先頭がこのスクリプトの印でなければ、何も書かずに例外にする', () => {
    // Arrange
    const prefectures = makeMaxContent(base.slice(0, 2), 1, words);
    writeFileSync(join(dir, '02-aomori.yaml'), 'id: aomori\n');

    // Act・Assert
    expect(() => writeMaxContent(dir, prefectures)).toThrow(/02-aomori\.yaml/u);
    expect(readdirSync(dir)).toEqual(['02-aomori.yaml']);
    expect(readFileSync(join(dir, '02-aomori.yaml'), 'utf8')).toBe('id: aomori\n');
  });

  test('S3：このスクリプトが作ったファイルなら、上書きできる', () => {
    // Arrange
    writeMaxContent(dir, makeMaxContent(base.slice(0, 2), 1, words));
    const before = readFileSync(join(dir, '01-hokkaido.yaml'), 'utf8');

    // Act
    writeMaxContent(dir, makeMaxContent(base.slice(0, 2), 2, words));

    // Assert
    expect(readFileSync(join(dir, '01-hokkaido.yaml'), 'utf8')).not.toBe(before);
    expect(validateContent(dir).prefectures).toEqual(makeMaxContent(base.slice(0, 2), 2, words));
  });
});

describe('loadVocabulary・muniNames', () => {
  let dir = '';
  const topo = (names: readonly (readonly [string, string])[]): string =>
    JSON.stringify({
      type: 'Topology',
      objects: { municipalities: { type: 'GeometryCollection', geometries: names.map(([ja, kana], i) => ({ properties: { code: `0110${i}`, name: { ja, en: 'x' }, kana } })) } }
    });
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'max-content-vocab-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('H1：コミット済みの public/geo/muni/ から、本物の漢字の名前と読みを1,500組以上取る', () => {
    expect(words.ja.length).toBeGreaterThan(1500);
    expect(words.ja).toContainEqual(['札幌市中央区', 'さっぽろしちゅうおうく']);
    expect(words.zh).toContain('札幌市中央区');
    expect(words.ja.every(([name, kana]) => /^\p{Script=Han}+$/u.test(name) && /^[ぁ-ゖー]+$/u.test(kana))).toBe(true);
  });

  test('H1：漢字だけの名前と、ひらがなの読みだけを使い、同じ組は1つにする。小さな語彙（1字の語）は残す', () => {
    // Arrange
    writeFileSync(
      join(dir, '01.topo.json'),
      topo([
        ['札幌市', 'さっぽろし'],
        ['札幌市', 'さっぽろし'],
        ['つくば市', 'つくばし'],
        ['東京都', 'トウキョウト'],
        ['日野町', 'ひのまち'],
        ['日野町', 'ひのちょう']
      ])
    );
    writeFileSync(join(dir, 'README.md'), '読まない');

    // Act
    const vocabulary = loadVocabulary(dir);

    // Assert
    const real = vocabulary.ja.filter(([name]) => name.length > 1);
    expect(real.filter(([name]) => ['札幌市', '日野町'].includes(name))).toEqual([
      ['札幌市', 'さっぽろし'],
      ['日野町', 'ひのまち'],
      ['日野町', 'ひのちょう']
    ]);
    expect(vocabulary.ja.some(([name]) => name.includes('つくば') || name.includes('東京'))).toBe(false);
    expect(vocabulary.ja.some(([name]) => name.length === 1)).toBe(true);
    expect(vocabulary.zh.filter(word => word === '札幌市')).toHaveLength(1);
  });

  test('H1：NN.topo.json が1つもない・JSON として読めない・形が違うなら、ファイル名つきの例外にする', () => {
    expect(() => loadVocabulary(dir)).toThrow(/topo\.json がありません/u);
    writeFileSync(join(dir, '01.topo.json'), '{');
    expect(() => loadVocabulary(dir)).toThrow(/01\.topo\.json：JSON として読めません/u);
    writeFileSync(join(dir, '01.topo.json'), JSON.stringify({ type: 'Topology', objects: {} }));
    expect(() => loadVocabulary(dir)).toThrow(/01\.topo\.json：市区町村のデータの形が違います/u);
  });

  test('H1：muniNames は形が違えば例外にする', () => {
    const valid = { type: 'Topology', objects: { municipalities: { geometries: [{ properties: { code: '01100', name: { ja: '札幌市' }, kana: 'さっぽろし' } }] } } };
    const withProperties = (properties: unknown): unknown => ({ ...valid, objects: { municipalities: { geometries: [{ properties }] } } });
    const bad: readonly unknown[] = [
      null,
      [],
      { ...valid, type: 'GeometryCollection' },
      { type: 'Topology' },
      { type: 'Topology', objects: { municipalities: { geometries: [] } } },
      { type: 'Topology', objects: { municipalities: { geometries: 'x' } } },
      { type: 'Topology', objects: { municipalities: { geometries: [null] } } },
      withProperties({ code: '1', name: { ja: 'あ' }, kana: 'あ' }),
      withProperties({ code: '01100', name: { en: 'x' }, kana: 'あ' }),
      withProperties({ code: '01100', name: { ja: 'あ' } }),
      withProperties({ code: 1100, name: { ja: 'あ' }, kana: 'あ' })
    ];

    expect(muniNames(valid, 'x')).toEqual([['札幌市', 'さっぽろし']]);
    bad.forEach(value => expect(() => muniNames(value, 'x.topo.json')).toThrow(/^x\.topo\.json：市区町村のデータの形が違います/u));
  });
});

describe('assertSafeOutDir', () => {
  const root = '/repo';

  test('リポジトリの外なら通る', () => {
    expect(() => assertSafeOutDir('/somewhere/else', { repoRoot: root, isIgnored: () => false })).not.toThrow();
  });

  test('リポジトリの中は、.gitignore されている場所だけ通る', () => {
    expect(() => assertSafeOutDir('/repo/tmp/max', { repoRoot: root, isIgnored: () => true })).not.toThrow();
    expect(() => assertSafeOutDir('/repo/content/prefectures', { repoRoot: root, isIgnored: () => false })).toThrow(/gitignore/iu);
  });

  test('isGitIgnored は git check-ignore で判断する', () => {
    expect(isGitIgnored(join(REPO_ROOT, 'tmp/max-content'), REPO_ROOT)).toBe(true);
    expect(isGitIgnored(join(REPO_ROOT, 'content/prefectures'), REPO_ROOT)).toBe(false);
  });
});

describe('run', () => {
  let dir = '';
  let lines: string[] = [];
  let warnings: string[] = [];
  const io = { write: (line: string) => lines.push(line), warn: (line: string) => warnings.push(line) };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'max-content-run-'));
    lines = [];
    warnings = [];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('--out に47県の YAML を書き、終了コード 0', () => {
    const out = join(dir, 'out');

    const code = run(['--out', out, '--seed', '7'], io, { base, words, isIgnored: () => false });

    expect(code).toBe(0);
    expect(readdirSync(out)).toHaveLength(47);
    expect(lines.join('\n')).toContain(out);
  });

  test('--out がない・--seed が整数でない・.gitignore されていないリポジトリの中なら、書かずに終了コード 2', () => {
    const inRepo = join(REPO_ROOT, 'content/prefectures-max');
    const cases = [[], ['--out', join(dir, 'x'), '--seed', 'abc'], ['--out', inRepo], ['--unknown']];

    const codes = cases.map(argv => run(argv, io, { base, words, isIgnored: () => false, repoRoot: REPO_ROOT }));

    expect(codes).toEqual([2, 2, 2, 2]);
    expect(warnings).toHaveLength(4);
    expect(existsSync(join(dir, 'x'))).toBe(false);
    expect(existsSync(inRepo)).toBe(false);
  });
});
