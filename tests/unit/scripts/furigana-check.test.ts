import { describe, expect, test } from 'vitest';
import { createLinderaTokenizer } from '../../../scripts/furigana';
import { compareReadings, extractSentences, formatDifference, runCheck } from '../../../scripts/lib/furigana-check';
import type { FuriganaToken, Tokenize } from '../../../scripts/lib/furigana';

/** 偽のトークナイザー：渡したトークンの並びをそのまま返す（辞書を使わない） */
const fake =
  (...tokens: readonly FuriganaToken[]): Tokenize =>
  () =>
    tokens;

describe('compareReadings', () => {
  test('7.2 YAML の読みが辞書の読みと同じなら、何も出さない（送り仮名は括弧の外）', () => {
    const tokenize = fake({ surface: '広い', reading: 'ヒロイ' }, { surface: '畑', reading: 'ハタケ' });

    expect(compareReadings('{広|ひろ}い{畑|はたけ}', tokenize)).toEqual([]);
  });

  test('7.2 YAML の読みが辞書の読みと違えば、表記・YAML の読み・辞書の読みを出す（聖護院）', () => {
    const tokenize = fake({ surface: '聖護院', reading: 'ショウゴイン' }, { surface: 'かぶ', reading: 'カブ' });

    expect(compareReadings('{聖護院|せいごいん}かぶ', tokenize)).toEqual([{ kind: 'differs', surface: '聖護院', yamlReading: 'せいごいん', dictionaryReading: 'しょうごいん' }]);
  });

  test('7.2 辞書の語の区切りが違うときは、YAML の親文字に入る辞書の読みをつないで比べる（総本宮）', () => {
    const tokenize = fake({ surface: '総', reading: 'ソウ' }, { surface: '本宮', reading: 'ホングウ' });

    expect(compareReadings('{総本宮|そうほんぐう}', tokenize)).toEqual([]);
    expect(compareReadings('{総本宮|そうほんぐー}', tokenize)).toEqual([{ kind: 'differs', surface: '総本宮', yamlReading: 'そうほんぐー', dictionaryReading: 'そうほんぐう' }]);
  });

  test('7.2 YAML が漢字のかたまりごとに分けた語（焼き魚）も、辞書の語の中の読みと比べる', () => {
    const tokenize = fake({ surface: '焼き魚', reading: 'ヤキザカナ' });

    expect(compareReadings('{焼|や}き{魚|ざかな}', tokenize)).toEqual([]);
    expect(compareReadings('{焼|や}き{魚|さかな}', tokenize)).toEqual([{ kind: 'differs', surface: '魚', yamlReading: 'さかな', dictionaryReading: 'ざかな' }]);
  });

  test('7.2 区切りが2通りに合う語（物の怪）は、正しい {物|もの}の{怪|け} を違いにせず、比べられないとして出す', () => {
    const tokenize = fake({ surface: '物の怪', reading: 'モノノケ' });

    expect(compareReadings('{物|もの}の{怪|け}', tokenize)).toEqual([
      { kind: 'incomparable', surface: '物', yamlReading: 'もの', reason: 'boundary' },
      { kind: 'incomparable', surface: '怪', yamlReading: 'け', reason: 'boundary' }
    ]);
  });

  test('7.2 辞書の語の一部だけが親文字に入るときは、比べられないとして出す', () => {
    const tokenize = fake({ surface: '総本宮', reading: 'ソウホングウ' });

    expect(compareReadings('{総|そう}本宮', tokenize)).toEqual([{ kind: 'incomparable', surface: '総', yamlReading: 'そう', reason: 'boundary' }]);
  });

  test('7.2 辞書にない語（読みがない）は、比べられないとして出す', () => {
    const tokenize = fake({ surface: '麟' });

    expect(compareReadings('{麟|りん}', tokenize)).toEqual([{ kind: 'incomparable', surface: '麟', yamlReading: 'りん', reason: 'unknown' }]);
  });

  test('7.2 ふりがなの記法に誤りがある文は、比べられないとして出す', () => {
    expect(compareReadings('{京都|きょうと', fake())).toEqual([{ kind: 'incomparable', surface: '{京都|きょうと', yamlReading: '', reason: 'notation' }]);
  });

  test('7.2 辞書の語をつないだ文が、ふりがなを除いた文と合わないときは、比べられないとして出す', () => {
    const tokenize = fake({ surface: '京', reading: 'キョウ' });

    expect(compareReadings('{京都|きょうと}', tokenize)).toEqual([{ kind: 'incomparable', surface: '{京都|きょうと}', yamlReading: '', reason: 'mismatch' }]);
  });

  test('7.2 ふりがなのない文は、辞書を使わずに何も出さない', () => {
    const neverCalled: Tokenize = () => {
      throw new Error('呼ばれない');
    };

    expect(compareReadings('かぶ', neverCalled)).toEqual([]);
  });
});

