import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { contentDir, DEFAULT_CONTENT_DIR, formatIssue, loadContent, validateContent, type ContentIssue } from '@/lib/content';

import { copyFixtures, deleteIn, FIXTURE_DIR, lineOf, removeDir, setIn } from './content-helpers';

const HOKKAIDO = '01-hokkaido.yaml';
const TOKYO = '13-tokyo.yaml';
const OKINAWA = '47-okinawa.yaml';

const messagesOf = (issues: readonly ContentIssue[]): string => issues.map(formatIssue).join('\n');

let dir = '';
beforeEach(() => {
  dir = copyFixtures();
});
afterEach(() => {
  removeDir(dir);
});

// 7.1：形（JSON Schema）の検証
describe('validateContent：形', () => {
  test('7.1：フィクスチャ（全項目の県・reviewed と verified が混ざった県・未作成の県）は誤りなく通る', () => {
    // Act
    const result = validateContent(FIXTURE_DIR);

    // Assert
    expect(messagesOf(result.errors)).toBe('');
    expect(result.prefectures.map(pref => pref.code)).toEqual(['01', '13', '47']);
  });

  test('7.1：名物・名所が空で、行き方がない県は通る', () => {
    const result = validateContent(dir);

    const okinawa = result.prefectures.find(pref => pref.id === 'okinawa');
    expect(okinawa?.specialties).toEqual([]);
    expect(okinawa?.access).toBeUndefined();
    expect(result.errors.filter(issue => issue.file === OKINAWA)).toEqual([]);
  });

  test('7.1：名物が2件なら誤りにする（3件か0件だけ）', () => {
    deleteIn(dir, HOKKAIDO, ['specialties', 2]);

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: HOKKAIDO, path: 'specialties' });
    expect(errors[0]?.message).toContain('3件か0件');
  });

  test('7.1：名物が4件なら誤りにする', () => {
    setIn(dir, HOKKAIDO, ['specialties', 3], { id: 'x' });

    const { errors } = validateContent(dir);

    expect(errors.some(issue => issue.path === 'specialties' && issue.message.includes('3件か0件'))).toBe(true);
  });

  test('7.1：英語のこども向けの文がなければ誤りにする（場所 specialties[0].description.en）', () => {
    deleteIn(dir, HOKKAIDO, ['specialties', 0, 'description', 'en', 'kids']);

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: HOKKAIDO, path: 'specialties[0].description.en' });
    expect(errors[0]?.message).toContain('「kids」');
  });

  test('7.1：status が draft・verified・reviewed 以外なら誤りにする', () => {
    setIn(dir, TOKYO, ['spots', 1, 'status'], 'done');

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: TOKYO, path: 'spots[1].status' });
    expect(errors[0]?.message).toContain('draft・verified・reviewed');
  });

  test('7.1：出典の URL が https:// でなければ誤りにする', () => {
    setIn(dir, HOKKAIDO, ['specialties', 0, 'sources'], [{ title: '例', url: 'http://example.com/', accessed: '2026-11-11' }]);

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: HOKKAIDO, path: 'specialties[0].sources[0].url' });
    expect(errors[0]?.message).toContain('https://');
  });

  test('7.1：スキーマにない項目は誤りにする', () => {
    setIn(dir, HOKKAIDO, ['capital', 'population'], 100);

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ path: 'capital' });
    expect(errors[0]?.message).toContain('「population」');
  });

  test('7.1：空の文字列は誤りにする', () => {
    setIn(dir, HOKKAIDO, ['name', 'zh'], '');

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ path: 'name.zh' });
    expect(errors[0]?.message).toContain('空');
  });

  test('7.1：型が違えば誤りにする（緯度が文字列）', () => {
    setIn(dir, HOKKAIDO, ['capital', 'lat'], '43.06');

    const { errors } = validateContent(dir);

    expect(errors.map(issue => [issue.path, issue.message])).toEqual([['capital.lat', '型が違います（number にしてください）']]);
  });

  test('7.1：範囲外の数は誤りにする（緯度・経度・所要時間）', () => {
    setIn(dir, HOKKAIDO, ['capital', 'lat'], 10);
    setIn(dir, HOKKAIDO, ['capital', 'lon'], 160);
    setIn(dir, HOKKAIDO, ['access', 'durationMin'], 0);

    const { errors } = validateContent(dir);

    expect(errors.map(issue => [issue.path, issue.message])).toEqual([
      ['capital.lat', '20 以上にしてください'],
      ['capital.lon', '154 以下にしてください'],
      ['access.durationMin', '1 以上にしてください']
    ]);
  });

  test('7.1：id・code の形が違えば誤りにする', () => {
    setIn(dir, HOKKAIDO, ['id'], 'Hokkaido');
    setIn(dir, HOKKAIDO, ['code'], '1');

    const { errors } = validateContent(dir);

    expect(errors.map(issue => issue.path)).toEqual(['id', 'code']);
    expect(errors[0]?.message).toContain('形が合いません');
  });

  test('7.1：空のファイルは、行のない誤りにする', () => {
    writeFileSync(join(dir, HOKKAIDO), '');

    const { errors } = validateContent(dir);

    expect(errors).toEqual([{ file: HOKKAIDO, line: undefined, path: '', message: '型が違います（object にしてください）' }]);
  });

  test('7.1：誤りには、YAML の行が入る', () => {
    setIn(dir, TOKYO, ['spots', 1, 'status'], 'done');

    const { errors } = validateContent(dir);

    expect(errors[0]?.line).toBe(lineOf(dir, TOKYO, 'status: done'));
  });

  test('7.1：YAML の構文の誤りとキーの重複は、行を含む誤りにする', () => {
    writeFileSync(join(dir, HOKKAIDO), 'id: hokkaido\nid: hokkaido\n');
    writeFileSync(join(dir, TOKYO), 'id: [tokyo\n');

    const { errors, prefectures } = validateContent(dir);

    const hokkaido = errors.find(issue => issue.file === HOKKAIDO);
    expect(hokkaido?.line).toBe(2);
    expect(errors.some(issue => issue.file === TOKYO)).toBe(true);
    expect(prefectures.map(pref => pref.id)).toEqual(['okinawa']);
  });
});

