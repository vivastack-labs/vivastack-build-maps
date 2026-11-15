import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { countLength, LENGTH_RANGES } from '../../../src/lib/content-rules';
import { loadContent, validateContent, type Prefecture } from '../../../src/lib/content';
import { plainText } from '../../../src/lib/ruby';
import { assertSafeOutDir, isGitIgnored, makeMaxContent, run, writeMaxContent } from '../../../scripts/make-max-content';

const FIXTURE_DIR = join(import.meta.dirname, '../../fixtures/content');
const REPO_ROOT = join(import.meta.dirname, '../../..');
const base = loadContent(FIXTURE_DIR);
const LANGS = ['ja', 'en', 'zh'] as const;
const MODES = ['kids', 'adult'] as const;

const itemsOf = (pref: Prefecture) => [...pref.specialties.map(item => ({ list: 'specialties' as const, item })), ...pref.spots.map(item => ({ list: 'spots' as const, item }))];

// 7.3・D24：上限まで埋めたダミーのコンテンツ（T3-08）
describe('makeMaxContent', () => {
  const prefectures = makeMaxContent(base, 1);

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

    const made = makeMaxContent(base, 1);

    expect(base).toEqual(before);
    expect(made.map(pref => [pref.code, pref.id, pref.name, pref.capital])).toEqual(base.map(pref => [pref.code, pref.id, pref.name, pref.capital]));
    expect(plainText(made[0]?.specialties[0]?.name.ja ?? '')).not.toBe('');
  });

  test('同じシードなら同じ内容になる。シードが違えば違う内容になる', () => {
    expect(makeMaxContent(base, 1)).toEqual(prefectures);
    expect(makeMaxContent(base, 2)).not.toEqual(prefectures);
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
    const prefectures = makeMaxContent(base, 1);

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

    writeMaxContent(out, makeMaxContent(base.slice(0, 2), 1));

    expect(readdirSync(out)).toEqual(['01-hokkaido.yaml', '02-aomori.yaml']);
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

    const code = run(['--out', out, '--seed', '7'], io, { base, isIgnored: () => false });

    expect(code).toBe(0);
    expect(readdirSync(out)).toHaveLength(47);
    expect(lines.join('\n')).toContain(out);
  });

  test('--out がない・--seed が整数でない・.gitignore されていないリポジトリの中なら、書かずに終了コード 2', () => {
    const inRepo = join(REPO_ROOT, 'content/prefectures-max');
    const cases = [[], ['--out', join(dir, 'x'), '--seed', 'abc'], ['--out', inRepo], ['--unknown']];

    const codes = cases.map(argv => run(argv, io, { base, isIgnored: () => false, repoRoot: REPO_ROOT }));

    expect(codes).toEqual([2, 2, 2, 2]);
    expect(warnings).toHaveLength(4);
    expect(existsSync(join(dir, 'x'))).toBe(false);
    expect(existsSync(inRepo)).toBe(false);
  });
});