describe('extractSentences', () => {
  const yaml = [
    '---',
    'id: kyoto',
    'name: {ja: "{京都府|きょうとふ}"}',
    'access:',
    '  mode: {ja: "{新幹線|しんかんせん}", en: "Shinkansen"}',
    '  route:',
    '    ja: "{東京|とうきょう} → {京都|きょうと}"',
    'specialties:',
    '  - id: uji-tea',
    '    name: {ja: "{宇治茶|うじちゃ}", en: "Uji Tea"}',
    '    description:',
    '      ja:',
    '        kids: "{川|かわ}だよ。"',
    '        adult: "{緑茶|りょくちゃ}です。"',
    '      en:',
    '        kids: "Tea."',
    'spots:',
    '  - id: kiyomizu-dera',
    '    name: {ja: "{清水寺|きよみずでら}", en: "Kiyomizu-dera"}'
  ].join('\n');

  test('7.2 名前・解説（こども・おとな）・行き方の日本語の文を、場所と行つきで取り出す（県名は対象外）', () => {
    expect(extractSentences(yaml)).toEqual([
      { path: 'access.mode.ja', line: 5, text: '{新幹線|しんかんせん}' },
      { path: 'access.route.ja', line: 7, text: '{東京|とうきょう} → {京都|きょうと}' },
      { path: 'specialties/uji-tea.name.ja', line: 10, text: '{宇治茶|うじちゃ}' },
      { path: 'specialties/uji-tea.description.ja.kids', line: 13, text: '{川|かわ}だよ。' },
      { path: 'specialties/uji-tea.description.ja.adult', line: 14, text: '{緑茶|りょくちゃ}です。' },
      { path: 'spots/kiyomizu-dera.name.ja', line: 19, text: '{清水寺|きよみずでら}' }
    ]);
  });

  test('7.2 名物・名所が空（未作成）でも、行き方がなくても、失敗しない', () => {
    expect(extractSentences('---\nid: kyoto\nspecialties: []\nspots: []\n')).toEqual([]);
    expect(extractSentences('')).toEqual([]);
  });

  test('7.2 文でない値（数・配列）や id のない項目は、飛ばす', () => {
    expect(extractSentences('specialties:\n  - name: {ja: 1}\n  - 3\nspots: 5\naccess: 2\n')).toEqual([]);
  });

  test('7.2 YAML の構文の誤りは、エラーにする', () => {
    expect(() => extractSentences('a: [\n')).toThrow('YAML');
  });

  test('7.1 `\\` で折り返した文は、つないだ文にして、始まりの行を返す', () => {
    const folded = 'access:\n  mode:\n    ja: "{新幹線|しんかん\\\n      せん}"\n';

    expect(extractSentences(folded)).toEqual([{ path: 'access.mode.ja', line: 3, text: '{新幹線|しんかんせん}' }]);
  });
});

describe('formatDifference', () => {
  test('7.2 違いを「ファイル:行 場所 表記 YAMLの読み／辞書の読み」の形にする', () => {
    const line = formatDifference(
      '26-kyoto.yaml',
      { path: 'specialties/senmaizuke.description.ja.adult', line: 40, text: '' },
      { kind: 'differs', surface: '聖護院', yamlReading: 'せいごいん', dictionaryReading: 'しょうごいん' }
    );

    expect(line).toBe('26-kyoto.yaml:40 specialties/senmaizuke.description.ja.adult 聖護院 せいごいん／しょうごいん：読みが辞書と違う。どちらが正しいか公式の表記で確かめる');
  });

  test('7.2 比べられないものは、理由を添える', () => {
    const sentence = { path: 'a.ja', line: 3, text: '' };

    expect(formatDifference('f.yaml', sentence, { kind: 'incomparable', surface: '総', yamlReading: 'そう', reason: 'boundary' })).toBe(
      'f.yaml:3 a.ja 総 そう：辞書と比べられない（辞書の語が親文字の外にはみ出す）'
    );
    expect(formatDifference('f.yaml', sentence, { kind: 'incomparable', surface: '麟', yamlReading: 'りん', reason: 'unknown' })).toBe('f.yaml:3 a.ja 麟 りん：辞書と比べられない（辞書にない語）');
    expect(formatDifference('f.yaml', sentence, { kind: 'incomparable', surface: '{', yamlReading: '', reason: 'notation' })).toBe('f.yaml:3 a.ja {：辞書と比べられない（ふりがなの記法の誤り）');
    expect(formatDifference('f.yaml', sentence, { kind: 'incomparable', surface: '{', yamlReading: '', reason: 'mismatch' })).toBe('f.yaml:3 a.ja {：辞書と比べられない（辞書の語が文と合わない）');
  });
});