// 7.1：ファイル名・ディレクトリ・id
describe('validateContent：ファイルと id', () => {
  test('7.1：ファイル名（NN-id.yaml）と code・id が合わなければ誤りにする', () => {
    setIn(dir, HOKKAIDO, ['id'], 'hokaido');
    setIn(dir, TOKYO, ['code'], '14');

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(2);
    expect(errors.map(issue => issue.file).sort()).toEqual([HOKKAIDO, TOKYO]);
    expect(errors[0]?.message).toContain('01-hokaido.yaml');
  });

  test('7.1：NN-id.yaml の形でないファイルは誤りにする', () => {
    writeFileSync(join(dir, '02-aomori.yml'), '');
    writeFileSync(join(dir, 'aomori.yaml'), '');
    writeFileSync(join(dir, '.gitkeep'), '');

    const { errors } = validateContent(dir);

    expect(errors.map(issue => issue.file).sort()).toEqual(['02-aomori.yml', 'aomori.yaml']);
    expect(errors[0]?.message).toContain('NN-id.yaml');
  });

  test('7.1：県の id・code が重複したら誤りにする', () => {
    writeFileSync(join(dir, '01-tokyo.yaml'), readFileSync(join(dir, TOKYO), 'utf8'));
    setIn(dir, '01-tokyo.yaml', ['code'], '01');

    const { errors } = validateContent(dir);

    const messages = messagesOf(errors);
    expect(messages).toContain('code「01」');
    expect(messages).toContain('id「tokyo」');
  });

  test('7.1：県の中で名物・名所の id が重複したら誤りにする', () => {
    setIn(dir, HOKKAIDO, ['spots', 0, 'id'], 'potato');

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: HOKKAIDO, path: 'spots[0].id' });
    expect(errors[0]?.message).toContain('potato');
  });

  test('7.1：ディレクトリがなければ誤りにする', () => {
    const { errors } = validateContent(join(dir, 'missing'));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('ディレクトリ');
  });

  test('7.1：ディレクトリではなくファイルを指したら誤りにする', () => {
    const { errors } = validateContent(join(dir, HOKKAIDO));

    expect(errors[0]?.message).toContain('ディレクトリ');
  });

  test('7.1：YAML が1つもなければ、誤りなく0件を返す', () => {
    const empty = join(dir, 'empty');
    mkdirSync(empty);
    writeFileSync(join(empty, '.gitkeep'), '');

    const result = validateContent(empty);

    expect(result).toEqual({ prefectures: [], errors: [], warnings: [] });
  });
});

// 7.2：ふりがな
describe('validateContent：ふりがな', () => {
  test('7.2：ふりがなの誤りは、ファイル名と場所（specialties[0].description.ja.kids）と行を含む誤りにする', () => {
    setIn(dir, HOKKAIDO, ['specialties', 0, 'description', 'ja', 'kids'], 'ほくほくの{畑|}でたくさん{育|そだ}つおいもだよ。');

    const { errors } = validateContent(dir);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: HOKKAIDO, path: 'specialties[0].description.ja.kids' });
    expect(errors[0]?.message).toContain('6文字目：読みが空です');
    expect(errors[0]?.line).toBe(lineOf(dir, HOKKAIDO, '{畑|}'));
    expect(formatIssue(errors[0] as ContentIssue)).toMatch(/^01-hokkaido\.yaml:\d+ specialties\[0\]\.description\.ja\.kids 6文字目：/);
  });

  test('7.2：ふりがなの付いていない漢字は警告にする', () => {
    setIn(dir, HOKKAIDO, ['capital', 'name', 'ja'], '札幌市');

    const { errors, warnings } = validateContent(dir);

    expect(errors).toEqual([]);
    expect(warnings.filter(issue => issue.path === 'capital.name.ja').map(issue => issue.message)).toEqual(['1文字目：ふりがなの付いていない漢字「札幌市」があります']);
  });

  test('7.2：ふりがなは日本語の文だけを見る（中国語の漢字・出典のタイトルは警告にしない）', () => {
    setIn(dir, HOKKAIDO, ['specialties', 0, 'sources'], [{ title: '農林水産省のページ', url: 'https://example.com/', accessed: '2026-11-11' }]);

    const { warnings } = validateContent(dir);

    const hokkaido = warnings.filter(issue => issue.file === HOKKAIDO);
    expect(hokkaido.some(issue => issue.message.includes('ふりがな'))).toBe(false);
  });

  test('7.2：行き方・名前など、解説文のほかの日本語の文も見る', () => {
    setIn(dir, HOKKAIDO, ['access', 'route', 'ja'], '{羽田空港|はねだ}→{新千歳|}');

    const { errors } = validateContent(dir);

    expect(errors.map(issue => issue.path)).toEqual(['access.route.ja']);
  });
});