describe('runCheck', () => {
  const source = ['---', 'access:', '  mode: {ja: "{新幹線|しんかんせん}"}', 'spots:', '  - id: a', '    name: {ja: "{聖護院|せいごいん}"}'].join('\n');
  const tokenize: Tokenize = text => (text === '新幹線' ? [{ surface: '新幹線', reading: 'シンカンセン' }] : [{ surface: '聖護院', reading: 'ショウゴイン' }]);

  test('7.2 CLI：違いを標準出力に出し、終了コードは 0（違いがあっても CI の検査ではない）', () => {
    const out: string[] = [];
    const err: string[] = [];

    const code = runCheck(
      ['dir/26-kyoto.yaml'],
      tokenize,
      line => out.push(line),
      line => err.push(line),
      () => source
    );

    expect(code).toBe(0);
    expect(out).toEqual(['dir/26-kyoto.yaml:6 spots/a.name.ja 聖護院 せいごいん／しょうごいん：読みが辞書と違う。どちらが正しいか公式の表記で確かめる', '比べました：2文、違い1件、比べられない0件']);
    expect(err).toEqual([]);
  });

  test('7.2 CLI：ファイルを読めない・YAML の構文の誤りは、標準エラーに出して終了コード 1（ほかのファイルは続ける）', () => {
    const out: string[] = [];
    const err: string[] = [];
    const read = (path: string): string => {
      if (path === 'missing.yaml') throw new Error('ENOENT');
      return path === 'broken.yaml' ? 'a: [\n' : source;
    };

    const code = runCheck(
      ['missing.yaml', 'broken.yaml', 'ok.yaml'],
      tokenize,
      line => out.push(line),
      line => err.push(line),
      read
    );

    expect(code).toBe(1);
    expect(err).toHaveLength(2);
    expect(err[0]).toContain('missing.yaml');
    expect(err[1]).toContain('broken.yaml');
    expect(out.at(-1)).toBe('比べました：2文、違い1件、比べられない0件');
  });

  test('7.2 CLI：パスがなければ、使い方を標準エラーに出して終了コード 1', () => {
    const err: string[] = [];

    expect(
      runCheck(
        [],
        tokenize,
        () => undefined,
        line => err.push(line),
        () => ''
      )
    ).toBe(1);
    expect(err[0]).toContain('--check');
  });
});

describe('compareReadings（実際の辞書）', () => {
  test('7.2 実際の辞書：空白を含む文（東京 → 京都、JR 東海道新幹線）も比べられる', { timeout: 30_000 }, () => {
    const tokenize = createLinderaTokenizer();

    expect(compareReadings('{東京|とうきょう} → {京都|きょうと}', tokenize)).toEqual([]);
    expect(compareReadings('JR {東海道新幹線|とうかいどうしんかんせん}', tokenize)).toEqual([]);
  });

  test('7.2 {聖護院|せいごいん} は違いとして出る。{聖護院|しょうごいん}・{総本宮|そうほんぐう} は出ない', { timeout: 30_000 }, () => {
    // Arrange
    const tokenize = createLinderaTokenizer();

    // Act・Assert
    expect(compareReadings('{聖護院|せいごいん}かぶを{薄|うす}く{切|き}る', tokenize)).toEqual([{ kind: 'differs', surface: '聖護院', yamlReading: 'せいごいん', dictionaryReading: 'しょうごいん' }]);
    expect(compareReadings('{聖護院|しょうごいん}かぶを{薄|うす}く{切|き}る', tokenize)).toEqual([]);
    expect(compareReadings('{稲荷|いなり}{神社|じんじゃ}の{総本宮|そうほんぐう}', tokenize)).toEqual([]);
  });
});