// 7.3：文字数・9.3：出典
describe('validateContent：文字数と出典', () => {
  test('7.3：解説文の文字数が範囲外なら警告にし、誤りにはしない（上限）', () => {
    setIn(dir, HOKKAIDO, ['specialties', 0, 'description', 'ja', 'kids'], 'あ'.repeat(36));

    const { errors, warnings } = validateContent(dir);

    expect(errors).toEqual([]);
    const found = warnings.find(issue => issue.path === 'specialties[0].description.ja.kids');
    expect(found?.message).toBe('文字数が範囲外です（36字。20〜35字）');
  });

  test('7.3：解説文の文字数が範囲外なら警告にし、誤りにはしない（下限）', () => {
    setIn(dir, TOKYO, ['spots', 0, 'description', 'zh', 'adult'], '红白相间的塔。');

    const { errors, warnings } = validateContent(dir);

    expect(errors).toEqual([]);
    const found = warnings.find(issue => issue.path === 'spots[0].description.zh.adult');
    expect(found?.message).toBe('文字数が範囲外です（7字。15〜30字）');
  });

  test('7.3：日本語の文字数は、読みを除いて数える', () => {
    // 読みを含めると35字を超えるが、読みを除くと20字（範囲は20〜35字）
    setIn(dir, HOKKAIDO, ['specialties', 0, 'description', 'ja', 'kids'], '{北海道|ほっかいどう}の{広|ひろ}い{畑|はたけ}で{育|そだ}った{大|おお}きなおいもだよ。');

    const { warnings } = validateContent(dir);

    expect(warnings.find(issue => issue.path === 'specialties[0].description.ja.kids')).toBeUndefined();
  });

  test('7.3：英語は語数で数える', () => {
    setIn(dir, HOKKAIDO, ['spots', 0, 'description', 'en', 'kids'], 'A star castle.');

    const { warnings } = validateContent(dir);

    const found = warnings.find(issue => issue.path === 'spots[0].description.en.kids');
    expect(found?.message).toBe('語数が範囲外です（3語。8〜15語）');
  });

  test('9.3：出典が空なら警告にする', () => {
    const { warnings } = validateContent(dir);

    const paths = warnings.filter(issue => issue.file === HOKKAIDO && issue.message.includes('出典')).map(issue => issue.path);
    expect(paths).toEqual(['access.sources', 'specialties[0].sources', 'specialties[1].sources', 'specialties[2].sources', 'spots[0].sources', 'spots[1].sources', 'spots[2].sources']);
  });

  test('7.1：フィクスチャには、出典が空のほかの警告がない', () => {
    const { warnings } = validateContent(FIXTURE_DIR);

    expect(messagesOf(warnings.filter(issue => !issue.message.includes('出典')))).toBe('');
  });
});

// 7.1：読み込むディレクトリとアプリ用の読み込み
describe('contentDir と loadContent', () => {
  test('7.1：CONTENT_DIR で読み込むディレクトリが変わる', () => {
    expect(contentDir({ CONTENT_DIR: 'tests/fixtures/content' })).toBe('tests/fixtures/content');
  });

  test('7.1：CONTENT_DIR がなければ content/prefectures/ を読む', () => {
    expect(contentDir({})).toBe(DEFAULT_CONTENT_DIR);
    expect(DEFAULT_CONTENT_DIR).toBe('content/prefectures');
  });

  test('7.1：validateContent・loadContent は、ディレクトリを省くと CONTENT_DIR を読む', () => {
    const before = process.env.CONTENT_DIR;
    process.env.CONTENT_DIR = dir;
    try {
      expect(validateContent().prefectures).toHaveLength(3);
      expect(loadContent()).toHaveLength(3);
    } finally {
      if (before === undefined) delete process.env.CONTENT_DIR;
      else process.env.CONTENT_DIR = before;
    }
  });

  test('7.1：loadContent は県を code の順に返す', () => {
    expect(loadContent(dir).map(pref => pref.code)).toEqual(['01', '13', '47']);
  });

  test('7.1：loadContent は誤りがあれば、すべての誤りを含むエラーを投げる', () => {
    setIn(dir, HOKKAIDO, ['region'], 'hokkaidou');
    setIn(dir, TOKYO, ['spots', 1, 'status'], 'done');

    expect(() => loadContent(dir)).toThrow(/01-hokkaido\.yaml:\d+ region[\s\S]*13-tokyo\.yaml:\d+ spots\[1\]\.status/);
  });

  test('7.1：行のない誤りは「ファイル名 場所 メッセージ」の形で出す', () => {
    expect(formatIssue({ file: 'a.yaml', path: '', message: 'm' })).toBe('a.yaml m');
    expect(formatIssue({ file: 'a.yaml', line: 3, path: 'id', message: 'm' })).toBe('a.yaml:3 id m');
  });
});
